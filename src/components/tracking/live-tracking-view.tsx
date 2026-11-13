"use client";

import { AdvancedMarker, AdvancedMarkerAnchorPoint, APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { Bike, CarFront, Timer, Truck, UserSearch } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { gqlRequest } from "@/lib/graphql/client";
import {
  GET_LATEST_POSITIONS_WITH_READINGS,
  GET_VEHICLES,
  type PositionHistoryPoint,
  type LatestPositionsWithReadingsResult,
  type VehiclesResult,
} from "@/lib/graphql/operations";
import { DUBAI_CENTER } from "@/lib/heatmap/client";
import { bearing, metres } from "@/lib/history/road-path";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import { useMapConfig } from "@/lib/map-settings";
import { takeLiveFocus } from "@/lib/notifications/api";
import { engineCharging, formatEngineTime, latestReadings, type DeviceReadings } from "@/lib/telemetry/device-readings";
import { cn } from "@/lib/utils";
import { useExcessiveIdling } from "@/lib/idling/use-excessive-idling";
import { clusterPoints } from "@/lib/live/cluster";
import { liveStatus, type LiveStatus } from "@/lib/live/status";
import { parseApiDateTime } from "@/lib/vehicle-management/helpers";
import { FleetPanel, type FleetPanelMode } from "./fleet-panel";
import { IdlingPanel } from "./idling-panel";
import { GeofenceToolbar, GoogleGeofenceLayer, ToolbarButton, useLiveGeofences } from "./live-geofences";
import { CarTopDown, ClusterBubble, PlateTag } from "./vehicle-marker";

// MapLibre is only downloaded when the platform uses OpenStreetMap.
const LiveOsmMap = dynamic(() => import("./live-osm-map").then((m) => m.LiveOsmMap), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-surface-2" />,
}) as typeof import("./live-osm-map").LiveOsmMap; // dynamic() drops the generic

/** API times are UTC; show them in the user's / company's time zone like the rest of the app. */
const TIME_PATTERN = "dd-MM-yyyy HH:mm";

type LiveVehicle = {
  id: string;
  plateNo: string;
  vehicleName: string | null;
  kind: "truck" | "van" | "bike" | "car";
  lat: number | null;
  lng: number | null;
  speed: number;
  recordedAt: string | null;
  status: LiveStatus;
  /** Compass degrees the arrow points (0 = north); null when unknown. */
  heading: number | null;
  /** The tracker's newest readings (battery, odometer, engine hours…); null without tracker data. */
  readings: DeviceReadings | null;
};

const KM = new Intl.NumberFormat("en", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** A focus request taken from storage but not applied yet (see the effect in LiveTrackingView). */
let pendingFocus: string | null = null;


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

/** A top-down car in its status colour, turned to its heading, with its plate above and its details on hover. */
function VehicleArrow({ vehicle, selected, hovered }: { vehicle: LiveVehicle; selected: boolean; hovered: boolean }) {
  const t = useTranslations("tracking.marker");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const zone = useCompanyTimeZone();
  const lastSeen = parseApiDateTime(vehicle.recordedAt);
  const status =
    vehicle.status === "moving"
      ? t("moving", { speed: vehicle.speed })
      : vehicle.status === "idle" || vehicle.status === "stopped"
        ? t(vehicle.status)
        : lastSeen
          ? t("offlineLastSeen", { ago: format.relativeTime(lastSeen, now) })
          : t("offline");

  return (
    <div className="relative grid size-11 cursor-pointer place-items-center">
      {selected ? <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" aria-hidden /> : null}
      <CarTopDown status={vehicle.status} heading={vehicle.heading} className={cn((hovered || selected) && "scale-125")} />
      {/* The plate, always shown (the hover card replaces it) */}
      {!hovered ? (
        <span className="absolute bottom-[calc(100%-4px)] start-1/2 -translate-x-1/2 rtl:translate-x-1/2">
          <PlateTag plate={vehicle.plateNo} selected={selected} />
        </span>
      ) : null}

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
                vehicle.status === "moving"
                  ? "bg-emerald-500"
                  : vehicle.status === "stopped"
                    ? "bg-amber-500"
                    : "bg-slate-400",
              )}
              aria-hidden
            />
            {status}
          </p>
          {vehicle.heading !== null ? (
            <p className="mt-0.5 text-muted-foreground">{t("heading", { deg: Math.round(vehicle.heading) })}</p>
          ) : null}
          <ReadingsGrid r={vehicle.readings} />
          {vehicle.recordedAt ? (
            <p className="mt-0.5 text-muted-foreground">
              {t("updated")}:{" "}
              <span className="font-mono text-[10px]" dir="ltr">
                {formatInCompanyTz(vehicle.recordedAt, zone, TIME_PATTERN)}
              </span>
            </p>
          ) : null}
          {!selected ? <p className="mt-1.5 text-[10px] text-subtle">{t("track")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** The tracker's readings in the hover card: a compact two-column grid, missing values hidden. */
function ReadingsGrid({ r }: { r: DeviceReadings | null }) {
  const t = useTranslations("tracking.marker");
  if (!r) return null;
  const charging = engineCharging(r.vehicleBatteryV);
  const rows: Array<[string, string]> = [];
  if (r.vehicleBatteryV !== null)
    rows.push([
      t("battery"),
      `${r.vehicleBatteryV.toFixed(1)} V${charging === null ? "" : ` · ${charging ? t("engineOn") : t("engineOff")}`}`,
    ]);
  if (r.odometerKm !== null) rows.push([t("odometer"), `${KM.format(r.odometerKm)} km`]);
  const engine = formatEngineTime(r.engineSeconds);
  if (engine) rows.push([t("engineHours"), engine]);
  if (r.tripKm !== null && (r.moving || charging)) rows.push([t("trip"), `${r.tripKm.toFixed(2)} km`]);
  if (r.ecoScore !== null) rows.push([t("eco"), `${r.ecoScore.toFixed(1)} / 10`]);
  if (r.gsmSignal !== null || r.gpsFix !== null)
    rows.push([
      t("signal"),
      [
        r.gsmSignal !== null ? `GSM ${r.gsmSignal}/5` : null,
        r.gpsFix === null ? null : r.gpsFix ? t("gpsFix") : t("gpsNoFix"),
      ]
        .filter(Boolean)
        .join(" · "),
    ]);
  if (rows.length === 0) return null;
  return (
    <dl className="mt-1.5 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 border-t border-border/60 pt-1.5 text-[11px]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-end font-medium tabular-nums" dir="ltr">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Google Maps: each vehicle as a car, or nearby vehicles as one numbered bubble (regrouped on every
 * zoom). Clicking a bubble zooms to its vehicles.
 */
function GoogleVehicles({
  vehicles,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  clusterLabel,
}: {
  vehicles: LiveVehicle[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (update: (current: string | null) => string | null) => void;
  clusterLabel: (count: number) => string;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(11);
  useEffect(() => {
    if (!map) return;
    const listener = map.addListener("zoom_changed", () => setZoom(map.getZoom() ?? 11));
    return () => listener.remove();
  }, [map]);
  const groups = useMemo(
    () =>
      clusterPoints(
        vehicles.filter((v) => v.lat && v.lng).map((v) => ({ ...v, lat: v.lat!, lng: v.lng! })),
        Math.round(zoom),
        selectedId,
      ),
    [vehicles, zoom, selectedId],
  );

  return (
    <>
      {groups.map((g) => {
        if (g.kind === "cluster") {
          return (
            <AdvancedMarker
              key={g.id}
              position={{ lat: g.lat, lng: g.lng }}
              anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
              zIndex={0}
              onClick={() => {
                const bounds = new google.maps.LatLngBounds();
                g.points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
                map?.fitBounds(bounds, 96);
              }}
            >
              <ClusterBubble counts={g.counts} label={clusterLabel(g.points.length)} />
            </AdvancedMarker>
          );
        }
        const v = g.point;
        const isSelected = v.id === selectedId;
        const isHovered = v.id === hoveredId;
        return (
          <AdvancedMarker
            key={v.id}
            position={{ lat: v.lat, lng: v.lng }}
            title={v.plateNo}
            // Centre the car on the fix (the default anchor is bottom-centre, for pins).
            anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
            // The hovered car's card, then the followed vehicle, sit above the others.
            zIndex={isHovered ? 3 : isSelected ? 2 : 1}
            onClick={() => onSelect(v.id)}
            onMouseEnter={() => onHover(() => v.id)}
            onMouseLeave={() => onHover((id) => (id === v.id ? null : id))}
          >
            <VehicleArrow vehicle={v} selected={isSelected} hovered={isHovered} />
          </AdvancedMarker>
        );
      })}
    </>
  );
}

const LAST_STATUS = /* GraphQL */ `
  query LiveLastStatus {
    deviceLastPositions(first: 500) {
      data {
        vehicleId
        status
      }
    }
  }
`;
type LastStatusResult = { deviceLastPositions: { data: Array<{ vehicleId: string | null; status: string | null }> } };

function getCategory(plate: string, name?: string | null): "truck" | "van" | "bike" | "car" {
  const combined = `${plate} ${name || ""}`.toLowerCase();
  if (combined.includes("bike") || combined.includes("motorcycle")) return "bike";
  if (combined.includes("van")) return "van";
  if (combined.includes("truck") || combined.includes("verify")) return "truck";
  return "car";
}

function MapController({ selected, vehicles, panelPx }: { selected: LiveVehicle | null; vehicles: LiveVehicle[]; panelPx: () => number }) {
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
      // Extra room on the side the Vehicles & Drivers panel covers, while it's open (same rule as the OpenStreetMap map).
      const panel = panelPx();
      const rtl = document.documentElement.dir === "rtl";
      map.fitBounds(bounds, { top: 64, bottom: 64, left: rtl ? 64 : 64 + panel, right: rtl ? 64 + panel : 64 });
    }
  }, [map, selected, vehicles, panelPx]);

  return null;
}

export function LiveTrackingView() {
  const tMarker = useTranslations("tracking.marker");
  const mapConfig = useMapConfig();
  const apiKey = mapConfig.googleMapsApiKey ?? "";
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  // Search Vehicle / Search Driver open from the toolbar, one at a time (closed at first, so the map shows).
  const [fleetPanel, setFleetPanel] = useState<FleetPanelMode | null>(null);
  const fleetOpen = fleetPanel !== null;
  const fleetOpenRef = useRef(fleetOpen);
  useEffect(() => {
    fleetOpenRef.current = fleetOpen;
  });
  /** Map fits leave room for the open panel on the start side (desktop only; on phones it's a bottom sheet). */
  const panelPx = useCallback(() => (fleetOpenRef.current && window.innerWidth >= 640 ? 380 : 0), []);
  const tFleet = useTranslations("tracking.live.fleet");
  const [hoveredVehicleId, setHoveredVehicleId] = useState<string | null>(null);
  const [showGeofences, setShowGeofences] = useState(false);
  // Bumped each time geofences are switched on, so the map fits them once.
  const [geofenceFitKey, setGeofenceFitKey] = useState(0);
  // Excessive idling: engine on, standing still past the vehicle's idle limit (refreshed every 30 s).
  const [showIdling, setShowIdling] = useState(false);
  const idling = useExcessiveIdling();
  const tIdling = useTranslations("tracking.live.idling");
  const liveGeofences = useLiveGeofences(showGeofences);
  const shownGeofences = showGeofences ? liveGeofences.geofences : [];

  // A notification (bell, toast or browser push) can ask Live to focus one vehicle.
  useEffect(() => {
    const id = takeLiveFocus() ?? pendingFocus;
    if (!id) return;
    pendingFocus = id; // survives React's dev-only double effect run
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      pendingFocus = null;
      setSelectedVehicleId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Query vehicles from real database
  const vehiclesQuery = useQuery({
    queryKey: ["live-tracking", "vehicles"],
    queryFn: async () => {
      // The backend's own live status per device: offline once a tracker has gone silent.
      const [vRes, lastRes] = await Promise.all([
        gqlRequest<VehiclesResult>(GET_VEHICLES, { first: 100 }),
        gqlRequest<LastStatusResult>(LAST_STATUS).catch(() => null),
      ]);
      const vList = vRes.vehicles?.data ?? [];
      const backendStatus = new globalThis.Map((lastRes?.deviceLastPositions.data ?? []).flatMap((p) => (p.vehicleId ? [[p.vehicleId, p.status] as const] : [])));
      const now = Date.now();

      const items: LiveVehicle[] = await Promise.all(
        vList.map(async (v) => {
          const kind = getCategory(v.plateNo, v.vehicleName);
          let lat: number | null = null;
          let lng: number | null = null;
          let speed = 0;
          let recordedAt: string | null = null;
          let status: LiveStatus = "offline";
          let heading: number | null = null;
          let readings: DeviceReadings | null = null;

          try {
            // A few more than needed: the tracker's minute-by-minute beacon records carry no readings.
            const posRes = await gqlRequest<LatestPositionsWithReadingsResult>(GET_LATEST_POSITIONS_WITH_READINGS, {
              vehicleId: v.id,
              first: 15,
            });
            readings = latestReadings(posRes.positionHistory?.data ?? []);
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
              status = liveStatus(backendStatus.get(v.id), speed, parseApiDateTime(valid.recordedAt)?.getTime() ?? null, now, valid.ignition ?? null);
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
            readings,
          };
        }),
      );

      return items;
    },
    refetchInterval: 30_000,
  });

  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId],
  );

  return (
    <div className="relative size-full overflow-hidden bg-surface-2 select-none">
      {/* The platform's map: OpenStreetMap or Google, chosen by a super admin on /map-settings. */}
      {!mapConfig.ready ? (
        <div className="size-full animate-pulse bg-surface-2" />
      ) : mapConfig.mapProvider === "osm" && mapConfig.maptilerApiKey ? (
        <LiveOsmMap
          maptilerKey={mapConfig.maptilerApiKey}
          vehicles={vehicles}
          selected={selectedVehicle}
          selectedId={selectedVehicleId}
          hoveredId={hoveredVehicleId}
          geofences={shownGeofences}
          geofenceFitKey={geofenceFitKey}
          clusterLabel={(count) => tMarker("cluster", { count })}
          panelPx={panelPx}
          onSelect={setSelectedVehicleId}
          onHover={(id) => setHoveredVehicleId((current) => (id === null && current !== null ? null : id))}
          renderMarker={(v) => (
            <VehicleArrow vehicle={v} selected={v.id === selectedVehicleId} hovered={v.id === hoveredVehicleId} />
          )}
        />
      ) : apiKey ? (
        <APIProvider apiKey={apiKey}>
          <Map
            className="size-full"
            mapId={mapConfig.googleMapsMapId || "DEMO_MAP_ID"}
            defaultCenter={DUBAI_CENTER}
            defaultZoom={11}
            gestureHandling="greedy"
            streetViewControl={false}
            mapTypeControl={false}
            fullscreenControl={false}
            zoomControl={true}
          >
            <MapController selected={selectedVehicle} vehicles={vehicles} panelPx={panelPx} />
            {showGeofences ? <GoogleGeofenceLayer geofences={shownGeofences} fitKey={geofenceFitKey} /> : null}
            <GoogleVehicles
              vehicles={vehicles}
              selectedId={selectedVehicleId}
              hoveredId={hoveredVehicleId}
              onSelect={setSelectedVehicleId}
              onHover={setHoveredVehicleId}
              clusterLabel={(count) => tMarker("cluster", { count })}
            />
          </Map>
        </APIProvider>
      ) : (
        <div className="grid size-full place-items-center">Google Maps API Key not configured</div>
      )}

      {/* Toolbar: Show Geofence, Search Vehicle, Search Driver, Excessive Idling. */}
      <GeofenceToolbar
        showing={showGeofences}
        loading={liveGeofences.loading}
        count={liveGeofences.geofences.length}
        onToggle={() => {
          if (!showGeofences) setGeofenceFitKey((k) => k + 1);
          setShowGeofences((v) => !v);
        }}
      >
        <ToolbarButton icon={<CarFront />} label={tFleet("buttons.vehicles")} pressed={fleetPanel === "vehicles"} onClick={() => setFleetPanel((p) => (p === "vehicles" ? null : "vehicles"))} />
        <ToolbarButton icon={<UserSearch />} label={tFleet("buttons.drivers")} pressed={fleetPanel === "drivers"} onClick={() => setFleetPanel((p) => (p === "drivers" ? null : "drivers"))} />
        <ToolbarButton
          icon={<Timer />}
          label={tIdling("button")}
          title={tIdling("count", { count: idling.data?.length ?? 0 })}
          pressed={showIdling}
          badge={idling.data?.length}
          onClick={() => setShowIdling((open) => !open)}
        />
      </GeofenceToolbar>
      {showIdling ? (
        <IdlingPanel
          vehicles={idling.data ?? []}
          loading={idling.isPending}
          selectedId={selectedVehicleId}
          onSelect={(id) => {
            setSelectedVehicleId(id); // the map follows it
            if (window.innerWidth < 640) setFleetPanel(null);
          }}
          onClose={() => setShowIdling(false)}
        />
      ) : null}

      {fleetPanel ? (
        <FleetPanel
          key={fleetPanel}
          mode={fleetPanel}
          vehicles={vehicles}
          loading={vehiclesQuery.isPending}
          fetching={vehiclesQuery.isFetching}
          selectedId={selectedVehicleId}
          onRefresh={() => void vehiclesQuery.refetch()}
          onSelect={(id) => {
            setSelectedVehicleId(id); // the map follows it
            if (window.innerWidth < 640) setFleetPanel(null); // phones: show the map again
          }}
          onClose={() => setFleetPanel(null)}
        />
      ) : null}
    </div>
  );
}
