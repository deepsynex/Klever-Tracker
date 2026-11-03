"use client";

import { AdvancedMarker, AdvancedMarkerAnchorPoint, APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { Bike, CarFront, Navigation, RefreshCw, Search, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { gqlRequest } from "@/lib/graphql/client";
import {
  GET_POSITION_HISTORY,
  GET_VEHICLES,
  type PositionHistoryPoint,
  type PositionHistoryResult,
  type VehiclesResult,
} from "@/lib/graphql/operations";
import { DUBAI_CENTER } from "@/lib/heatmap/client";
import { bearing, metres } from "@/lib/history/road-path";
import { cn } from "@/lib/utils";

type LiveVehicle = {
  id: string;
  plateNo: string;
  vehicleName: string | null;
  kind: "truck" | "van" | "bike" | "car";
  lat: number | null;
  lng: number | null;
  speed: number;
  recordedAt: string | null;
  status: "moving" | "stopped" | "offline";
  /** Compass degrees the arrow points (0 = north); null when unknown. */
  heading: number | null;
};

/** Same arrow colour as the public /track page. */
const ARROW_FILL = "#0B6E69";

/**
 * Direction for the arrow: the device's own heading for the newest fix, or else the bearing from
 * the previous fix that is far enough away to give a direction (newest first).
 */
function headingFor(fixes: PositionHistoryPoint[]): number | null {
  const [latest, ...older] = fixes;
  if (!latest) return null;
  if (typeof latest.heading === "number") return ((latest.heading % 360) + 360) % 360;
  const here = { lat: latest.locationLat!, lng: latest.locationLng! };
  const previous = older.find((p) => metres({ lat: p.locationLat!, lng: p.locationLng! }, here) > 10);
  return previous ? bearing({ lat: previous.locationLat!, lng: previous.locationLng! }, here) : null;
}

/** The /track page's navigation arrow, turned to the vehicle's heading, with its details on hover. */
function VehicleArrow({ vehicle, selected, hovered }: { vehicle: LiveVehicle; selected: boolean; hovered: boolean }) {
  const t = useTranslations("tracking.marker");
  const status =
    vehicle.status === "moving" ? t("moving", { speed: vehicle.speed }) : vehicle.status === "stopped" ? t("stopped") : t("offline");

  return (
    <div className="relative grid size-9 cursor-pointer place-items-center">
      {selected ? <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" aria-hidden /> : null}
      <svg
        viewBox="0 0 24 24"
        className={cn("relative size-7 drop-shadow-md transition-transform duration-500", (hovered || selected) && "scale-125")}
        style={{ transform: `rotate(${vehicle.heading ?? 0}deg)` }}
        aria-hidden
      >
        <path d="M12 2.5 20 21 12 16.8 4 21Z" fill={ARROW_FILL} stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" />
      </svg>

      {hovered ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full start-1/2 mb-2 w-max min-w-44 -translate-x-1/2 rounded-xl border border-border/70 bg-surface px-3 py-2.5 text-xs text-foreground shadow-xl rtl:translate-x-1/2"
        >
          <div className="flex items-center gap-1.5 font-bold">
            {vehicle.kind === "bike" ? (
              <Bike className="size-3.5" aria-hidden />
            ) : vehicle.kind === "truck" ? (
              <Truck className="size-3.5" aria-hidden />
            ) : (
              <CarFront className="size-3.5" aria-hidden />
            )}
            <span dir="ltr">{vehicle.plateNo}</span>
          </div>
          {vehicle.vehicleName ? <p className="mt-0.5 text-muted-foreground">{vehicle.vehicleName}</p> : null}
          <p className="mt-1.5 flex items-center gap-1.5 font-semibold">
            <span
              className={cn(
                "size-1.5 rounded-full",
                vehicle.status === "moving" ? "bg-emerald-500" : vehicle.status === "stopped" ? "bg-amber-500" : "bg-slate-400",
              )}
              aria-hidden
            />
            {status}
          </p>
          {vehicle.heading !== null ? (
            <p className="mt-0.5 text-muted-foreground">{t("heading", { deg: Math.round(vehicle.heading) })}</p>
          ) : null}
          {vehicle.recordedAt ? (
            <p className="mt-0.5 text-muted-foreground">
              {t("updated")}: <span className="font-mono text-[10px]" dir="ltr">{vehicle.recordedAt.slice(0, 16)}</span>
            </p>
          ) : null}
          {!selected ? <p className="mt-1.5 text-[10px] text-subtle">{t("track")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function getCategory(plate: string, name?: string | null): "truck" | "van" | "bike" | "car" {
  const combined = `${plate} ${name || ""}`.toLowerCase();
  if (combined.includes("bike") || combined.includes("motorcycle")) return "bike";
  if (combined.includes("van")) return "van";
  if (combined.includes("truck") || combined.includes("verify")) return "truck";
  return "car";
}

function MapController({ selected, vehicles }: { selected: LiveVehicle | null; vehicles: LiveVehicle[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (selected && selected.lat && selected.lng) {
      map.panTo({ lat: selected.lat, lng: selected.lng });
      map.setZoom(14);
      return;
    }

    const valid = vehicles.filter((v) => v.lat && v.lng);
    if (valid.length === 1 && valid[0].lat && valid[0].lng) {
      map.panTo({ lat: valid[0].lat, lng: valid[0].lng });
      map.setZoom(13);
    } else if (valid.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      valid.forEach((v) => bounds.extend({ lat: v.lat!, lng: v.lng! }));
      map.fitBounds(bounds, 64);
    }
  }, [map, selected, vehicles]);

  return null;
}

export function LiveTrackingView() {
  const tNav = useTranslations("nav");
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [search, setSearch] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [hoveredVehicleId, setHoveredVehicleId] = useState<string | null>(null);

  // Query vehicles from real database
  const vehiclesQuery = useQuery({
    queryKey: ["live-tracking", "vehicles"],
    queryFn: async () => {
      const vRes = await gqlRequest<VehiclesResult>(GET_VEHICLES, { first: 100 });
      const vList = vRes.vehicles?.data ?? [];

      const items: LiveVehicle[] = await Promise.all(
        vList.map(async (v) => {
          const kind = getCategory(v.plateNo, v.vehicleName);
          let lat: number | null = null;
          let lng: number | null = null;
          let speed = 0;
          let recordedAt: string | null = null;
          let status: "moving" | "stopped" | "offline" = "offline";
          let heading: number | null = null;

          try {
            const posRes = await gqlRequest<PositionHistoryResult>(GET_POSITION_HISTORY, {
              vehicleId: v.id,
              first: 10,
            });
            // Newest first: the first valid fix is the current position.
            const fixes = (posRes.positionHistory?.data ?? []).filter(
              (p) => p.locationLat && p.locationLng && Math.abs(p.locationLat) > 0.01,
            );
            const valid = fixes[0];
            if (valid && valid.locationLat && valid.locationLng) {
              lat = valid.locationLat;
              lng = valid.locationLng;
              speed = Math.round(valid.speed ?? 0);
              recordedAt = valid.recordedAt;
              status = speed > 3 ? "moving" : "stopped";
              heading = headingFor(fixes);
            }
          } catch {
            // Handled gracefully
          }

          return {
            id: v.id,
            plateNo: v.plateNo,
            vehicleName: v.vehicleName ?? null,
            kind,
            lat,
            lng,
            speed,
            recordedAt,
            status,
            heading,
          };
        }),
      );

      return items;
    },
    refetchInterval: 30_000,
  });

  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);
  const filteredVehicles = useMemo(() => {
    if (!search.trim()) return vehicles;
    const q = search.toLowerCase();
    return vehicles.filter(
      (v) => v.plateNo.toLowerCase().includes(q) || (v.vehicleName || "").toLowerCase().includes(q),
    );
  }, [vehicles, search]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId],
  );

  return (
    <div className="relative size-full overflow-hidden bg-surface-2 select-none">
      {/* Google Map */}
      {apiKey ? (
        <APIProvider apiKey={apiKey}>
          <Map
            className="size-full"
            mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"}
            defaultCenter={DUBAI_CENTER}
            defaultZoom={11}
            gestureHandling="greedy"
            streetViewControl={false}
            mapTypeControl={false}
            fullscreenControl={false}
            zoomControl={true}
          >
            <MapController selected={selectedVehicle} vehicles={vehicles} />
            {vehicles
              .filter((v) => v.lat && v.lng)
              .map((v) => {
                const isSelected = v.id === selectedVehicleId;
                const isHovered = v.id === hoveredVehicleId;
                return (
                  <AdvancedMarker
                    key={v.id}
                    position={{ lat: v.lat!, lng: v.lng! }}
                    title={v.plateNo}
                    // Centre the arrow on the fix (the default anchor is bottom-centre, for pins).
                    anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
                    // The hovered arrow's card, then the followed vehicle, sit above the others.
                    zIndex={isHovered ? 3 : isSelected ? 2 : 1}
                    onClick={() => setSelectedVehicleId(v.id)}
                    onMouseEnter={() => setHoveredVehicleId(v.id)}
                    onMouseLeave={() => setHoveredVehicleId((id) => (id === v.id ? null : id))}
                  >
                    <VehicleArrow vehicle={v} selected={isSelected} hovered={isHovered} />
                  </AdvancedMarker>
                );
              })}
          </Map>
        </APIProvider>
      ) : (
        <div className="grid size-full place-items-center">Google Maps API Key not configured</div>
      )}

      {/* Floating Vehicles Panel on Left */}
      <div className="absolute start-4 top-4 z-10 w-[300px] sm:w-[340px] max-h-[calc(100%-2rem)] flex flex-col rounded-2xl border border-border/70 bg-surface/95 backdrop-blur-md p-4 shadow-xl text-foreground overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Navigation className="size-4.5 text-primary" />
            <span className="font-bold text-sm text-foreground">{tNav("liveTracking")}</span>
          </div>
          <button
            type="button"
            onClick={() => vehiclesQuery.refetch()}
            title="Refresh fleet data"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <RefreshCw className={cn("size-3.5", vehiclesQuery.isFetching && "animate-spin text-primary")} />
          </button>
        </div>

        {/* Search */}
        <div className="relative pt-3 pb-2">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vehicles..."
            className="h-8.5 w-full rounded-xl border border-border/80 bg-surface ps-8 pe-3 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
          />
        </div>

        {/* Vehicles list */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pe-1 pt-1 max-h-[380px]">
          {filteredVehicles.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {vehiclesQuery.isPending ? "Loading real fleet data..." : "No vehicles found"}
            </p>
          ) : (
            filteredVehicles.map((v) => {
              const isSelected = v.id === selectedVehicleId;
              const hasFix = v.lat !== null && v.lng !== null;
              return (
                <div
                  key={v.id}
                  onClick={() => hasFix && setSelectedVehicleId(v.id)}
                  className={cn(
                    "flex flex-col gap-1 p-2.5 rounded-xl border transition-all text-xs",
                    hasFix ? "cursor-pointer" : "opacity-75 cursor-default",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-xs"
                      : "border-border/60 bg-surface hover:bg-surface-2/60",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold">
                      {v.kind === "bike" ? (
                        <Bike className="size-3.5 text-slate-700" />
                      ) : v.kind === "truck" ? (
                        <Truck className="size-3.5 text-slate-700" />
                      ) : (
                        <CarFront className="size-3.5 text-slate-700" />
                      )}
                      <span dir="ltr">{v.plateNo}</span>
                      {v.vehicleName && (
                        <span className="font-normal text-muted-foreground truncate">({v.vehicleName})</span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                        v.status === "moving"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : v.status === "stopped"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-slate-50 text-slate-600 border-slate-200",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          v.status === "moving"
                            ? "bg-emerald-500 animate-pulse"
                            : v.status === "stopped"
                              ? "bg-amber-500"
                              : "bg-slate-400",
                        )}
                      />
                      {v.status === "moving" ? `${v.speed} km/h` : v.status === "stopped" ? "Stopped" : "Offline"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                    <span>{hasFix ? "GPS Connected" : "No recent GPS fix"}</span>
                    {v.recordedAt && (
                      <span className="font-mono text-[10px]">{v.recordedAt.slice(0, 16)}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
