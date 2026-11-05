"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { setWorkerUrl } from "maplibre-gl";
import { DUBAI_CENTER } from "@/lib/heatmap/client";
import { maptilerStyleUrl } from "@/lib/map-settings";

/**
 * Shared setup for every OpenStreetMap (MapLibre + MapTiler) map. Import this module only from
 * components loaded with next/dynamic({ ssr: false }), so MapLibre is downloaded only when the
 * platform uses OpenStreetMap.
 *
 * MapLibre loads its worker from next to its own script, which the bundler moves; serve it from
 * public/ instead (copied there by scripts/copy-maplibre-worker.mjs before dev and build).
 */
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export { maptilerStyleUrl };

/** Default view: Dubai, like the Google maps. MapLibre takes [lng, lat]. */
export const DEFAULT_VIEW = { latitude: DUBAI_CENTER.lat, longitude: DUBAI_CENTER.lng, zoom: 10 };

/** [[west, south], [east, north]] around points, or null when there are none. */
export function boundsOf(points: Array<{ lat: number; lng: number }>): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/**
 * Room around fitted points: extra on the start side when a floating panel of `panelPx` covers
 * the map there (wider screens only), mirrored for Arabic.
 */
export function fitPadding(panelPx = 0): { top: number; bottom: number; left: number; right: number } {
  const panel = typeof window !== "undefined" && window.innerWidth >= 640 ? panelPx : 0;
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  return { top: 64, bottom: 64, left: rtl ? 64 : 64 + panel, right: rtl ? 64 + panel : 64 };
}
