import type { LiveStatus } from "./status";

/**
 * Groups vehicles that would overlap on the live map at the current zoom into one numbered bubble
 * (like the reference fleet map). Pure, so both map providers share it and Vitest can test it.
 * Distances are measured in screen pixels on the Web Mercator map both providers use.
 */

export type ClusterPoint = { id: string; lat: number; lng: number; status: LiveStatus };

export type Cluster<P extends ClusterPoint> =
  | { kind: "single"; point: P }
  | { kind: "cluster"; id: string; lat: number; lng: number; points: P[]; counts: Record<P["status"], number> };

/** Pixels between two vehicles below which they merge. */
export const CLUSTER_RADIUS_PX = 56;
/** From this zoom on, vehicles are never merged (street level: every vehicle on its own). */
export const NO_CLUSTER_ZOOM = 15;

/** World pixel position of a point at `zoom` (256 px tiles). */
export function toPixels(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const sin = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
}

/**
 * Greedy clustering: each vehicle joins the first group whose centre is within `radius` pixels,
 * else starts a new one. `keepApart` ids (the followed vehicle) are never merged.
 */
export function clusterPoints<P extends ClusterPoint>(points: P[], zoom: number, keepApart: string | null = null, radius = CLUSTER_RADIUS_PX): Cluster<P>[] {
  if (zoom >= NO_CLUSTER_ZOOM) return points.map((point) => ({ kind: "single", point }));
  const groups: Array<{ x: number; y: number; points: P[] }> = [];
  const singles: P[] = [];
  for (const p of points) {
    if (p.id === keepApart) {
      singles.push(p);
      continue;
    }
    const at = toPixels(p.lat, p.lng, zoom);
    const group = groups.find((g) => Math.hypot(g.x - at.x, g.y - at.y) <= radius);
    if (group) {
      group.points.push(p);
      // Keep the centre at the average, so the bubble sits in the middle of its vehicles.
      group.x += (at.x - group.x) / group.points.length;
      group.y += (at.y - group.y) / group.points.length;
    } else {
      groups.push({ ...at, points: [p] });
    }
  }
  const out: Cluster<P>[] = singles.map((point) => ({ kind: "single", point }));
  for (const g of groups) {
    if (g.points.length === 1) {
      out.push({ kind: "single", point: g.points[0] });
      continue;
    }
    const counts = { moving: 0, idle: 0, stopped: 0, offline: 0 } as Record<P["status"], number>;
    for (const p of g.points) counts[p.status as P["status"]] += 1;
    out.push({
      kind: "cluster",
      id: g.points.map((p) => p.id).sort().join("+"),
      lat: g.points.reduce((s, p) => s + p.lat, 0) / g.points.length,
      lng: g.points.reduce((s, p) => s + p.lng, 0) / g.points.length,
      points: g.points,
      counts,
    });
  }
  return out;
}
