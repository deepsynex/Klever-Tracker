"use client";

import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Bike,
  Car,
  CarFront,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Truck,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChildRowsEditor, type ChildField } from "@/components/masters/child-rows";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { downloadSheet } from "@/components/masters/excel";
import { FileUpload } from "@/components/masters/file-upload";
import { VehiclesHeaderBanner } from "@/components/masters/vehicles-header-banner";
import { DriverSelect } from "@/components/masters/driver-select";
import { FormSection } from "@/components/masters/page-header";
import { DayCheckboxes, SelectWithAdd } from "@/components/masters/pickers";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  CREATE_DOCUMENT,
  CREATE_FUEL_TANK,
  CREATE_SENSOR,
  CREATE_VEHICLE,
  DELETE_DOCUMENT,
  DELETE_FUEL_TANK,
  DELETE_SENSOR,
  DELETE_VEHICLE,
  LOOKUP_OPS,
  UPDATE_DOCUMENT,
  UPDATE_FUEL_TANK,
  UPDATE_SENSOR,
  UPDATE_VEHICLE,
  VEHICLE_CHILDREN,
  VEHICLE_DOCUMENTABLE_TYPE,
  VEHICLES_PAGE,
  type Vehicle,
  type VehicleChildrenResult,
  type VehiclesPageResult,
} from "@/lib/graphql/vehicle-management";
import { DOCUMENT_TYPES } from "@/lib/vehicle-management/helpers";
import { useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";
import { validateDocumentRow, validateLookupName, validateSensorRow, validateTankRow } from "@/lib/vehicle-management/validation";
import {
  emptyVehicleForm,
  FUEL_TYPES,
  PAYMENT_TYPES,
  validateVehicleForm,
  vehicleFormToVariables,
  vehicleToForm,
  type VehicleFormValues,
} from "@/lib/vehicle-management/vehicle-form";
import { cn } from "@/lib/utils";

type SortKey = "plate" | "asset" | "type" | "company" | "driver" | "status";
type SortDirection = "asc" | "desc";

function getVehicleCategory(typeName: string): "truck" | "van" | "bike" | "car" {
  const lower = (typeName || "").toLowerCase();
  if (lower.includes("truck")) return "truck";
  if (lower.includes("van")) return "van";
  if (lower.includes("bike") || lower.includes("motorcycle")) return "bike";
  return "car";
}

function VehicleIdIcon({ typeName, className }: { typeName: string; className?: string }) {
  const cat = getVehicleCategory(typeName);
  if (cat === "truck") return <Truck className={cn("size-4 text-slate-700 shrink-0", className)} />;
  if (cat === "bike") return <Bike className={cn("size-4 text-slate-700 shrink-0", className)} />;
  return <CarFront className={cn("size-4 text-slate-700 shrink-0", className)} />;
}

function VehicleTypeBadge({ typeName }: { typeName: string }) {
  const cat = getVehicleCategory(typeName);
  if (cat === "truck") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 border border-sky-200/70">
        <Truck className="size-3.5 text-sky-600 shrink-0" />
        {typeName || "Truck"}
      </span>
    );
  }
  if (cat === "van") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700 border border-purple-200/70">
        <CarFront className="size-3.5 text-purple-600 shrink-0" />
        {typeName || "Van"}
      </span>
    );
  }
  if (cat === "bike") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200/70">
        <Bike className="size-3.5 text-amber-600 shrink-0" />
        {typeName || "Bike"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700 border border-slate-200/70">
      <Car className="size-3.5 text-slate-600 shrink-0" />
      {typeName || "Car"}
    </span>
  );
}

/** 1. Vehicle Details (the reference site's "Assets List"). */
export function VehiclesScreen() {
  const t = useTranslations("masters.vm.vehicles");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const page = useVmQuery<VehiclesPageResult>("vehicles", VEHICLES_PAGE);
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();

  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);
  const [deleting, setDeleting] = useState<Vehicle | null>(null);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("plate");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  // Pagination
  const [pageSize, setPageSize] = useState(10);
  const [pageNumber, setPageNumber] = useState(1);

  // Checkbox selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const vehicles = useMemo(
    () => [...(page.data?.vehicles.data ?? [])].filter((v) => lookups.inScope(v.companyId)),
    [page.data, lookups],
  );

  const deviceByVehicle = useMemo(
    () => new Map((page.data?.devices.data ?? []).filter((d) => d.vehicleId).map((d) => [d.vehicleId as string, d])),
    [page.data],
  );

  const simByVehicle = useMemo(
    () => new Map((page.data?.sims.data ?? []).filter((s) => s.vehicleId).map((s) => [s.vehicleId as string, s])),
    [page.data],
  );

  // KPI stats
  const totalVehicles = vehicles.length;
  const activeVehicles = vehicles.filter((v) => v.status === "active").length;
  const inactiveVehicles = vehicles.filter((v) => v.status !== "active").length;
  const maintenanceDue = vehicles.filter(
    (v) => typeof v.serviceIntervalKm === "number" && typeof v.odometerKm === "number" && v.odometerKm >= v.serviceIntervalKm,
  ).length;

  // Filtered
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (typeFilter !== "all" && v.vehicleTypeId !== typeFilter) return false;
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (companyFilter !== "all" && v.companyId !== companyFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const dev = deviceByVehicle.get(v.id);
        const sim = simByVehicle.get(v.id);
        const driverName = v.primaryDriverId ? lookups.driverName(v.primaryDriverId) : "";
        const matches =
          v.plateNo.toLowerCase().includes(q) ||
          (v.vehicleName || "").toLowerCase().includes(q) ||
          driverName.toLowerCase().includes(q) ||
          (dev?.model || "").toLowerCase().includes(q) ||
          (dev?.imei || "").toLowerCase().includes(q) ||
          (sim?.simNumber || "").toLowerCase().includes(q) ||
          (sim?.iccid || "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [vehicles, typeFilter, statusFilter, companyFilter, search, deviceByVehicle, simByVehicle, lookups]);

  // Sorted
  const sortedVehicles = useMemo(() => {
    return [...filteredVehicles].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "plate") cmp = a.plateNo.localeCompare(b.plateNo);
      else if (sortKey === "asset") cmp = (a.vehicleName || "").localeCompare(b.vehicleName || "");
      else if (sortKey === "type") cmp = lookups.typeName(a.vehicleTypeId).localeCompare(lookups.typeName(b.vehicleTypeId));
      else if (sortKey === "company") cmp = lookups.companyName(a.companyId).localeCompare(lookups.companyName(b.companyId));
      else if (sortKey === "driver") {
        const dA = a.primaryDriverId ? lookups.driverName(a.primaryDriverId) : "";
        const dB = b.primaryDriverId ? lookups.driverName(b.primaryDriverId) : "";
        cmp = dA.localeCompare(dB);
      } else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredVehicles, sortKey, sortDir, lookups]);

  // Paginated
  const totalPages = Math.max(1, Math.ceil(sortedVehicles.length / pageSize));
  const currentPage = Math.min(pageNumber, totalPages);
  const pageVehicles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedVehicles.slice(start, start + pageSize);
  }, [sortedVehicles, currentPage, pageSize]);

  // Checkbox selection
  const isAllSelected = pageVehicles.length > 0 && pageVehicles.every((v) => selectedIds.has(v.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isAllSelected) {
        pageVehicles.forEach((v) => next.delete(v.id));
      } else {
        pageVehicles.forEach((v) => next.add(v.id));
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    const headers = [
      t("cols.plate"),
      t("cols.asset"),
      t("cols.type"),
      t("cols.company"),
      t("cols.driver"),
      t("cols.device"),
      t("cols.imei"),
      t("cols.sim"),
      t("cols.serviceKm"),
      tc("status"),
    ];
    const rows = filteredVehicles.map((v) => {
      const dev = deviceByVehicle.get(v.id);
      const sim = simByVehicle.get(v.id);
      return [
        v.plateNo,
        v.vehicleName ?? "",
        lookups.typeName(v.vehicleTypeId),
        lookups.companyName(v.companyId),
        v.primaryDriverId ? lookups.driverName(v.primaryDriverId) : "",
        dev?.model ?? "",
        dev?.imei ?? "",
        sim?.simNumber ?? sim?.iccid ?? "",
        v.serviceIntervalKm ?? "",
        v.status,
      ];
    });
    await downloadSheet([headers, ...rows], "vehicles.xlsx");
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="grid gap-6">
      {/* 1. Header with Title, Description, Scenic Banner, and Add Button */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-lg shrink-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>

        <div className="flex flex-1 items-center justify-end gap-5 min-w-0">
          <VehiclesHeaderBanner className="flex-1 max-w-[710px] justify-center" />
          <Button
            onClick={() => setEditing("new")}
            disabled={!lookups.allow("vehicles", "add")}
            className="shrink-0 bg-[#0f4c47] hover:bg-[#0c3e3a] text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm inline-flex items-center gap-1.5"
          >
            <Plus className="size-4" />
            {t("add")}
          </Button>
        </div>
      </div>

      {page.error ? <Alert tone="error">{errorText(page.error)}</Alert> : null}

      {/* 2. Four KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Vehicles */}
        <div className="bg-surface rounded-2xl border border-border/70 p-4 shadow-sm flex items-center justify-between">
          <div className="flex items-center">
            <div className="size-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Car className="size-5 text-emerald-600 stroke-[1.75]" />
            </div>
            <div className="ps-3.5 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{t("kpi.totalVehicles")}</p>
              <p className="text-2xl font-bold text-foreground mt-0.5">{totalVehicles}</p>
            </div>
          </div>
          <BarChart3 className="size-5 text-emerald-500 shrink-0 self-start mt-0.5" />
        </div>

        {/* Active Vehicles */}
        <div className="bg-surface rounded-2xl border border-border/70 p-4 shadow-sm flex items-center">
          <div className="size-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <span className="size-3.5 rounded-full bg-emerald-600" />
          </div>
          <div className="ps-3.5 min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{t("kpi.activeVehicles")}</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{activeVehicles}</p>
          </div>
        </div>

        {/* Inactive Vehicles */}
        <div className="bg-surface rounded-2xl border border-border/70 p-4 shadow-sm flex items-center">
          <div className="size-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="size-5 text-amber-500 stroke-[1.75]" />
          </div>
          <div className="ps-3.5 min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{t("kpi.inactiveVehicles")}</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{inactiveVehicles}</p>
          </div>
        </div>

        {/* Maintenance Due */}
        <div className="bg-rose-50/40 rounded-2xl border border-rose-100 p-4 shadow-sm flex items-center">
          <div className="size-11 rounded-xl bg-rose-100/70 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="size-5 text-rose-500 stroke-[1.75]" />
          </div>
          <div className="ps-3.5 min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{t("kpi.maintenanceDue")}</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{maintenanceDue}</p>
          </div>
        </div>
      </div>

      {/* 3. Filter and Search Bar Panel */}
      <div className="bg-surface rounded-2xl border border-border/70 p-3 shadow-sm flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Search input + Type + Status + Company + Reset */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px] sm:min-w-[320px]">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPageNumber(1);
              }}
              placeholder={t("filters.searchPlaceholder")}
              className="h-11 w-full rounded-xl border border-border/80 bg-surface ps-10 pe-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
            />
          </div>

          {/* Type filter */}
          <div className="relative min-w-[110px] rounded-xl border border-border/80 bg-surface px-3 py-1 text-start shadow-2xs focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
            <span className="block text-[11px] font-medium text-muted-foreground leading-tight">{t("filters.type")}</span>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPageNumber(1);
              }}
              className="w-full bg-transparent text-sm font-semibold text-foreground focus:outline-none cursor-pointer pe-4 appearance-none"
            >
              <option value="all">{t("filters.all")}</option>
              {lookups.vehicleTypes.map((vt) => (
                <option key={vt.id} value={vt.id}>
                  {vt.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          </div>

          {/* Status filter */}
          <div className="relative min-w-[110px] rounded-xl border border-border/80 bg-surface px-3 py-1 text-start shadow-2xs focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
            <span className="block text-[11px] font-medium text-muted-foreground leading-tight">{t("filters.status")}</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPageNumber(1);
              }}
              className="w-full bg-transparent text-sm font-semibold text-foreground focus:outline-none cursor-pointer pe-4 appearance-none"
            >
              <option value="all">{t("filters.all")}</option>
              <option value="active">{tc("statuses.active")}</option>
              <option value="inactive">{tc("statuses.inactive")}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          </div>

          {/* Company filter */}
          <div className="relative min-w-[120px] rounded-xl border border-border/80 bg-surface px-3 py-1 text-start shadow-2xs focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
            <span className="block text-[11px] font-medium text-muted-foreground leading-tight">{t("filters.company")}</span>
            <select
              value={companyFilter}
              onChange={(e) => {
                setCompanyFilter(e.target.value);
                setPageNumber(1);
              }}
              className="w-full bg-transparent text-sm font-semibold text-foreground focus:outline-none cursor-pointer pe-4 appearance-none"
            >
              <option value="all">{t("filters.all")}</option>
              {lookups.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          </div>

          {/* Reset button */}
          <Button
            variant="secondary"
            onClick={() => {
              setSearch("");
              setTypeFilter("all");
              setStatusFilter("all");
              setCompanyFilter("all");
              setPageNumber(1);
            }}
            className="h-11 rounded-xl px-3.5 text-sm font-medium border-border/80 inline-flex items-center gap-1.5 shadow-2xs"
          >
            <RotateCcw className="size-4 text-muted-foreground" />
            <span>{t("filters.reset")}</span>
          </Button>
        </div>

        {/* Right: {filtered.length} rows + Export button */}
        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 lg:pt-0">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            {t("filters.rows", { count: filteredVehicles.length })}
          </span>
          <Button
            variant="secondary"
            onClick={handleExport}
            className="h-11 rounded-xl px-3.5 text-sm font-medium border-border/80 inline-flex items-center gap-1.5 shadow-2xs"
          >
            <Download className="size-4 text-muted-foreground" />
            <span>{t("filters.export")}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* 4. Table Panel with Header Sorts and Styled Rows */}
      <div className="bg-surface rounded-2xl border border-border/70 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm border-collapse">
            <thead>
              <tr className="border-b border-border/70 bg-transparent">
                <th scope="col" className="w-10 px-4 py-3.5 text-center">
                  <Checkbox
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all vehicles"
                  />
                </th>

                {/* Vehicle ID Sortable */}
                <th
                  scope="col"
                  onClick={() => handleSort("plate")}
                  className="py-3.5 px-3 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap cursor-pointer select-none group hover:text-foreground"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{t("cols.plate")}</span>
                    <ArrowUpDown className={cn("size-3", sortKey === "plate" ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground")} />
                  </div>
                </th>

                {/* Asset no. Sortable */}
                <th
                  scope="col"
                  onClick={() => handleSort("asset")}
                  className="py-3.5 px-3 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap cursor-pointer select-none group hover:text-foreground"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{t("cols.asset")}</span>
                    <ArrowUpDown className={cn("size-3", sortKey === "asset" ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground")} />
                  </div>
                </th>

                {/* Type Sortable */}
                <th
                  scope="col"
                  onClick={() => handleSort("type")}
                  className="py-3.5 px-3 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap cursor-pointer select-none group hover:text-foreground"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{t("cols.type")}</span>
                    <ArrowUpDown className={cn("size-3", sortKey === "type" ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground")} />
                  </div>
                </th>

                {/* Company Sortable */}
                <th
                  scope="col"
                  onClick={() => handleSort("company")}
                  className="py-3.5 px-3 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap cursor-pointer select-none group hover:text-foreground"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{t("cols.company")}</span>
                    <ArrowUpDown className={cn("size-3", sortKey === "company" ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground")} />
                  </div>
                </th>

                {/* Driver Sortable */}
                <th
                  scope="col"
                  onClick={() => handleSort("driver")}
                  className="py-3.5 px-3 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap cursor-pointer select-none group hover:text-foreground"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{t("cols.driver")}</span>
                    <ArrowUpDown className={cn("size-3", sortKey === "driver" ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground")} />
                  </div>
                </th>

                <th scope="col" className="py-3.5 px-3 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  {t("cols.device")}
                </th>
                <th scope="col" className="py-3.5 px-3 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  {t("cols.imei")}
                </th>
                <th scope="col" className="py-3.5 px-3 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  {t("cols.sim")}
                </th>
                <th scope="col" className="py-3.5 px-3 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  {t("cols.serviceKm")}
                </th>

                {/* Status Sortable */}
                <th
                  scope="col"
                  onClick={() => handleSort("status")}
                  className="py-3.5 px-3 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap cursor-pointer select-none group hover:text-foreground"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{tc("status")}</span>
                    <ArrowUpDown className={cn("size-3", sortKey === "status" ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground")} />
                  </div>
                </th>

                <th scope="col" className="py-3.5 px-3 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  {t("actions")}
                </th>
              </tr>
            </thead>

            <tbody>
              {pageVehicles.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-sm text-muted-foreground">
                    {page.isPending ? t("loading") : t("empty")}
                  </td>
                </tr>
              ) : (
                pageVehicles.map((v) => {
                  const typeName = lookups.typeName(v.vehicleTypeId);
                  const dev = deviceByVehicle.get(v.id);
                  const sim = simByVehicle.get(v.id);
                  const isSelected = selectedIds.has(v.id);

                  return (
                    <tr
                      key={v.id}
                      className={cn(
                        "border-b border-border/50 hover:bg-surface-2/40 transition-colors last:border-b-0",
                        isSelected && "bg-primary/5 hover:bg-primary/10",
                      )}
                    >
                      {/* Checkbox */}
                      <td className="w-10 px-4 py-3.5 text-center">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleSelect(v.id)}
                          aria-label={`Select ${v.plateNo}`}
                        />
                      </td>

                      {/* Vehicle ID */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <VehicleIdIcon typeName={typeName} />
                          <span className="font-bold text-foreground tracking-tight" dir="ltr">
                            {v.plateNo}
                          </span>
                        </div>
                      </td>

                      {/* Asset no. */}
                      <td className="py-3.5 px-3 whitespace-nowrap text-foreground font-medium">
                        {v.vehicleName || "—"}
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <VehicleTypeBadge typeName={typeName} />
                      </td>

                      {/* Company */}
                      <td className="py-3.5 px-3 whitespace-nowrap text-foreground">
                        {lookups.companyName(v.companyId) || "—"}
                      </td>

                      {/* Driver */}
                      <td className="py-3.5 px-3 whitespace-nowrap text-foreground">
                        {v.primaryDriverId ? (
                          <div className="inline-flex items-center gap-1.5">
                            <User className="size-3.5 text-muted-foreground shrink-0" />
                            <span>{lookups.driverName(v.primaryDriverId)}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Device */}
                      <td className="py-3.5 px-3 whitespace-nowrap text-foreground">
                        {dev ? (
                          <div className="inline-flex items-center gap-1.5">
                            <Cpu className="size-3.5 text-muted-foreground shrink-0" />
                            <span>{dev.model || "QA Simulator"}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* IMEI */}
                      <td className="py-3.5 px-3 whitespace-nowrap text-foreground font-mono text-xs" dir="ltr">
                        {dev?.imei || <span className="font-sans text-muted-foreground">—</span>}
                      </td>

                      {/* SIM no. */}
                      <td className="py-3.5 px-3 whitespace-nowrap text-foreground font-mono text-xs" dir="ltr">
                        {sim?.simNumber || sim?.iccid || <span className="font-sans text-muted-foreground">—</span>}
                      </td>

                      {/* Service every (km) */}
                      <td className="py-3.5 px-3 whitespace-nowrap text-foreground">
                        {v.serviceIntervalKm ? v.serviceIntervalKm.toLocaleString() : <span className="text-muted-foreground">—</span>}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {v.status === "active" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/70">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            {tc("statuses.active")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200/70">
                            <span className="size-1.5 rounded-full bg-slate-400" />
                            {tc("statuses.inactive")}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title={tc("edit")}
                            onClick={() => setEditing(v)}
                            disabled={!lookups.allow("vehicles", "edit")}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors disabled:opacity-40"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            title="Copy"
                            onClick={() => {
                              navigator.clipboard.writeText(v.plateNo);
                              toast.success(t("copied", { plate: v.plateNo }));
                            }}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                          >
                            <Copy className="size-4" />
                          </button>
                          <button
                            type="button"
                            title={tc("delete")}
                            onClick={() => setDeleting(v)}
                            disabled={!lookups.allow("vehicles", "delete")}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-rose-50 transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="size-4" />
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

        {/* 5. Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-border/70 text-sm">
          {/* Left: Show [ 10 v ] entries */}
          <div className="flex items-center gap-2 text-muted-foreground text-xs sm:text-sm">
            <span>{t("pagination.show")}</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPageNumber(1);
              }}
              className="h-8 rounded-lg border border-border/80 bg-surface px-2 text-xs font-semibold text-foreground focus:border-primary focus:outline-none cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>{t("pagination.entries")}</span>
          </div>

          {/* Right: < [ 1 ] > */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="size-8 rounded-lg border border-border/80 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-2 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="size-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPageNumber(p)}
                className={cn(
                  "size-8 rounded-lg text-xs font-semibold transition-colors",
                  p === currentPage
                    ? "bg-[#0f4c47] text-white shadow-2xs"
                    : "border border-border/80 text-foreground hover:bg-surface-2",
                )}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPageNumber((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="size-8 rounded-lg border border-border/80 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-2 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {editing !== null ? (
        <VehicleSheet vehicle={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.plateNo ?? ""}
        permanent={false}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_VEHICLE, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

type Tab = "details" | "documents" | "sensors" | "tanks";

function VehicleSheet({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }) {
  const t = useTranslations("masters.vm.vehicles");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  // After the first save of a new vehicle, the panel stays open on that vehicle.
  const [vehicleId, setVehicleId] = useState<string | null>(vehicle?.id ?? null);
  // What's saved right now, so an update only sends null to clear a value that was set.
  const savedRef = useRef<Record<string, unknown> | null>(vehicle ? vehicleFormToVariables(vehicleToForm(vehicle)) : null);
  const [tab, setTab] = useState<Tab>("details");
  const [form, setForm] = useState<VehicleFormValues>(() => (vehicle ? vehicleToForm(vehicle) : emptyVehicleForm()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const set = <K extends keyof VehicleFormValues>(key: K, value: VehicleFormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const otherPlates = lookups.vehicles.filter((v) => v.id !== vehicleId).map((v) => v.plateNo);
    const found = validateVehicleForm(form, { otherPlates });
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error(tc("fixErrors"));
      return;
    }
    if (!lookups.companyId) return;
    setPending(true);
    try {
      const vars = vehicleFormToVariables(form);
      if (vehicleId) {
        await run(UPDATE_VEHICLE, { id: vehicleId, ...vars }, { previous: savedRef.current });
        savedRef.current = vars;
        toast.success(tc("saved"));
      } else {
        const res = await run<{ createVehicle: { id: string } }>(CREATE_VEHICLE, { companyId: lookups.companyId, ...vars });
        savedRef.current = vars;
        setVehicleId(res.createVehicle.id);
        toast.success(t("createdNext"));
      }
      await refresh();
    } catch (err) {
      failInto(err, setErrors);
    } finally {
      setPending(false);
    }
  };

  const text = (key: keyof VehicleFormValues, label: string, opts: { type?: string; required?: boolean; hint?: ReactNode; dir?: "ltr"; span?: boolean } = {}) => (
    <div className={opts.span ? "sm:col-span-2" : undefined}>
      <Field id={`v-${key}`} label={opts.required ? `${label} *` : label} error={errors[key]} hint={opts.hint}>
        <Input
          id={`v-${key}`}
          type={opts.type ?? "text"}
          step={opts.type === "number" ? "any" : undefined}
          inputMode={opts.type === "number" ? "decimal" : undefined}
          dir={opts.dir}
          value={form[key] as string}
          onChange={(e) => set(key, e.target.value as never)}
          aria-invalid={errors[key] ? true : undefined}
        />
      </Field>
    </div>
  );

  const tabs: Tab[] = ["details", "documents", "sensors", "tanks"];

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      size="xl"
      title={vehicleId ? t("editTitle", { plate: form.plateNo || "…" }) : t("add")}
      description={t("formDescription")}
      footer={
        tab === "details" ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              {vehicleId ? tc("close") : tc("cancel")}
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? tc("saving") : tc("save")}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            {tc("close")}
          </Button>
        )
      }
    >
      <div role="tablist" aria-label={t("formTabs")} className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            disabled={k !== "details" && !vehicleId}
            title={k !== "details" && !vehicleId ? t("saveFirst") : undefined}
            onClick={() => setTab(k)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50",
              tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>

      {tab === "details" ? (
        <form
          className="grid gap-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <FormSection title={t("sections.basic")} columns={3}>
            {text("plateNo", t("f.plateNo"), { required: true, dir: "ltr" })}
            {text("vehicleName", t("f.vehicleName"))}
            <Field id="v-vehicleTypeId" label={`${t("f.vehicleType")} *`} error={errors.vehicleTypeId}>
              <SelectWithAdd
                id="v-vehicleTypeId"
                value={form.vehicleTypeId}
                onChange={(v) => set("vehicleTypeId", v)}
                invalid={Boolean(errors.vehicleTypeId)}
                placeholder={tc("choose")}
                options={lookups.vehicleTypes
                  .filter((ty) => ty.status === "active" || ty.id === form.vehicleTypeId)
                  .map((ty) => ({ id: ty.id, label: ty.name }))}
                addLabel={t("addType")}
                canAdd={lookups.allow("vehicles", "add")}
                validate={({ name }) => validateLookupName(name, lookups.vehicleTypes)}
                onCreate={async ({ name }) => {
                  const res = await run<{ createVehicleType: { id: string } }>(LOOKUP_OPS.vehicleType.create, {
                    companyId: lookups.companyId,
                    name,
                    status: "active",
                  });
                  await refresh();
                  return res.createVehicleType.id;
                }}
              />
            </Field>
            <Field id="v-timezone" label={t("f.timezone")}>
              <Select id="v-timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
                <option value="">{tc("none")}</option>
                {timeZones(form.timezone).map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="v-driver" label={t("f.driver")}>
              <DriverSelect id="v-driver" value={form.primaryDriverId} onChange={(v) => set("primaryDriverId", v)} />
            </Field>
            {text("barcode", t("f.barcode"), { dir: "ltr" })}
            {text("brand", t("f.brand"))}
            {text("model", t("f.model"))}
            {text("colour", t("f.colour"))}
            {text("year", t("f.year"), { type: "number" })}
            <div className="sm:col-span-2">
              <Field id="v-photoPath" label={t("f.photo")}>
                <FileUpload id="v-photoPath" purpose="vehicle_photo" value={form.photoPath} onChange={(url) => set("photoPath", url)} />
              </Field>
            </div>
            <Field id="v-status" label={tc("status")}>
              <Select id="v-status" value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="active">{tc("statuses.active")}</option>
                <option value="inactive">{tc("statuses.inactive")}</option>
              </Select>
            </Field>
            <div className="sm:col-span-2 lg:col-span-2">
              <Field id="v-comment" label={t("f.comment")}>
                <Textarea id="v-comment" value={form.comment} onChange={(e) => set("comment", e.target.value)} rows={2} />
              </Field>
            </div>
            <div className="flex items-end pb-2">
              <Checkbox label={t("f.canbus")} checked={form.hasCanBus} onChange={(e) => set("hasCanBus", e.target.checked)} />
            </div>
          </FormSection>

          <FormSection title={t("sections.subscription")} columns={3}>
            {text("installDate", t("f.installDate"), { type: "date", required: true })}
            <Field id="v-paymentType" label={`${t("f.paymentType")} *`} error={errors.paymentType}>
              <Select id="v-paymentType" value={form.paymentType} onChange={(e) => set("paymentType", e.target.value)}>
                {PAYMENT_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {t(`payment.${p}`)}
                  </option>
                ))}
              </Select>
            </Field>
            {text("subscriptionExpiresAt", t("f.expiryDate"), { type: "date" })}
            {text("renewedAt", t("f.renewedAt"), { type: "date" })}
          </FormSection>

          <Alert tone="info">{t("complianceNote")}</Alert>

          <FormSection title={t("sections.limits")} columns={3}>
            {text("speedLimitKmh", t("f.speedLimit"), { type: "number", required: true })}
            {text("idleLimitMinutes", t("f.idleLimit"), { type: "number", required: true })}
            <span className="hidden lg:block" />
            {text("trackingHoursFrom", t("f.trackingFrom"), { type: "time" })}
            {text("trackingHoursTo", t("f.trackingTo"), { type: "time" })}
            <div className="sm:col-span-2 lg:col-span-3">
              <Field id="v-days" label={t("f.trackingDays")} hint={t("f.trackingDaysHint")}>
                <DayCheckboxes value={form.workingDays} onChange={(d) => set("workingDays", d)} />
              </Field>
            </div>
          </FormSection>

          <FormSection title={t("sections.service")} columns={3}>
            {text("odometerKm", t("f.odometer"), { type: "number" })}
            {text("lastServiceDate", t("f.lastService"), { type: "date" })}
            {text("lastOilChangeDate", t("f.lastOil"), { type: "date" })}
            {text("lastTyreChangeDate", t("f.lastTyre"), { type: "date" })}
            {text("tyreIntervalKm", t("f.tyreInterval"), { type: "number" })}
            {text("oilIntervalKm", t("f.oilInterval"), { type: "number" })}
            {text("serviceIntervalKm", t("f.serviceInterval"), { type: "number" })}
            {text("machineServiceHours", t("f.machineHours"), { type: "number" })}
          </FormSection>

          <FormSection title={t("sections.finance")} columns={3}>
            {text("purchaseDate", t("f.purchaseDate"), { type: "date" })}
            {text("totalCost", t("f.totalCost"), { type: "number" })}
            {text("downPayment", t("f.downPayment"), { type: "number" })}
            {text("monthlyEmi", t("f.monthlyEmi"), { type: "number" })}
            {text("emiCount", t("f.emiCount"), { type: "number" })}
            {text("emiDueDay", t("f.emiDueDay"), { type: "number", hint: t("f.emiDueDayHint") })}
          </FormSection>

          <FormSection title={t("sections.fuel")} description={t("fuelNote")} columns={3}>
            <Field id="v-fuelType" label={t("f.fuelType")}>
              <Select id="v-fuelType" value={form.fuelType} onChange={(e) => set("fuelType", e.target.value)}>
                <option value="">{tc("none")}</option>
                {FUEL_TYPES.map((f) => (
                  <option key={f} value={f}>
                    {t(`fuel.${f}`)}
                  </option>
                ))}
              </Select>
            </Field>
            {text("fuelConsumptionRate", t("f.mileage"), { type: "number" })}
          </FormSection>
          <button type="submit" hidden />
        </form>
      ) : vehicleId ? (
        <VehicleChildren key={tab} vehicleId={vehicleId} tab={tab} />
      ) : null}
    </Sheet>
  );
}

/** All IANA time zones the browser knows, with the current value kept even if unknown. */
function timeZones(current: string): string[] {
  const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [
    "Asia/Dubai",
  ];
  return current && !all.includes(current) ? [current, ...all] : all;
}

function VehicleChildren({ vehicleId, tab }: { vehicleId: string; tab: Exclude<Tab, "details"> }) {
  const t = useTranslations("masters.vm.vehicles");
  const lookups = useVmLookups();
  const children = useVmQuery<VehicleChildrenResult>("vehicleChildren", VEHICLE_CHILDREN);
  const errorText = useErrorText();

  if (children.isPending) return <p className="text-[13px] text-muted-foreground">{t("loading")}</p>;
  if (children.error) return <Alert tone="error">{errorText(children.error)}</Alert>;
  const data = children.data!;

  if (tab === "documents") {
    const docFields: ChildField[] = [
      {
        key: "type",
        label: t("doc.type"),
        type: "select",
        required: true,
        createOnly: true,
        options: DOCUMENT_TYPES.map((d) => ({ value: d, label: t(`docTypes.${d}`) })),
      },
      { key: "customLabel", label: t("doc.label"), type: "text", placeholder: t("doc.labelPlaceholder") },
      { key: "documentNo", label: t("doc.number"), type: "text" },
      { key: "issuedAt", label: t("doc.issuedAt"), type: "date" },
      { key: "expiresAt", label: t("doc.expiresAt"), type: "date" },
      { key: "reminderDaysBefore", label: t("doc.reminder"), type: "int" },
      { key: "filePath", label: t("doc.file"), type: "file", purpose: "document", className: "sm:col-span-2 lg:col-span-3" },
    ];
    return (
      <ChildRowsEditor
        title={t("tabs.documents")}
        rows={data.documents.data.filter((d) => d.documentableType === VEHICLE_DOCUMENTABLE_TYPE && d.documentableId === vehicleId)}
        fields={docFields}
        newRow={{ type: "insurance" }}
        createVariables={{ companyId: lookups.companyId, documentableType: VEHICLE_DOCUMENTABLE_TYPE, documentableId: vehicleId }}
        ops={{ create: CREATE_DOCUMENT, update: UPDATE_DOCUMENT, remove: DELETE_DOCUMENT }}
        readOnly={!lookups.allow("other", "edit")}
        validate={validateDocumentRow}
        addLabel={t("doc.add")}
        emptyText={t("doc.empty")}
      />
    );
  }

  if (tab === "sensors") {
    const sensorFields: ChildField[] = [
      {
        key: "sensorType",
        label: t("sensor.type"),
        type: "select",
        required: true,
        createOnly: true,
        options: ["analog_input", "digital_input", "temperature", "ble_temperature_humidity"].map((s) => ({
          value: s,
          label: t(`sensorTypes.${s}`),
        })),
      },
      { key: "label", label: t("sensor.label"), type: "text" },
      { key: "ioIndex", label: t("sensor.ioIndex"), type: "int" },
      { key: "maxVoltage", label: t("sensor.maxVoltage"), type: "number", visible: (d) => (d.sensorType ?? "") === "analog_input" },
      { key: "lowLimit", label: t("sensor.lowLimit"), type: "number", visible: (d) => (d.sensorType ?? "").includes("temperature") },
      { key: "highLimit", label: t("sensor.highLimit"), type: "number", visible: (d) => (d.sensorType ?? "").includes("temperature") },
      { key: "sortOrder", label: t("sensor.sortOrder"), type: "int", omitIfEmpty: true },
    ];
    const sensors = data.vehicleSensors.data.filter((s) => s.vehicleId === vehicleId).sort((a, b) => a.sortOrder - b.sortOrder);
    return (
      <ChildRowsEditor
        title={t("tabs.sensors")}
        rows={sensors}
        fields={sensorFields}
        newRow={{ sensorType: "analog_input", sortOrder: String((sensors.at(-1)?.sortOrder ?? 0) + 1) }}
        createVariables={{ vehicleId }}
        ops={{ create: CREATE_SENSOR, update: UPDATE_SENSOR, remove: DELETE_SENSOR }}
        readOnly={!lookups.allow("other", "edit")}
        validate={validateSensorRow}
        addLabel={t("sensor.add")}
        emptyText={t("sensor.empty")}
      />
    );
  }

  const tanks = data.vehicleFuelTanks.data.filter((f) => f.vehicleId === vehicleId).sort((a, b) => a.tankIndex - b.tankIndex);
  const tankFields: ChildField[] = [
    { key: "tankIndex", label: t("tank.index"), type: "int", required: true, omitIfEmpty: true },
    { key: "shape", label: t("tank.shape"), type: "text" },
    { key: "volumeLitres", label: t("tank.volume"), type: "number" },
    {
      key: "fuelCalibrationId",
      label: t("tank.calibration"),
      type: "select",
      // Only this vehicle's company's calibrations (a platform account sees every company's).
      options: data.fuelCalibrations.data
        .filter((c) => c.companyId === lookups.vehicleCompanyId(vehicleId))
        .map((c) => ({ value: c.id, label: c.name })),
    },
    { key: "minimumRefillLitres", label: t("tank.minRefill"), type: "number" },
  ];
  return (
    <ChildRowsEditor
      title={t("tabs.tanks")}
      rows={tanks}
      fields={tankFields}
      newRow={{ tankIndex: String((tanks.at(-1)?.tankIndex ?? 0) + 1) }}
      createVariables={{ vehicleId }}
      ops={{ create: CREATE_FUEL_TANK, update: UPDATE_FUEL_TANK, remove: DELETE_FUEL_TANK }}
      readOnly={!lookups.allow("fuel", "edit")}
      validate={(values, rowId) => validateTankRow(values, tanks.filter((x) => x.id !== rowId).map((x) => x.tankIndex))}
      addLabel={t("tank.add")}
      emptyText={t("tank.empty")}
    />
  );
}
