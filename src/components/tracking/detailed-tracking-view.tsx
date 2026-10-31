"use client";

import { useQuery } from "@tanstack/react-query";
import { AdvancedMarker, APIProvider, Map as GoogleMap } from "@vis.gl/react-google-maps";
import {
  AlertTriangle,
  BarChart2,
  Bike,
  Calendar,
  Car,
  CarFront,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns,
  Download,
  Grid,
  List,
  Map as MapIcon,
  MapPin,
  Pencil,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  Truck,
  User,
  X,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { downloadSheet } from "@/components/masters/excel";
import { VehiclesHeaderBanner } from "@/components/masters/vehicles-header-banner";
import { gqlRequest } from "@/lib/graphql/client";
import {
  GET_POSITION_HISTORY,
  type PositionHistoryResult,
} from "@/lib/graphql/operations";
import { useVmLookups } from "@/lib/vehicle-management/use-vm";
import { cn } from "@/lib/utils";

export type VehicleStatus = "stopped" | "running" | "idle" | "noGps" | "noData";

export interface DetailedVehicleRow {
  id: string;
  vehicleNo: string;
  vehicleName?: string | null;
  driverId: string;
  driverName: string;
  vehicleTypeId: string;
  vehicleType: string;
  location: string;
  hasGps: boolean;
  lat: number | null;
  lng: number | null;
  ignition: boolean;
  speed: number;
  timeDate: string;
  timeClock: string;
  rawTime: string;
  odometer: number;
  temp1: string;
  temp2: string;
  temp3: string;
  status: VehicleStatus;
  category: "truck" | "van" | "bike" | "car";
}

function formatDateDisplay(iso: string): string {
  if (!iso) return "31-Oct-2026";
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return iso;
  const [y, m, d] = parts;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d).padStart(2, "0")}-${months[m - 1] ?? "Oct"}-${y}`;
}

function formatTimeDisplay(timeStr: string): string {
  if (!timeStr) return "12:00 AM";
  const parts = timeStr.split(":").map(Number);
  if (parts.length < 2 || parts.some(isNaN)) return timeStr;
  const [hh, mm] = parts;
  const period = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${String(h12).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${period}`;
}

function resolveLocation(lat: number, lng: number): string {
  if (Math.abs(lat - 25.0772) < 0.15 && Math.abs(lng - 55.1409) < 0.15) {
    return "Dubai Marina, Sheikh Zayed Road, Dubai - United Arab Emirates";
  }
  if (Math.abs(lat - 25.1972) < 0.15 && Math.abs(lng - 55.2744) < 0.15) {
    return "Downtown Dubai, Sheikh Mohammed bin Rashid Blvd - Dubai";
  }
  if (Math.abs(lat - 24.9857) < 0.15 && Math.abs(lng - 55.1409) < 0.15) {
    return "Jebel Ali Industrial Area, Dubai - United Arab Emirates";
  }
  if (Math.abs(lat - 22.687) < 0.5 && Math.abs(lng - 72.843) < 0.5) {
    return "Anand District, Gujarat, India";
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function DetailedTrackingView() {
  const t = useTranslations("tracking.detailed");
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  // 1. Company-Scoped Lookups: automatically scopes vehicles, drivers & vehicleTypes company-wise
  const lookups = useVmLookups();

  // Filter state
  const [activeFilterStatus, setActiveFilterStatus] = useState<VehicleStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Date/Time pickers state
  const [fromDate, setFromDate] = useState("2026-10-31");
  const [fromTime, setFromTime] = useState("00:00");
  const [toDate, setToDate] = useState("2026-10-31");
  const [toTime, setToTime] = useState("23:59");

  // Auto-refresh state
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(60);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Table selections & view
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [mapModalVehicle, setMapModalVehicle] = useState<DetailedVehicleRow | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 2. Fetch real DB vehicles with live GPS positions (scoped company-wise)
  const scopedVehicles = lookups.vehicles;
  const scopedDrivers = lookups.drivers;
  const scopedTypes = lookups.vehicleTypes;

  const driverMap = useMemo(() => new Map(scopedDrivers.map((d) => [d.id, d])), [scopedDrivers]);
  const typeMap = useMemo(() => new Map(scopedTypes.map((typ) => [typ.id, typ.name])), [scopedTypes]);

  const vehiclesQuery = useQuery({
    queryKey: ["detailed-tracking", "vehicles-live", scopedVehicles.map((v) => v.id).join(",")],
    queryFn: async () => {
      const rows: DetailedVehicleRow[] = await Promise.all(
        scopedVehicles.map(async (v) => {
          const assignedDriver = v.primaryDriverId ? driverMap.get(v.primaryDriverId) : null;
          const typeName = v.vehicleTypeId ? typeMap.get(v.vehicleTypeId) : null;

          const combined = `${v.plateNo} ${v.vehicleName ?? ""} ${typeName ?? ""}`.toLowerCase();
          const category: "truck" | "van" | "bike" | "car" = combined.includes("bike")
            ? "bike"
            : combined.includes("van")
              ? "van"
              : combined.includes("truck") || combined.includes("verify")
                ? "truck"
                : "car";

          const vehicleType = typeName || (category === "truck" ? "Truck" : category === "van" ? "Van" : category === "bike" ? "Bike" : "Car");
          const driverId = assignedDriver?.employeeId || (assignedDriver ? `EMP-${assignedDriver.id}` : "-");
          const driverName = assignedDriver?.name || "Unassigned";

          let lat: number | null = null;
          let lng: number | null = null;
          let speed = 0;
          let timeDate = "-";
          let timeClock = "";
          let rawTime = "-";
          let ignition = false;
          let status: VehicleStatus = "stopped";
          let location = "No GPS fix available";
          let hasGps = false;

          try {
            const pRes = await gqlRequest<PositionHistoryResult>(GET_POSITION_HISTORY, {
              vehicleId: v.id,
              first: 5,
            });
            const valid = (pRes.positionHistory?.data ?? []).find(
              (p) => typeof p.locationLat === "number" && typeof p.locationLng === "number" && Math.abs(p.locationLat) > 0.01,
            );

            if (valid && typeof valid.locationLat === "number" && typeof valid.locationLng === "number") {
              lat = valid.locationLat;
              lng = valid.locationLng;
              speed = Math.round(valid.speed ?? 0);
              ignition = speed > 0;
              status = speed > 3 ? "running" : speed > 0 ? "idle" : "stopped";
              rawTime = valid.recordedAt || "-";
              if (valid.recordedAt && valid.recordedAt.includes(" ")) {
                const [dPart, tPart] = valid.recordedAt.split(" ");
                timeDate = dPart;
                timeClock = tPart;
              } else {
                timeDate = valid.recordedAt || "-";
              }
              location = resolveLocation(lat, lng);
              hasGps = true;
            } else {
              status = "noGps";
              location = "No GPS fix available";
              hasGps = false;
            }
          } catch {
            status = "noData";
            location = "Telemetry disconnected";
            hasGps = false;
          }

          return {
            id: v.id,
            vehicleNo: v.plateNo,
            vehicleName: v.vehicleName,
            driverId,
            driverName,
            vehicleTypeId: v.vehicleTypeId || "",
            vehicleType,
            location,
            hasGps,
            lat,
            lng,
            ignition,
            speed,
            timeDate,
            timeClock,
            rawTime,
            odometer: v.odometerKm ?? 0,
            temp1: "0.00",
            temp2: "0.00",
            temp3: "0.00",
            status,
            category,
          };
        }),
      );

      return rows;
    },
    enabled: scopedVehicles.length > 0,
    refetchInterval: autoRefresh ? refreshIntervalSec * 1000 : false,
  });

  const allVehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);

  // Status counts matching exact 6 cards from the mockup
  const counts = useMemo(() => {
    let running = 0;
    let stopped = 0;
    let idle = 0;
    let noGps = 0;
    let noData = 0;

    allVehicles.forEach((v) => {
      if (v.status === "running") running++;
      else if (v.status === "stopped") stopped++;
      else if (v.status === "idle") idle++;
      else if (v.status === "noGps") noGps++;
      else if (v.status === "noData") noData++;
    });

    return {
      running,
      stopped,
      idle,
      noGps,
      noData,
      total: allVehicles.length,
    };
  }, [allVehicles]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return allVehicles.filter((v) => {
      if (activeFilterStatus !== "all" && v.status !== activeFilterStatus) return false;
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (typeFilter !== "all" && v.vehicleTypeId !== typeFilter) return false;
      if (driverFilter !== "all" && v.driverId !== driverFilter && v.driverName !== driverFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNo = v.vehicleNo.toLowerCase().includes(q);
        const matchName = (v.vehicleName || "").toLowerCase().includes(q);
        const matchDriver = v.driverName.toLowerCase().includes(q);
        const matchLoc = v.location.toLowerCase().includes(q);
        if (!matchNo && !matchName && !matchDriver && !matchLoc) return false;
      }
      return true;
    });
  }, [allVehicles, activeFilterStatus, statusFilter, typeFilter, driverFilter, searchQuery]);

  // Reset all filters
  const handleReset = () => {
    setSearchQuery("");
    setTypeFilter("all");
    setDriverFilter("all");
    setStatusFilter("all");
    setActiveFilterStatus("all");
    setFromDate("2026-10-31");
    setFromTime("00:00");
    setToDate("2026-10-31");
    setToTime("23:59");
  };

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredRows.map((v) => v.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Export to Excel
  const handleExport = async () => {
    const headers = [
      "Vehicle No",
      "Driver Id",
      "Vehicle Type",
      "Driver Name",
      "Location",
      "Ignition",
      "Speed (Km/h)",
      "Time",
      "GPS Status",
      "Alert",
      "Odometer",
      "Temp1",
      "Temp2",
      "Temp3",
    ];
    const rows = filteredRows.map((v) => [
      v.vehicleNo,
      v.driverId,
      v.vehicleType,
      v.driverName,
      v.location,
      v.ignition ? "ON" : "OFF",
      v.speed,
      v.rawTime,
      v.hasGps ? "Connected" : "No GPS",
      "Normal",
      v.odometer,
      v.temp1,
      v.temp2,
      v.temp3,
    ]);
    await downloadSheet([headers, ...rows], "detailed-tracking.xlsx");
  };

  // Copy share link
  const handleShare = (vehicle: DetailedVehicleRow) => {
    const url = `${window.location.origin}/live?vehicle=${encodeURIComponent(vehicle.vehicleNo)}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(vehicle.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const allSelected = filteredRows.length > 0 && filteredRows.every((v) => selectedIds.has(v.id));

  return (
    <div className="grid gap-5 text-foreground select-none">
      {/* 1. HEADER CARD: Title, Description, Scenic Banner, Breadcrumbs, Export */}
      <div className="bg-surface rounded-2xl border border-border/70 p-4 sm:p-5 shadow-sm flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="size-11 rounded-2xl bg-emerald-50 text-[#00897b] flex items-center justify-center shrink-0 shadow-xs border border-emerald-100/60">
            <MapPin className="size-5.5 stroke-[2]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("description")}</p>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-5 min-w-0">
          <VehiclesHeaderBanner className="flex-1 max-w-[650px] justify-center" />
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
              <span>Track</span>
              <ChevronRight className="size-3 text-muted-foreground/60" />
              <span className="text-foreground">Detailed Tracking</span>
            </div>
            <button
              type="button"
              onClick={handleExport}
              className="h-9 rounded-xl px-3.5 text-xs font-semibold border border-border/80 bg-surface hover:bg-surface-2 text-foreground inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Download className="size-3.5 text-muted-foreground" />
              <span>Export</span>
              <ChevronDown className="size-3 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. SIX KPI STATUS CARDS (Matching Pastel Palette from Mockup) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* Running */}
        <div
          onClick={() => setActiveFilterStatus((prev) => (prev === "running" ? "all" : "running"))}
          className={cn(
            "rounded-2xl border p-3.5 shadow-xs flex items-center justify-between cursor-pointer transition-all bg-[#ecfdf5] dark:bg-emerald-950/25 border-[#a7f3d0] dark:border-emerald-800/40",
            activeFilterStatus === "running"
              ? "ring-2 ring-emerald-500/40 border-emerald-500"
              : "hover:border-emerald-400/80",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-[#d1fae5] dark:bg-emerald-900/60 text-emerald-600 flex items-center justify-center shrink-0">
              <Truck className="size-5 stroke-[2]" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Running</p>
              <p className="text-2xl font-bold text-foreground mt-0.5 leading-none">{counts.running}</p>
            </div>
          </div>
        </div>

        {/* Stopped */}
        <div
          onClick={() => setActiveFilterStatus((prev) => (prev === "stopped" ? "all" : "stopped"))}
          className={cn(
            "rounded-2xl border p-3.5 shadow-xs flex items-center justify-between cursor-pointer transition-all bg-[#fff1f2] dark:bg-rose-950/25 border-[#fecdd3] dark:border-rose-800/40",
            activeFilterStatus === "stopped"
              ? "ring-2 ring-rose-500/40 border-rose-500"
              : "hover:border-rose-400/80",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-[#ffe4e6] dark:bg-rose-900/60 flex items-center justify-center shrink-0">
              <div className="size-4.5 rounded-sm bg-[#ef4444] flex items-center justify-center text-white shadow-2xs">
                <Truck className="size-3 fill-current" />
              </div>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Stopped</p>
              <p className="text-2xl font-bold text-foreground mt-0.5 leading-none">{counts.stopped}</p>
            </div>
          </div>
        </div>

        {/* Idle */}
        <div
          onClick={() => setActiveFilterStatus((prev) => (prev === "idle" ? "all" : "idle"))}
          className={cn(
            "rounded-2xl border p-3.5 shadow-xs flex items-center justify-between cursor-pointer transition-all bg-[#fffbeb] dark:bg-amber-950/25 border-[#fde68a] dark:border-amber-800/40",
            activeFilterStatus === "idle"
              ? "ring-2 ring-amber-500/40 border-amber-500"
              : "hover:border-amber-400/80",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-[#fef3c7] dark:bg-amber-900/60 flex items-center justify-center shrink-0">
              <span className="size-4.5 rounded-full bg-[#f59e0b] text-white flex items-center justify-center text-[9px] font-black tracking-tighter">
                ||
              </span>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Idle</p>
              <p className="text-2xl font-bold text-foreground mt-0.5 leading-none">{counts.idle}</p>
            </div>
          </div>
        </div>

        {/* No GPS */}
        <div
          onClick={() => setActiveFilterStatus((prev) => (prev === "noGps" ? "all" : "noGps"))}
          className={cn(
            "rounded-2xl border p-3.5 shadow-xs flex items-center justify-between cursor-pointer transition-all bg-[#f0f9ff] dark:bg-sky-950/25 border-[#bae6fd] dark:border-sky-800/40",
            activeFilterStatus === "noGps"
              ? "ring-2 ring-sky-500/40 border-sky-500"
              : "hover:border-sky-400/80",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-[#e0f2fe] dark:bg-sky-900/60 text-[#0284c7] flex items-center justify-center shrink-0">
              <Radio className="size-5 stroke-[2]" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">No GPS</p>
              <p className="text-2xl font-bold text-foreground mt-0.5 leading-none">{counts.noGps}</p>
            </div>
          </div>
        </div>

        {/* No Data */}
        <div
          onClick={() => setActiveFilterStatus((prev) => (prev === "noData" ? "all" : "noData"))}
          className={cn(
            "rounded-2xl border p-3.5 shadow-xs flex items-center justify-between cursor-pointer transition-all bg-[#f8fafc] dark:bg-slate-900/30 border-[#e2e8f0] dark:border-slate-800/40",
            activeFilterStatus === "noData"
              ? "ring-2 ring-slate-500/40 border-slate-500"
              : "hover:border-slate-400/80",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-[#e2e8f0] dark:bg-slate-800 text-[#64748b] flex items-center justify-center shrink-0">
              <BarChart2 className="size-5 stroke-[2]" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">No Data</p>
              <p className="text-2xl font-bold text-foreground mt-0.5 leading-none">{counts.noData}</p>
            </div>
          </div>
        </div>

        {/* Total Vehicles */}
        <div
          onClick={() => setActiveFilterStatus("all")}
          className={cn(
            "bg-surface rounded-2xl border border-border/70 p-3.5 shadow-xs flex items-center justify-between cursor-pointer transition-all",
            activeFilterStatus === "all"
              ? "border-primary ring-2 ring-primary/20"
              : "border-border/70 hover:border-primary/60",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-surface-2 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
              <Car className="size-5 stroke-[1.75]" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Total Vehicles</p>
              <p className="text-2xl font-bold text-foreground mt-0.5 leading-none">{counts.total}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. FILTER & SEARCH CONTROL CARD */}
      <div className="bg-surface rounded-2xl border border-border/70 p-4 shadow-sm flex flex-col gap-3.5">
        {/* ROW 1: Wide Search Input + Refresh Interval + Toggle Auto-refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[280px]">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by vehicle no., driver, location..."
              className="h-10 w-full rounded-xl border border-border/80 bg-surface ps-9.5 pe-3.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
            />
          </div>

          {/* Refresh controls */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={5}
                max={600}
                value={refreshIntervalSec}
                onChange={(e) => setRefreshIntervalSec(Math.max(5, Number(e.target.value) || 60))}
                className="w-12 h-9 rounded-xl border border-border/80 bg-surface text-center font-semibold text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
              />
              <div className="size-9 rounded-xl border border-border/80 bg-surface flex items-center justify-center text-muted-foreground shadow-2xs">
                <Calendar className="size-4" />
              </div>
              <span className="text-muted-foreground font-medium text-xs">Sec</span>
            </div>

            {/* Auto refresh pill toggle */}
            <div className="flex items-center gap-2 ps-2 border-s border-border/60">
              <button
                type="button"
                role="switch"
                aria-checked={autoRefresh}
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
                  autoRefresh ? "bg-[#0f4c47]" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                    autoRefresh ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </button>
              <span className="text-xs font-semibold text-foreground">Auto refresh</span>
            </div>
          </div>
        </div>

        {/* ROW 2: Dropdowns (Vehicle Type, Driver, Status) [NO Company dropdown] + Date/Time pickers + Search & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/40">
          {/* Left: 3 Filter Selects with Pill Shape matching mockup */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Vehicle Type */}
            <div className="flex flex-col">
              <label className="text-[10px] font-medium text-muted-foreground mb-0.5">Vehicle Type</label>
              <div className="relative min-w-[130px]">
                <Truck className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="h-9 w-full rounded-full border border-border/80 bg-surface ps-8.5 pe-7 text-xs font-semibold text-foreground appearance-none cursor-pointer focus:outline-none focus:border-primary shadow-2xs"
                >
                  <option value="all">All</option>
                  {scopedTypes.map((typ) => (
                    <option key={typ.id} value={typ.id}>{typ.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              </div>
            </div>

            {/* Driver */}
            <div className="flex flex-col">
              <label className="text-[10px] font-medium text-muted-foreground mb-0.5">Driver</label>
              <div className="relative min-w-[140px]">
                <User className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <select
                  value={driverFilter}
                  onChange={(e) => setDriverFilter(e.target.value)}
                  className="h-9 w-full rounded-full border border-border/80 bg-surface ps-8.5 pe-7 text-xs font-semibold text-foreground appearance-none cursor-pointer focus:outline-none focus:border-primary shadow-2xs"
                >
                  <option value="all">All</option>
                  {scopedDrivers.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              </div>
            </div>

            {/* Status */}
            <div className="flex flex-col">
              <label className="text-[10px] font-medium text-muted-foreground mb-0.5">Status</label>
              <div className="relative min-w-[120px]">
                <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 size-2.5 rounded-full border-2 border-muted-foreground" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 w-full rounded-full border border-border/80 bg-surface ps-8 pe-7 text-xs font-semibold text-foreground appearance-none cursor-pointer focus:outline-none focus:border-primary shadow-2xs"
                >
                  <option value="all">All</option>
                  <option value="running">Running</option>
                  <option value="stopped">Stopped</option>
                  <option value="idle">Idle</option>
                  <option value="noGps">No GPS</option>
                  <option value="noData">No Data</option>
                </select>
                <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Right: Date & Time pickers + Action Buttons */}
          <div className="flex flex-wrap items-end gap-2 ms-auto">
            {/* From date */}
            <div className="flex flex-col">
              <label className="text-[10px] font-medium text-muted-foreground mb-0.5">From date</label>
              <div className="relative">
                <input
                  type="text"
                  value={formatDateDisplay(fromDate)}
                  readOnly
                  className="h-8.5 w-26 rounded-xl border border-border/80 bg-surface px-2.5 text-xs font-medium text-foreground text-center shadow-2xs cursor-pointer"
                />
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch {}
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>
            </div>

            {/* From time */}
            <div className="flex flex-col">
              <label className="text-[10px] font-medium text-muted-foreground mb-0.5">From time</label>
              <div className="relative">
                <input
                  type="text"
                  value={formatTimeDisplay(fromTime)}
                  readOnly
                  className="h-8.5 w-24 rounded-xl border border-border/80 bg-surface ps-2.5 pe-6 text-xs font-medium text-foreground shadow-2xs cursor-pointer"
                />
                <Clock className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <input
                  type="time"
                  value={fromTime}
                  onChange={(e) => setFromTime(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch {}
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>
            </div>

            {/* To date */}
            <div className="flex flex-col">
              <label className="text-[10px] font-medium text-muted-foreground mb-0.5">To date</label>
              <div className="relative">
                <input
                  type="text"
                  value={formatDateDisplay(toDate)}
                  readOnly
                  className="h-8.5 w-26 rounded-xl border border-border/80 bg-surface px-2.5 text-xs font-medium text-foreground text-center shadow-2xs cursor-pointer"
                />
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch {}
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>
            </div>

            {/* To time */}
            <div className="flex flex-col">
              <label className="text-[10px] font-medium text-muted-foreground mb-0.5">To time</label>
              <div className="relative">
                <input
                  type="text"
                  value={formatTimeDisplay(toTime)}
                  readOnly
                  className="h-8.5 w-24 rounded-xl border border-border/80 bg-surface ps-2.5 pe-6 text-xs font-medium text-foreground shadow-2xs cursor-pointer"
                />
                <Clock className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <input
                  type="time"
                  value={toTime}
                  onChange={(e) => setToTime(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch {}
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>
            </div>

            {/* Search Button */}
            <button
              type="button"
              onClick={() => vehiclesQuery.refetch()}
              className="h-8.5 px-4 rounded-xl bg-[#0f4c47] hover:bg-[#0c3e3a] text-white font-semibold text-xs inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Search className="size-3.5" />
              <span>Search</span>
            </button>

            {/* Reset Button */}
            <button
              type="button"
              onClick={handleReset}
              className="h-8.5 px-3 rounded-xl border border-border/80 bg-surface hover:bg-surface-2 text-foreground font-semibold text-xs inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <RotateCcw className="size-3.5 text-muted-foreground" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. VEHICLES DATA TABLE CARD */}
      <div className="bg-surface rounded-2xl border border-border/70 shadow-sm overflow-hidden flex flex-col">
        {/* Table Top Toolbar */}
        <div className="p-3.5 border-b border-border/60 flex items-center justify-between gap-3">
          {/* Left Title with Truck Icon */}
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Truck className="size-4" />
            </div>
            <h2 className="text-sm font-bold text-foreground">
              Vehicles ({filteredRows.length})
            </h2>
          </div>

          {/* Right Controls: Columns dropdown + Show entries + List/Grid view switch */}
          <div className="flex items-center gap-2.5">
            {/* Columns button */}
            <button
              type="button"
              className="h-8 px-2.5 rounded-lg border border-border/80 bg-surface text-xs font-medium inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground shadow-2xs cursor-pointer"
            >
              <Columns className="size-3.5 text-muted-foreground" />
              <span>Columns</span>
              <ChevronDown className="size-3" />
            </button>

            {/* Show entries */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-lg border border-border/80 bg-surface px-2 text-xs font-semibold text-foreground focus:outline-none cursor-pointer shadow-2xs"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            {/* View Mode Switches */}
            <div className="flex items-center rounded-lg border border-border/80 p-0.5 bg-surface-2">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={cn(
                  "p-1.5 rounded-md text-xs transition-colors cursor-pointer",
                  viewMode === "table" ? "bg-surface shadow-xs text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                title="Table view"
              >
                <List className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-1.5 rounded-md text-xs transition-colors cursor-pointer",
                  viewMode === "grid" ? "bg-surface shadow-xs text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                title="Grid view"
              >
                <Grid className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
            {/* Table Header */}
            <thead className="bg-[#f8fafc] dark:bg-slate-900 border-b border-border/70 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="py-2.5 px-3 w-8 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="size-3.5 rounded border-border-strong accent-[#0f4c47] cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-3 min-w-[140px]">Vehicle No.</th>
                <th className="py-2.5 px-3 min-w-[100px]">Driver Id</th>
                <th className="py-2.5 px-3 min-w-[110px]">Vehicle Type</th>
                <th className="py-2.5 px-3 min-w-[120px]">Driver Name</th>
                <th className="py-2.5 px-3 min-w-[280px]">Location</th>
                <th className="py-2.5 px-3 text-center min-w-[80px]">• Ignition •</th>
                <th className="py-2.5 px-3 text-right min-w-[90px]">Speed (Km/h)</th>
                <th className="py-2.5 px-3 min-w-[120px]">Time</th>
                <th className="py-2.5 px-3 text-center min-w-[60px]">GPS</th>
                <th className="py-2.5 px-3 text-center min-w-[60px]">Alert</th>
                <th className="py-2.5 px-3 text-right min-w-[90px]">Odometer</th>
                <th className="py-2.5 px-3 text-right min-w-[70px]">Temp1.</th>
                <th className="py-2.5 px-3 text-right min-w-[70px]">Temp2.</th>
                <th className="py-2.5 px-3 text-right min-w-[70px]">Temp3.</th>
                <th className="py-2.5 px-3 text-center min-w-[55px]">Map</th>
                <th className="py-2.5 px-3 text-center min-w-[55px]">Share</th>
                <th className="py-2.5 px-3 text-center min-w-[80px]">Actions</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-border/60">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={18} className="py-12 text-center text-muted-foreground text-xs">
                    {vehiclesQuery.isLoading ? (
                      <span className="inline-flex items-center gap-2">
                        <RefreshCw className="size-4 animate-spin text-primary" />
                        Loading vehicles from database...
                      </span>
                    ) : (
                      "No vehicles found matching the current filters."
                    )}
                  </td>
                </tr>
              ) : (
                filteredRows.map((v) => {
                  const isChecked = selectedIds.has(v.id);
                  return (
                    <tr
                      key={v.id}
                      className={cn(
                        "transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40 select-none",
                        isChecked && "bg-sky-50/50 dark:bg-sky-950/30",
                      )}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelect(v.id)}
                          className="size-3.5 rounded border-border-strong accent-[#0f4c47] cursor-pointer"
                        />
                      </td>

                      {/* Vehicle No */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          {v.category === "bike" ? (
                            <Bike className="size-4.5 text-amber-500 shrink-0" />
                          ) : v.category === "van" ? (
                            <CarFront className="size-4.5 text-emerald-600 shrink-0" />
                          ) : (
                            <Truck className="size-4.5 text-emerald-600 shrink-0" />
                          )}
                          <div className="flex flex-col">
                            <span className="font-bold text-xs text-foreground tracking-tight">{v.vehicleNo}</span>
                            {v.vehicleName && (
                              <span className="text-[11px] text-muted-foreground font-normal">
                                ({v.vehicleName})
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Driver Id */}
                      <td className="py-3 px-3 text-muted-foreground font-medium text-xs">{v.driverId}</td>

                      {/* Vehicle Type with Badges */}
                      <td className="py-3 px-3">
                        {v.vehicleType === "Truck" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200/60">
                            <Truck className="size-3" />
                            <span>Truck</span>
                          </span>
                        ) : v.vehicleType === "Van" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200/60">
                            <CarFront className="size-3" />
                            <span>Van</span>
                          </span>
                        ) : v.vehicleType === "Bike" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60">
                            <Bike className="size-3" />
                            <span>Bike</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60">
                            <Car className="size-3" />
                            <span>{v.vehicleType}</span>
                          </span>
                        )}
                      </td>

                      {/* Driver Name */}
                      <td className="py-3 px-3 font-semibold text-foreground text-xs">{v.driverName}</td>

                      {/* Location */}
                      <td className="py-3 px-3 text-xs max-w-[320px]">
                        {v.hasGps ? (
                          <div className="flex items-center gap-1.5 text-muted-foreground truncate" title={v.location}>
                            <MapPin className="size-3.5 text-emerald-600 shrink-0" />
                            <span className="truncate">{v.location}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-muted-foreground/80">
                            <Zap className="size-3 text-muted-foreground/60 shrink-0" />
                            <span>No GPS fix available</span>
                          </div>
                        )}
                      </td>

                      {/* Ignition */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center">
                          <Zap
                            className={cn(
                              "size-4",
                              v.ignition
                                ? "text-emerald-500 fill-emerald-500"
                                : "text-slate-300 dark:text-slate-600 fill-transparent",
                            )}
                          />
                        </div>
                      </td>

                      {/* Speed (Km/h) */}
                      <td className="py-3 px-3 text-right font-semibold text-foreground text-xs">{v.speed}</td>

                      {/* Time: Two-line display matching mockup */}
                      <td className="py-3 px-3 text-muted-foreground font-mono text-[11px] leading-tight">
                        {v.timeDate === "-" ? (
                          "-"
                        ) : (
                          <div className="flex flex-col">
                            <span>{v.timeDate}</span>
                            {v.timeClock && <span className="text-[10px] text-muted-foreground/80">{v.timeClock}</span>}
                          </div>
                        )}
                      </td>

                      {/* GPS */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center">
                          <Radio
                            className={cn(
                              "size-4",
                              v.hasGps ? "text-emerald-600" : "text-rose-500",
                            )}
                          />
                        </div>
                      </td>

                      {/* Alert */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center">
                          <AlertTriangle className="size-4 text-emerald-600 stroke-[2]" />
                        </div>
                      </td>

                      {/* Odometer */}
                      <td className="py-3 px-3 text-right font-medium text-muted-foreground text-xs">
                        {v.odometer.toLocaleString()}
                      </td>

                      {/* Temp1 */}
                      <td className="py-3 px-3 text-right font-mono text-muted-foreground text-xs">{v.temp1}</td>

                      {/* Temp2 */}
                      <td className="py-3 px-3 text-right font-mono text-muted-foreground text-xs">{v.temp2}</td>

                      {/* Temp3 */}
                      <td className="py-3 px-3 text-right font-mono text-muted-foreground text-xs">{v.temp3}</td>

                      {/* Map Button */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setMapModalVehicle(v)}
                          title={`View ${v.vehicleNo} on map`}
                          className="inline-flex size-6 items-center justify-center text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
                        >
                          <MapIcon className="size-4" />
                        </button>
                      </td>

                      {/* Share Button */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleShare(v)}
                          title="Copy share link"
                          className="inline-flex size-6 items-center justify-center text-sky-600 hover:text-sky-700 transition-colors cursor-pointer"
                        >
                          {copiedId === v.id ? <Check className="size-3.5 text-emerald-600" /> : <Share2 className="size-3.5" />}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                          <button
                            type="button"
                            title="Edit vehicle"
                            className="hover:text-foreground transition-colors cursor-pointer"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete vehicle"
                            className="hover:text-rose-500 transition-colors cursor-pointer"
                          >
                            <Trash2 className="size-3.5 text-rose-400 hover:text-rose-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer: Showing X of Y + Pagination */}
        <div className="p-3.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing <strong className="text-foreground">{filteredRows.length}</strong> of{" "}
            <strong className="text-foreground">{allVehicles.length}</strong> vehicles
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="size-7 rounded-lg border border-border/80 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40 cursor-pointer shadow-2xs"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="size-7 rounded-lg bg-[#0f4c47] text-white font-bold flex items-center justify-center text-xs shadow-2xs">
              1
            </span>
            <button
              type="button"
              disabled
              className="size-7 rounded-lg border border-border/80 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40 cursor-pointer shadow-2xs"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 5. GOOGLE MAP MODAL */}
      {mapModalVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface-2">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <MapIcon className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    {mapModalVehicle.vehicleNo} &mdash; {mapModalVehicle.vehicleName || mapModalVehicle.vehicleType}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Driver: {mapModalVehicle.driverName} ({mapModalVehicle.driverId})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMapModalVehicle(null)}
                className="size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface flex items-center justify-center cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="h-80 w-full relative bg-surface-2">
              {apiKey && mapModalVehicle.lat && mapModalVehicle.lng ? (
                <APIProvider apiKey={apiKey}>
                  <GoogleMap
                    className="size-full"
                    mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"}
                    defaultCenter={{ lat: mapModalVehicle.lat, lng: mapModalVehicle.lng }}
                    defaultZoom={15}
                    gestureHandling="greedy"
                  >
                    <AdvancedMarker position={{ lat: mapModalVehicle.lat, lng: mapModalVehicle.lng }}>
                      <div className="grid size-10 place-items-center rounded-full bg-[#00897b] text-white ring-4 ring-white shadow-xl animate-bounce">
                        <Truck className="size-5" />
                      </div>
                    </AdvancedMarker>
                  </GoogleMap>
                </APIProvider>
              ) : (
                <div className="size-full flex items-center justify-center text-muted-foreground text-xs">
                  No GPS coordinates recorded in database for this vehicle.
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border flex flex-wrap items-center justify-between gap-3 bg-surface text-xs">
              <div>
                <p className="font-semibold text-foreground">Location:</p>
                <p className="text-muted-foreground text-[11px]">{mapModalVehicle.location}</p>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Speed</span>
                  <span className="font-bold text-foreground">{mapModalVehicle.speed} km/h</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Odometer</span>
                  <span className="font-bold text-foreground">{mapModalVehicle.odometer.toLocaleString()} km</span>
                </div>
                <a
                  href={`/live?vehicle=${encodeURIComponent(mapModalVehicle.vehicleNo)}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary-hover shadow-sm"
                >
                  <span>Open Live Track</span>
                  <ChevronRight className="size-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
