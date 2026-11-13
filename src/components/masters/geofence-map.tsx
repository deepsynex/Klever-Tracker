"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { boundsOf, circleRing, roundPoint, type LatLng, type Position } from "@/lib/geofences/geometry";
import { useMapConfig } from "@/lib/map-settings";

/**
 * The geofence editor's map. Follows the platform's map setting: Google Maps (editable Circle /
 * Polygon with Google's own drag handles) or OpenStreetMap (geofence-osm-map.tsx). Circle: click
 * the map to set the centre, drag the centre or the radius handle. Polygon: click to add points,
 * drag points to move them. Other geofences of the company show faintly for context.
 */

export type GeofenceDraft = {
  type: "circle" | "polygon";
  centre: LatLng | null;
  radiusM: number;
  /** Polygon points, open (the API closes the ring). */
  points: LatLng[];
};

/** Another geofence, drawn faintly: a closed [lng, lat] ring. */
export type ContextShape = { id: string; name: string; ring: Position[] };

export type GeofenceMapProps = {
  draft: GeofenceDraft;
  onChange: (draft: GeofenceDraft) => void;
  others: ContextShape[];
  disabled?: boolean;
  label: string;
  /** Shown instead of the map when no map can be loaded (no key, or the API failed). */
  unavailable: string;
};

export const MAP_HEIGHT = "h-80";
/** Dubai, where the map opens when there's nothing to show. */
const DEFAULT_CENTER = { lat: 25.2048, lng: 55.2708 };
const PRIMARY = "#0B6E69";

// MapLibre is only downloaded when the platform uses OpenStreetMap.
const GeofenceOsmMap = dynamic(() => import("./geofence-osm-map").then((m) => m.GeofenceOsmMap), {
  ssr: false,
  loading: () => <div className={`${MAP_HEIGHT} w-full animate-pulse rounded-ctl bg-surface-2`} />,
}) as typeof import("./geofence-osm-map").GeofenceOsmMap; // dynamic() drops the extra prop

/** Every point of the draft and the other shapes, for fitting the view. */
export function viewPoints(draft: GeofenceDraft, others: ContextShape[]): LatLng[] {
  const own =
    draft.type === "circle" ? (draft.centre ? [draft.centre] : []) : draft.points;
  if (own.length > 0) return own;
  return others.flatMap((o) => o.ring.map(([lng, lat]) => ({ lat, lng })));
}

export function GeofenceMap(props: GeofenceMapProps) {
  const mapConfig = useMapConfig();
  if (!mapConfig.ready) return <div className={`${MAP_HEIGHT} w-full animate-pulse rounded-ctl bg-surface-2`} />;
  if (mapConfig.mapProvider === "osm" && mapConfig.maptilerApiKey) {
    return <GeofenceOsmMap {...props} maptilerKey={mapConfig.maptilerApiKey} />;
  }
  return <GoogleGeofenceMap {...props} apiKey={mapConfig.googleMapsApiKey} />;
}

/* ───────────────────────── Google Maps ───────────────────────── */

type GLatLng = { lat: () => number; lng: () => number };
type GPath = { getArray: () => GLatLng[]; getLength: () => number };
type GListener = { remove: () => void };
type GMap = {
  addListener: (e: string, h: (ev: { latLng?: GLatLng }) => void) => GListener;
  fitBounds: (b: unknown, padding?: number) => void;
  setCenter: (p: LatLng) => void;
  setZoom: (z: number) => void;
};
type GCircle = {
  setOptions: (o: Record<string, unknown>) => void;
  getCenter: () => GLatLng | null;
  getRadius: () => number;
  setMap: (m: GMap | null) => void;
  addListener: (e: string, h: (ev: { latLng?: GLatLng }) => void) => GListener;
};
type GPolygon = {
  setOptions: (o: Record<string, unknown>) => void;
  getPath: () => GPath;
  setPath: (p: LatLng[]) => void;
  setMap: (m: GMap | null) => void;
  addListener: (e: string, h: (ev: { latLng?: GLatLng }) => void) => GListener;
};
type GApi = {
  Map: new (el: HTMLElement, o: Record<string, unknown>) => GMap;
  Circle: new (o: Record<string, unknown>) => GCircle;
  Polygon: new (o: Record<string, unknown>) => GPolygon;
  LatLngBounds: new (sw: LatLng, ne: LatLng) => unknown;
  event: { addListener: (target: unknown, e: string, h: () => void) => GListener };
};

const toPoint = (p: GLatLng): LatLng => roundPoint({ lat: p.lat(), lng: p.lng() });
const samePoints = (a: LatLng[], b: LatLng[]) =>
  a.length === b.length && a.every((p, i) => Math.abs(p.lat - b[i].lat) < 1e-7 && Math.abs(p.lng - b[i].lng) < 1e-7);

function GoogleGeofenceMap({ draft, onChange, others, disabled, label, unavailable, apiKey }: GeofenceMapProps & { apiKey: string | null }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const api = useRef<{ maps: GApi; map: GMap; circle: GCircle; polygon: GPolygon; others: GPolygon[] } | null>(null);
  // Latest values for the map's own listeners, which are attached once.
  const latest = useRef({ draft, onChange, disabled });
  // True while the map itself is changing the shape, so its change events aren't echoed back.
  const syncing = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    latest.current = { draft, onChange, disabled };
  });

  // Create the map, the editable circle and polygon once.
  useEffect(() => {
    if (!apiKey || !boxRef.current) return;
    let cancelled = false;
    const listeners: GListener[] = [];
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !boxRef.current) return;
        const maps = (window.google as unknown as { maps: GApi }).maps;
        const map = new maps.Map(boxRef.current, {
          center: DEFAULT_CENTER,
          zoom: 11,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          draggableCursor: "crosshair",
        });
        const style = { strokeColor: PRIMARY, strokeWeight: 2, fillColor: PRIMARY, fillOpacity: 0.18 };
        const circle = new maps.Circle({ ...style, map: null });
        const polygon = new maps.Polygon({ ...style, map: null });

        const emit = (next: Partial<GeofenceDraft>) => latest.current.onChange({ ...latest.current.draft, ...next });
        const clickAt = (ev: { latLng?: GLatLng }) => {
          const { draft: d, disabled: off } = latest.current;
          if (off || !ev.latLng) return;
          const p = toPoint(ev.latLng);
          if (d.type === "circle") emit({ centre: p });
          else emit({ points: [...d.points, p] });
        };
        listeners.push(map.addListener("click", clickAt), circle.addListener("click", clickAt), polygon.addListener("click", clickAt));
        listeners.push(
          circle.addListener("center_changed", () => {
            const c = circle.getCenter();
            if (!syncing.current && c) emit({ centre: toPoint(c) });
          }),
          circle.addListener("radius_changed", () => {
            if (!syncing.current) emit({ radiusM: Math.round(circle.getRadius()) });
          }),
        );
        // Vertex edits: moving (set_at), Google's midpoint handles (insert_at), and undo (remove_at).
        const pathChanged = () => {
          if (!syncing.current) emit({ points: polygon.getPath().getArray().map(toPoint) });
        };
        const watchPath = () => {
          const path = polygon.getPath();
          for (const e of ["set_at", "insert_at", "remove_at"]) listeners.push(maps.event.addListener(path, e, pathChanged));
        };
        watchPath();
        api.current = { maps, map, circle, polygon, others: [] };
        // setPath swaps the path object, so its listeners are re-attached after every external change.
        (api.current as unknown as { watchPath: () => void }).watchPath = watchPath;
        setReady(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      listeners.forEach((l) => l.remove());
    };
  }, [apiKey]);

  // Draw the draft.
  useEffect(() => {
    const g = api.current;
    if (!ready || !g) return;
    syncing.current = true;
    const editable = !disabled;
    if (draft.type === "circle" && draft.centre) {
      g.polygon.setMap(null);
      const c = g.circle.getCenter();
      const moved = !c || Math.abs(c.lat() - draft.centre.lat) > 1e-7 || Math.abs(c.lng() - draft.centre.lng) > 1e-7;
      g.circle.setOptions({ map: g.map, editable, draggable: editable, ...(moved ? { center: draft.centre } : {}), radius: draft.radiusM });
    } else if (draft.type === "polygon" && draft.points.length > 0) {
      g.circle.setMap(null);
      const current = g.polygon.getPath().getArray().map(toPoint);
      if (!samePoints(current, draft.points)) {
        g.polygon.setPath(draft.points);
        (g as unknown as { watchPath: () => void }).watchPath();
      }
      g.polygon.setOptions({ map: g.map, editable, draggable: false });
    } else {
      g.circle.setMap(null);
      g.polygon.setMap(null);
    }
    syncing.current = false;
  }, [ready, draft, disabled]);

  // The company's other geofences, faintly.
  useEffect(() => {
    const g = api.current;
    if (!ready || !g) return;
    g.others.forEach((p) => p.setMap(null));
    g.others = others.map(
      (o) =>
        new g.maps.Polygon({
          map: g.map,
          paths: o.ring.map(([lng, lat]) => ({ lat, lng })),
          strokeColor: "#64748b",
          strokeOpacity: 0.6,
          strokeWeight: 1,
          fillColor: "#64748b",
          fillOpacity: 0.08,
          clickable: false,
        }),
    );
  }, [ready, others]);

  // Fit the view once: to the shape being edited, else to the other geofences.
  const fitted = useRef(false);
  useEffect(() => {
    const g = api.current;
    if (!ready || !g || fitted.current) return;
    fitted.current = true;
    const d = latest.current.draft;
    const pts =
      d.type === "circle" && d.centre ? circleRing(d.centre, d.radiusM, 16).map(([lng, lat]) => ({ lat, lng })) : viewPoints(d, others);
    const b = boundsOf(pts);
    if (!b) return;
    if (pts.length === 1) {
      g.map.setCenter(pts[0]);
      g.map.setZoom(15);
    } else g.map.fitBounds(new g.maps.LatLngBounds({ lat: b[0][1], lng: b[0][0] }, { lat: b[1][1], lng: b[1][0] }), 48);
  }, [ready, others]);

  if (!apiKey || failed) {
    return (
      <div className={`${MAP_HEIGHT} grid w-full place-items-center rounded-ctl border border-dashed border-border bg-surface-2 p-4 text-center text-sm text-muted-foreground`}>
        {unavailable}
      </div>
    );
  }
  return <div ref={boxRef} className={`${MAP_HEIGHT} w-full overflow-hidden rounded-ctl border border-border bg-surface-2`} role="application" aria-label={label} />;
}
