"use client";

import { Bike, CarFront, IdCard, Phone, RefreshCw, Search, Truck, UserRound, X } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import type { LiveStatus } from "@/lib/live/status";
import type { DeviceReadings } from "@/lib/telemetry/device-readings";
import { parseApiDateTime } from "@/lib/vehicle-management/helpers";
import { useVmLookups } from "@/lib/vehicle-management/use-vm";
import { cn } from "@/lib/utils";

/**
 * The live map's search panels, opened from the toolbar: "Search Vehicle" (by plate, name or
 * driver) and "Search Driver" (by name, mobile, employee id or vehicle), each with its own search.
 * Picking either follows the vehicle on the map. Desktop: floats on the start side; phones: a
 * bottom sheet.
 */

export type FleetVehicle = {
  id: string;
  plateNo: string;
  vehicleName: string | null;
  kind: "truck" | "van" | "bike" | "car";
  lat: number | null;
  lng: number | null;
  speed: number;
  recordedAt: string | null;
  status: LiveStatus;
  readings: DeviceReadings | null;
};

/** API times are UTC; shown in the user's / company's time zone. */
const TIME_PATTERN = "dd-MM-yyyy HH:mm";
const KM = new Intl.NumberFormat("en", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** "14.1 V · 1,071.2 km · eco 8.3" for a vehicle card; null when there's nothing to show. */
function readingsLine(r: DeviceReadings | null, ecoLabel: string): string | null {
  if (!r) return null;
  const parts = [
    r.vehicleBatteryV !== null ? `${r.vehicleBatteryV.toFixed(1)} V` : null,
    r.odometerKm !== null ? `${KM.format(r.odometerKm)} km` : null,
    r.ecoScore !== null ? `${ecoLabel} ${r.ecoScore.toFixed(1)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

const STATUS_BADGE = {
  moving: { box: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500 animate-pulse" },
  idle: { box: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  stopped: { box: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
  offline: { box: "bg-slate-50 text-slate-600 border-slate-200", dot: "bg-slate-400" },
} as const;

export type FleetPanelMode = "vehicles" | "drivers";

export function FleetPanel({
  mode,
  vehicles,
  loading,
  fetching,
  selectedId,
  onRefresh,
  onSelect,
  onClose,
}: {
  /** Which search this panel is. */
  mode: FleetPanelMode;
  vehicles: FleetVehicle[];
  loading: boolean;
  fetching: boolean;
  selectedId: string | null;
  onRefresh: () => void;
  onSelect: (vehicleId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("tracking.live.fleet");
  const tMarker = useTranslations("tracking.marker");
  const zone = useCompanyTimeZone();
  const format = useFormatter();
  // "Last seen 4 hours ago" is measured from now, refreshed every minute.
  const now = useNow({ updateInterval: 60_000 });
  const lookups = useVmLookups();
  const tab = mode;
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const driverOf = (vehicleId: string) => {
    const driverId = lookups.vehicleById.get(vehicleId)?.primaryDriverId;
    return driverId ? (lookups.driverById.get(driverId) ?? null) : null;
  };
  const vehicleOfDriver = useMemo(() => {
    const map = new Map<string, FleetVehicle>();
    for (const v of vehicles) {
      const driverId = lookups.vehicleById.get(v.id)?.primaryDriverId;
      if (driverId && !map.has(driverId)) map.set(driverId, v);
    }
    return map;
  }, [vehicles, lookups.vehicleById]);

  const shownVehicles = vehicles.filter(
    (v) => !q || [v.plateNo, v.vehicleName ?? "", driverOf(v.id)?.name ?? ""].some((s) => s.toLowerCase().includes(q)),
  );
  const shownDrivers = lookups.drivers.filter(
    (d) => !q || [d.name, d.mobile ?? "", d.employeeId ?? "", vehicleOfDriver.get(d.id)?.plateNo ?? ""].some((s) => s.toLowerCase().includes(q)),
  );

  /** "GPS connected", "Last seen 4 hours ago" for a silent tracker, or "No recent GPS fix". */
  const connection = (v: FleetVehicle) => {
    if (v.lat === null || v.lng === null) return t("noFix");
    const seen = v.status === "offline" ? parseApiDateTime(v.recordedAt) : null;
    return seen ? t("lastSeen", { ago: format.relativeTime(seen, now) }) : t("gpsConnected");
  };
  const statusText = (v: FleetVehicle) => (v.status === "moving" ? `${v.speed} km/h` : t(v.status));

  return (
    <section
      aria-label={t(`panels.${mode}`)}
      className={cn(
        "absolute z-10 flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-surface/95 p-3 text-foreground shadow-xl backdrop-blur-md",
        "inset-x-2 bottom-2 max-h-[60%] sm:inset-x-auto sm:start-4 sm:top-4 sm:bottom-auto sm:max-h-[calc(100%-2rem)] sm:w-[340px]",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 ps-1 pb-3">
        {mode === "vehicles" ? <CarFront className="size-4.5 shrink-0 text-primary" aria-hidden /> : <UserRound className="size-4.5 shrink-0 text-primary" aria-hidden />}
        <h2 className="text-sm font-bold">{t(`panels.${mode}`)}</h2>
        <span className="rounded-full bg-primary-soft px-1.5 text-[10px] font-bold text-primary">{mode === "vehicles" ? vehicles.length : lookups.drivers.length}</span>
        <button
          type="button"
          onClick={onRefresh}
          title={t("refresh")}
          aria-label={t("refresh")}
          className="ms-auto cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <RefreshCw className={cn("size-3.5", fetching && "animate-spin text-primary")} />
        </button>
        <button type="button" onClick={onClose} aria-label={t("close")} className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      {/* Search */}
      <div className="relative py-3">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === "vehicles" ? t("searchVehicles") : t("searchDrivers")}
          aria-label={tab === "vehicles" ? t("searchVehicles") : t("searchDrivers")}
          className="h-8.5 w-full rounded-xl border border-border/80 bg-surface ps-8 pe-3 text-xs text-foreground shadow-2xs placeholder:text-muted-foreground/70 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
        />
      </div>

      {/* List */}
      <div className="-me-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-3 sm:max-h-[380px] [scrollbar-width:thin]">
        {tab === "vehicles" ? (
          shownVehicles.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">{loading ? t("loading") : t("noVehicles")}</p>
          ) : (
            shownVehicles.map((v) => {
              const hasFix = v.lat !== null && v.lng !== null;
              const driver = driverOf(v.id);
              const line = readingsLine(v.readings, tMarker("ecoShort"));
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={!hasFix}
                  onClick={() => onSelect(v.id)}
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-xl border p-2.5 text-start text-xs transition-all",
                    hasFix ? "cursor-pointer" : "cursor-default opacity-75",
                    v.id === selectedId ? "border-primary bg-primary/5 shadow-xs" : "border-border/60 bg-surface hover:bg-surface-2/60",
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 font-bold">
                      {v.kind === "bike" ? <Bike className="size-3.5 shrink-0 text-slate-700" /> : v.kind === "truck" ? <Truck className="size-3.5 shrink-0 text-slate-700" /> : <CarFront className="size-3.5 shrink-0 text-slate-700" />}
                      <span dir="ltr">{v.plateNo}</span>
                      {v.vehicleName ? <span className="truncate font-normal text-muted-foreground">({v.vehicleName})</span> : null}
                    </span>
                    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", STATUS_BADGE[v.status].box)}>
                      <span className={cn("size-1.5 rounded-full", STATUS_BADGE[v.status].dot)} />
                      {statusText(v)}
                    </span>
                  </span>
                  {driver ? (
                    <span className="flex items-center gap-1 text-[11px] text-foreground/80">
                      <UserRound className="size-3 text-primary" aria-hidden />
                      {driver.name}
                    </span>
                  ) : null}
                  <span className="flex w-full items-center justify-between pt-0.5 text-[11px] text-muted-foreground">
                    <span className={cn(v.status === "offline" && hasFix && "font-semibold text-slate-600")}>{connection(v)}</span>
                    {v.recordedAt ? (
                      <span className="font-mono text-[10px]" dir="ltr">
                        {formatInCompanyTz(v.recordedAt, zone, TIME_PATTERN)}
                      </span>
                    ) : null}
                  </span>
                  {line ? (
                    <span className="text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                      {line}
                    </span>
                  ) : null}
                </button>
              );
            })
          )
        ) : shownDrivers.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{lookups.isPending ? t("loading") : t("noDrivers")}</p>
        ) : (
          shownDrivers.map((d) => {
            const v = vehicleOfDriver.get(d.id) ?? null;
            const canFollow = Boolean(v && v.lat !== null && v.lng !== null);
            return (
              <button
                key={d.id}
                type="button"
                disabled={!canFollow}
                onClick={() => v && onSelect(v.id)}
                title={!v ? t("noVehicleAssigned") : !canFollow ? t("noFix") : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-start text-xs transition-all",
                  canFollow ? "cursor-pointer" : "cursor-default opacity-75",
                  v && v.id === selectedId ? "border-primary bg-primary/5 shadow-xs" : "border-border/60 bg-surface hover:bg-surface-2/60",
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                  <UserRound className="size-4" aria-hidden />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate font-bold">{d.name}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    {d.mobile ? (
                      <span className="inline-flex items-center gap-1" dir="ltr">
                        <Phone className="size-3" aria-hidden />
                        {d.mobile}
                      </span>
                    ) : null}
                    {d.employeeId ? (
                      <span className="inline-flex items-center gap-1" dir="ltr">
                        <IdCard className="size-3" aria-hidden />
                        {d.employeeId}
                      </span>
                    ) : null}
                  </span>
                </span>
                {v ? (
                  <span className="grid shrink-0 justify-items-end gap-1">
                    <span className="font-bold" dir="ltr">
                      {v.plateNo}
                    </span>
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", STATUS_BADGE[v.status].box)}>
                      <span className={cn("size-1.5 rounded-full", STATUS_BADGE[v.status].dot)} />
                      {statusText(v)}
                    </span>
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-muted-foreground">{t("noVehicleAssigned")}</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
