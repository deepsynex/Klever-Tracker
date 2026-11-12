"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Bike,
  Calendar,
  CarFront,
  Clock,
  Flame,
  Loader2,
  Minus,
  Plus,
  Search,
  Truck,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { gqlRequest } from "@/lib/graphql/client";
import {
  GET_DEVICES,
  GET_POSITION_HISTORY,
  GET_VEHICLES,
  type DevicesResult,
  type PositionHistoryResult,
  type VehiclesResult,
} from "@/lib/graphql/operations";
import { gridZoomLevel, type WeightMode } from "@/lib/heatmap/aggregate";
import { GRADIENTS, HeatmapRequestError, fetchHeatmap, heatmapUrl, type HeatmapQuery } from "@/lib/heatmap/client";
import { parseHeatmapQuery } from "@/lib/heatmap/request";
import { buildTrackTargets, companyDate, companyTimeToUtcIso } from "@/lib/history/selection";
import { useMapConfig } from "@/lib/map-settings";
import { cn } from "@/lib/utils";
import type { VehicleMapMarker } from "./heatmap-map";
import { HeatmapToolbar, type ToolbarState } from "./heatmap-toolbar";

const HeatmapMap = dynamic(() => import("./heatmap-map"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-surface-2" />,
});
// MapLibre is only downloaded when the platform uses OpenStreetMap.
const HeatmapOsmMap = dynamic(() => import("./heatmap-osm-map"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-surface-2" />,
});

const DEFAULT_ZOOM = 11;
const ZOOM_DEBOUNCE_MS = 500;

type Submitted = Omit<HeatmapQuery, "zoom"> & { id: number };

function formatDateDisplay(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return isoDate;
  const [y, m, d] = parts;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d).padStart(2, "0")}-${months[m - 1] ?? "Jan"}-${y}`;
}

function formatTimeDisplay(timeStr: string): string {
  if (!timeStr) return "";
  const parts = timeStr.split(":").map(Number);
  if (parts.length < 2 || parts.some(isNaN)) return timeStr;
  const [hh, mm] = parts;
  const period = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${String(h12).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${period}`;
}

function parseTargetDisplay(label: string): { plate: string; alias?: string; kind: "truck" | "van" | "bike" | "car" } {
  let plate = label;
  let alias: string | undefined;

  if (label.includes(" — ")) {
    const parts = label.split(" — ");
    plate = parts[0].trim();
    alias = parts.slice(1).join(" — ").trim();
  } else {
    const match = label.match(/^([^(]+)\s*\(([^)]+)\)$/);
    if (match) {
      plate = match[1].trim();
      alias = match[2].trim();
    }
  }

  const combined = (plate + " " + (alias || "")).toLowerCase();
  let kind: "truck" | "van" | "bike" | "car" = "car";
  if (combined.includes("bike") || combined.includes("motorcycle")) kind = "bike";
  else if (combined.includes("truck") || combined.includes("verify")) kind = "truck";
  else if (combined.includes("van")) kind = "van";

  return { plate, alias, kind };
}

function TargetVehicleIcon({ kind, className }: { kind: "truck" | "van" | "bike" | "car"; className?: string }) {
  if (kind === "bike") return <Bike className={className} />;
  if (kind === "truck") return <Truck className={className} />;
  return <CarFront className={className} />;
}

/** Fullscreen Interactive Heatmap with floating Filters Card and floating Controls Toolbar. */
export function HeatmapView({ today }: { today: string }) {
  const t = useTranslations("heatmap");
  const te = useTranslations("errors");
  const mapConfig = useMapConfig();
  const apiKey = mapConfig.googleMapsApiKey ?? "";
  const containerRef = useRef<HTMLDivElement>(null);

  // Filters state. Nothing ticked at first; the first heatmap covers all of the company's vehicles.
  const [selected, setSelected] = useState<string[]>([]);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [fromDate, setFromDate] = useState(() => companyDate(30));
  const [fromTime, setFromTime] = useState("00:00");
  const [toDate, setToDate] = useState(today);
  const [toTime, setToTime] = useState("23:59");
  const [mode, setMode] = useState<WeightMode>("dwell");
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
  const [filterCollapsed, setFilterCollapsed] = useState(false);

  const fromDateRef = useRef<HTMLInputElement>(null);
  const toDateRef = useRef<HTMLInputElement>(null);
  const fromTimeRef = useRef<HTMLInputElement>(null);
  const toTimeRef = useRef<HTMLInputElement>(null);

  const openPicker = (ref: React.RefObject<HTMLInputElement | null>) => {
    if (!ref.current) return;
    try {
      ref.current.showPicker?.();
    } catch {
      ref.current.focus();
    }
  };

  // Heatmap execution
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const [runId, setRunId] = useState(0);
  const [gridZoom, setGridZoom] = useState(gridZoomLevel(DEFAULT_ZOOM));
  const zoomTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const initialLoadedRef = useRef(false);

  // Heatmap toolbar: default to rainbow gradient, 70% opacity, 30px radius (matching screenshot)
  const [toolbar, setToolbar] = useState<ToolbarState>({
    visible: true,
    gradient: "rainbow",
    opacity: 0.7,
    radius: 30,
  });

  // Query vehicles & devices from live database
  const targetsQuery = useQuery({
    queryKey: ["heatmap", "targets"],
    queryFn: async () => {
      const [v, d] = await Promise.all([
        gqlRequest<VehiclesResult>(GET_VEHICLES, { first: 100 }),
        gqlRequest<DevicesResult>(GET_DEVICES, { first: 100 }),
      ]);
      const vehicleIds = new Set(v.vehicles.data.map((x) => x.id));
      return buildTrackTargets(v.vehicles.data, d.devices.data).filter(
        (x) => x.kind === "vehicle" || !x.vehicleId || !vehicleIds.has(x.vehicleId),
      );
    },
  });
  const targets = useMemo(() => targetsQuery.data ?? [], [targetsQuery.data]);

  // Each vehicle's latest position, for its marker (not limited to the chosen period)
  const positionsQuery = useQuery({
    queryKey: ["heatmap", "vehicle-positions", targets.map((t) => t.id).join(",")],
    queryFn: async () => {
      const markers: VehicleMapMarker[] = [];

      await Promise.all(
        targets.map(async (target) => {
          try {
            const res = await gqlRequest<PositionHistoryResult>(GET_POSITION_HISTORY, {
              [target.kind === "vehicle" ? "vehicleId" : "deviceId"]: target.id,
              first: 30,
            });
            const list = res.positionHistory?.data ?? [];

            const valid = list.find(
              (p) => typeof p.locationLat === "number" && typeof p.locationLng === "number" && Math.abs(p.locationLat) > 0.01,
            );
            if (valid && typeof valid.locationLat === "number" && typeof valid.locationLng === "number") {
              const { plate, alias, kind } = parseTargetDisplay(target.label);
              markers.push({
                id: target.id,
                label: alias ? `${plate} (${alias})` : plate,
                kind,
                position: { lat: valid.locationLat, lng: valid.locationLng },
                speed: typeof valid.speed === "number" ? Math.round(valid.speed) : undefined,
                recordedAt: valid.recordedAt,
              });
            }
          } catch {
            // No marker for this vehicle; the heatmap itself is unaffected.
          }
        }),
      );
      return { markers };
    },
    enabled: targets.length > 0,
    staleTime: 60_000,
  });


  // Visible vehicles matching search in panel
  const visibleTargets = useMemo(() => {
    if (!vehicleSearch.trim()) return targets;
    const q = vehicleSearch.toLowerCase();
    return targets.filter((x) => x.label.toLowerCase().includes(q));
  }, [targets, vehicleSearch]);

  // Initial load: populate heatmap on mount with real data from the database
  useEffect(() => {
    if (targets.length > 0 && !initialLoadedRef.current) {
      initialLoadedRef.current = true;
      const initialTargets = targets;
      const query: Omit<HeatmapQuery, "zoom"> = {
        vehicleIds: initialTargets.filter((x) => x.kind === "vehicle").map((x) => x.id),
        deviceIds: initialTargets.filter((x) => x.kind === "device").map((x) => x.id),
        from: companyTimeToUtcIso(fromDate, fromTime),
        to: companyTimeToUtcIso(toDate, toTime, 59),
        mode,
      };
      setSubmitted({ ...query, id: 1 });
    }
  }, [targets, fromDate, fromTime, toDate, toTime, mode]);

  const heatmap = useQuery({
    queryKey: ["heatmap", "cells", submitted, gridZoom],
    queryFn: ({ signal }) => fetchHeatmap({ ...submitted!, zoom: gridZoom }, signal),
    enabled: submitted !== null,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const data = submitted ? heatmap.data : undefined;

  // GPS points per vehicle in the period the heatmap shows (from the same request, so they match it).
  const targetPointCounts = useMemo(() => data?.target_points ?? {}, [data]);

  // Filter map markers: show selected targets or all real targets if none specifically selected
  const realMarkers = useMemo(() => {
    const list = (positionsQuery.data?.markers ?? []).map((m) => ({
      ...m,
      totalPoints: targetPointCounts[`vehicle:${m.id}`] ?? targetPointCounts[`device:${m.id}`],
    }));
    if (selected.length === 0) return list;
    return list.filter((m) => selected.some((s) => s.endsWith(`:${m.id}`)));
  }, [positionsQuery.data?.markers, selected, targetPointCounts]);
  const ready = !!data && !heatmap.isPlaceholderData;
  const fitKey = submitted === null ? runId : ready ? submitted.id : -1;

  const onZoomChange = (zoom: number) => {
    clearTimeout(zoomTimer.current);
    zoomTimer.current = setTimeout(() => setGridZoom(gridZoomLevel(zoom)), ZOOM_DEBOUNCE_MS);
  };

  const handleToggleSelectAll = () => {
    const isAllSelected = visibleTargets.length > 0 && visibleTargets.every((t) => selected.includes(t.key));
    if (isAllSelected) {
      setSelected((prev) => prev.filter((k) => !visibleTargets.some((t) => t.key === k)));
    } else {
      setSelected((prev) => [...new Set([...prev, ...visibleTargets.map((t) => t.key)])]);
    }
  };

  const handleToggleVehicle = (key: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));
  };

  const onShow = (e: FormEvent) => {
    e.preventDefault();
    // If no specific vehicle is selected, default to all available targets
    const activeTargets = selected.length > 0 ? targets.filter((x) => selected.includes(x.key)) : targets;
    const query: Omit<HeatmapQuery, "zoom"> = {
      vehicleIds: activeTargets.filter((x) => x.kind === "vehicle").map((x) => x.id),
      deviceIds: activeTargets.filter((x) => x.kind === "device").map((x) => x.id),
      from: companyTimeToUtcIso(fromDate, fromTime),
      to: companyTimeToUtcIso(toDate, toTime, 59),
      mode,
    };
    const check = parseHeatmapQuery(new URL(heatmapUrl({ ...query, zoom: gridZoom }), "http://x").searchParams);
    if (!check.ok) {
      setFormErrors(check.errors);
      return;
    }
    setFormErrors({});
    setRunId((r) => r + 1);
    setSubmitted({ ...query, id: runId + 1 });
  };

  const onClear = () => {
    setSelected([]);
    setFormErrors({});
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const serverErrors =
    heatmap.error instanceof HeatmapRequestError && heatmap.error.status === 422
      ? heatmap.error.body?.errors
      : undefined;
  const fieldErrors = { ...serverErrors, ...formErrors };
  const requestError =
    heatmap.error && !serverErrors
      ? heatmap.error instanceof HeatmapRequestError && heatmap.error.status !== 0
        ? te(heatmap.error.body?.kind ?? "unknown")
        : te("network")
      : null;

  const mapStyle = useMemo(
    () => ({
      visible: toolbar.visible,
      colorRange: GRADIENTS[toolbar.gradient],
      opacity: toolbar.opacity,
      radius: toolbar.radius,
    }),
    [toolbar],
  );

  const loading = heatmap.isFetching;

  // Selected count for display
  const selectedCount = visibleTargets.filter((t) => selected.includes(t.key)).length;

  return (
    <div ref={containerRef} className="relative size-full overflow-hidden bg-surface-2 select-none">
      {/* 1. Fullscreen base map (Google or OpenStreetMap, per /map-settings) with the heatmap layer and markers */}
      {!mapConfig.ready ? (
        <div className="size-full animate-pulse bg-surface-2" />
      ) : mapConfig.mapProvider === "osm" && mapConfig.maptilerApiKey ? (
        <HeatmapOsmMap
          maptilerKey={mapConfig.maptilerApiKey}
          cells={data?.cells ?? []}
          bounds={data?.bounds ?? null}
          fitKey={fitKey}
          style={mapStyle}
          onZoomChange={onZoomChange}
          markers={realMarkers}
        />
      ) : apiKey ? (
        <HeatmapMap
          apiKey={apiKey}
          mapId={mapConfig.googleMapsMapId}
          cells={data?.cells ?? []}
          bounds={data?.bounds ?? null}
          fitKey={fitKey}
          style={mapStyle}
          onZoomChange={onZoomChange}
          markers={realMarkers}
        />
      ) : (
        <div className="grid size-full place-items-center p-6">
          <Alert tone="warning" className="max-w-md">
            {t("map.noApiKey")}
          </Alert>
        </div>
      )}

      {/* 2. Floating Filter Card (Top-Left) */}
      {filterCollapsed ? (
        <button
          type="button"
          onClick={() => setFilterCollapsed(false)}
          className="absolute start-4 top-4 z-10 flex items-center gap-2 rounded-2xl border border-border/70 bg-surface/95 backdrop-blur-md px-3.5 py-2.5 shadow-lg font-bold text-xs text-foreground hover:bg-surface-2 transition-all cursor-pointer"
        >
          <Flame className="size-4 text-emerald-700" />
          <span>Filters</span>
          <Plus className="size-3.5 text-muted-foreground ms-1" />
        </button>
      ) : (
        <div className="absolute start-4 top-4 z-10 w-[320px] sm:w-[350px] max-h-[calc(100%-2rem)] flex flex-col rounded-2xl border border-border/70 bg-surface/95 backdrop-blur-md p-4 shadow-xl text-foreground overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Flame className="size-4.5 text-emerald-700" />
              <span className="font-bold text-sm text-foreground">Filters</span>
            </div>
            <button
              type="button"
              onClick={() => setFilterCollapsed(true)}
              title="Minimize filters"
              className="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <Minus className="size-4" />
            </button>
          </div>

          <form onSubmit={onShow} className="flex flex-col gap-3 pt-3" noValidate>
            {/* Vehicles Picker */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Vehicles</label>
              {/* Search */}
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <input
                  type="search"
                  value={vehicleSearch}
                  onChange={(e) => setVehicleSearch(e.target.value)}
                  placeholder="Search vehicles..."
                  className="h-8.5 w-full rounded-xl border border-border/80 bg-surface ps-8 pe-3 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                />
              </div>

              {/* Select all checkbox row */}
              <div className="flex items-center gap-2 py-1 text-xs">
                <input
                  type="checkbox"
                  id="select-all-vehicles"
                  checked={visibleTargets.length > 0 && visibleTargets.every((t) => selected.includes(t.key))}
                  onChange={handleToggleSelectAll}
                  className="size-3.5 rounded border-border-strong accent-primary cursor-pointer"
                />
                <label htmlFor="select-all-vehicles" className="cursor-pointer text-muted-foreground text-xs font-medium">
                  Select all ({selectedCount}/{visibleTargets.length})
                </label>
              </div>

              {/* Vehicle list with real vehicles from database */}
              <div className="max-h-36 overflow-y-auto space-y-0.5 pe-1 border border-border/60 rounded-xl p-1 bg-surface/50">
                {visibleTargets.length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground text-center">No vehicles found</p>
                ) : (
                  visibleTargets.map((target) => {
                    const isChecked = selected.includes(target.key);
                    const { plate, alias, kind } = parseTargetDisplay(target.label);
                    const pts = targetPointCounts[target.key];
                    return (
                      <label
                        key={target.key}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors",
                          isChecked ? "bg-primary/5 text-foreground" : "hover:bg-surface-2 text-foreground",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleToggleVehicle(target.key, e.target.checked)}
                          className="size-3.5 rounded border-border-strong accent-primary cursor-pointer shrink-0"
                        />
                        <TargetVehicleIcon kind={kind} className="size-3.5 text-slate-700 shrink-0" />
                        <span className="font-bold text-xs truncate" dir="ltr">
                          {plate}
                        </span>
                        {alias && (
                          <span className="text-muted-foreground text-xs font-normal truncate">
                            ({alias})
                          </span>
                        )}
                        <span className="ms-auto shrink-0 text-[10px] font-medium">
                          {typeof pts === "number" && pts > 0 ? (
                            <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5">
                              {t("summary.pointsInRange", { count: pts.toLocaleString("en") })}
                            </span>
                          ) : typeof pts === "number" ? (
                            <span className="text-muted-foreground/60">{t("summary.pointsInRange", { count: 0 })}</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Date & Time Pickers */}
            <div className="grid grid-cols-2 gap-2">
              {/* From Date */}
              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1">From date</label>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openPicker(fromDateRef)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPicker(fromDateRef);
                    }
                  }}
                  className="relative cursor-pointer group"
                >
                  <div className="h-8.5 w-full rounded-xl border border-border/80 bg-surface px-2.5 flex items-center justify-between text-xs text-foreground group-hover:border-primary/60 transition-colors shadow-2xs">
                    <span className="font-medium truncate">{formatDateDisplay(fromDate)}</span>
                    <Calendar className="size-3.5 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                  </div>
                  <input
                    ref={fromDateRef}
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    onClick={(e) => {
                      e.stopPropagation();
                      try {
                        e.currentTarget.showPicker?.();
                      } catch {}
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </div>
              </div>

              {/* From Time */}
              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1">From time</label>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openPicker(fromTimeRef)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPicker(fromTimeRef);
                    }
                  }}
                  className="relative cursor-pointer group"
                >
                  <div className="h-8.5 w-full rounded-xl border border-border/80 bg-surface px-2.5 flex items-center justify-between text-xs text-foreground group-hover:border-primary/60 transition-colors shadow-2xs">
                    <span className="font-medium truncate">{formatTimeDisplay(fromTime)}</span>
                    <Clock className="size-3.5 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                  </div>
                  <input
                    ref={fromTimeRef}
                    type="time"
                    value={fromTime}
                    onChange={(e) => setFromTime(e.target.value)}
                    onClick={(e) => {
                      e.stopPropagation();
                      try {
                        e.currentTarget.showPicker?.();
                      } catch {}
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </div>
              </div>

              {/* To Date */}
              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1">To date</label>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openPicker(toDateRef)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPicker(toDateRef);
                    }
                  }}
                  className="relative cursor-pointer group"
                >
                  <div className="h-8.5 w-full rounded-xl border border-border/80 bg-surface px-2.5 flex items-center justify-between text-xs text-foreground group-hover:border-primary/60 transition-colors shadow-2xs">
                    <span className="font-medium truncate">{formatDateDisplay(toDate)}</span>
                    <Calendar className="size-3.5 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                  </div>
                  <input
                    ref={toDateRef}
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    onClick={(e) => {
                      e.stopPropagation();
                      try {
                        e.currentTarget.showPicker?.();
                      } catch {}
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </div>
              </div>

              {/* To Time */}
              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1">To time</label>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openPicker(toTimeRef)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPicker(toTimeRef);
                    }
                  }}
                  className="relative cursor-pointer group"
                >
                  <div className="h-8.5 w-full rounded-xl border border-border/80 bg-surface px-2.5 flex items-center justify-between text-xs text-foreground group-hover:border-primary/60 transition-colors shadow-2xs">
                    <span className="font-medium truncate">{formatTimeDisplay(toTime)}</span>
                    <Clock className="size-3.5 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                  </div>
                  <input
                    ref={toTimeRef}
                    type="time"
                    value={toTime}
                    onChange={(e) => setToTime(e.target.value)}
                    onClick={(e) => {
                      e.stopPropagation();
                      try {
                        e.currentTarget.showPicker?.();
                      } catch {}
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </div>
              </div>
            </div>

            {/* Weight mode */}
            <div>
              <label htmlFor="heatmap-mode" className="block text-[11px] font-semibold text-foreground mb-1">
                {t("filters.weightMode")}
              </label>
              <Select
                id="heatmap-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as WeightMode)}
                className="h-8.5 rounded-xl px-3 text-xs font-medium"
              >
                {(["dwell", "idle", "density"] as const).map((m) => (
                  <option key={m} value={m}>
                    {t(`modes.${m}.label`)}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-muted-foreground pt-1.5 leading-relaxed">{t(`modes.${mode}.hint`)}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-[#0f4c47] hover:bg-[#0c3e3a] text-white font-semibold rounded-xl h-9.5 shadow-sm inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                <span>Show Heatmap</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onClear}
                className="rounded-xl h-9.5 px-4 font-semibold border-border/80 cursor-pointer"
              >
                Clear
              </Button>
            </div>

            {/* Summary of the heatmap shown */}
            {data && (
              <div className="pt-2 border-t border-border/50 text-[11px] flex items-center justify-between text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground">{t("summary.points")}:</span>{" "}
                  {data.total_points.toLocaleString("en")}
                </span>
                <span>
                  <span className="font-semibold text-foreground">{t("summary.cells")}:</span>{" "}
                  {data.cell_count.toLocaleString("en")}
                </span>
              </div>
            )}
            {data?.truncated ? (
              <Alert tone="warning">{t("summary.truncated", { count: data.cell_count.toLocaleString("en") })}</Alert>
            ) : null}
            {data && data.dropped_points > 0 ? (
              <p className="text-[11px] text-muted-foreground">{t("summary.dropped", { count: data.dropped_points })}</p>
            ) : null}

            {data && data.total_points === 0 && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-800 dark:text-amber-200">
                <p className="font-semibold">{t("map.noData")}</p>
                <p className="text-[11px] mt-0.5 text-muted-foreground">{t("map.noDataHint")}</p>
              </div>
            )}

            {requestError && <Alert tone="error">{requestError}</Alert>}
            {Object.keys(fieldErrors).length > 0 && (
              <p className="text-xs text-destructive">
                {Object.values(fieldErrors).flat().join(" ")}
              </p>
            )}
          </form>
        </div>
      )}

      {/* 3. Floating Heatmap Controls Toolbar (Top Center / Right) */}
      <div className="pointer-events-none absolute inset-x-4 top-4 flex justify-center md:justify-end">
        <div className="pointer-events-auto">
          <HeatmapToolbar
            value={toolbar}
            onChange={setToolbar}
            onToggleFullscreen={toggleFullscreen}
          />
        </div>
      </div>
    </div>
  );
}
