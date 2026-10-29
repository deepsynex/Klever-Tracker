/**
 * Heatmap aggregation: cleans GPS fixes, weights them and snaps them to a zoom-dependent grid.
 *
 * Runs on the Next.js server (src/app/api/heatmap/route.ts), never in the browser. The Klever API
 * exposes only `positionHistory`, not SQL, so the grid is plain lat/lng flooring rather than
 * PostGIS ST_SnapToGrid. The dwell weight mirrors
 * `LEAD(recorded_at) OVER (PARTITION BY vehicle ORDER BY recorded_at) - recorded_at`.
 */

export const WEIGHT_MODES = ["density", "dwell", "idle"] as const;
export type WeightMode = (typeof WEIGHT_MODES)[number];

/** A fix as `positionHistory` returns it. Timestamps are UTC ("2026-10-12 14:00:00" or ISO). */
export type RawPosition = {
  recordedAt: string;
  locationLat: number | null;
  locationLng: number | null;
  speed?: number | null;
  ignition?: boolean | null;
};

export type Bbox = { south: number; west: number; north: number; east: number };
export type HeatmapCell = { lat: number; lng: number; weight: number };

export type HeatmapResult = {
  total_points: number;
  /** Fixes removed as (0,0), missing coordinates or impossible jumps. */
  dropped_points: number;
  cell_count: number;
  /** Same shape as google.maps.LatLngBoundsLiteral; null when nothing matched. */
  bounds: Bbox | null;
  cell_size_deg: number;
  /** True when more than `maxCells` cells matched and only the heaviest were kept. */
  truncated: boolean;
  cells: HeatmapCell[];
};

/** A device that goes quiet for longer than this is treated as offline, not parked. */
export const DWELL_CAP_SECONDS = 30 * 60;
export const IDLE_MAX_SPEED_KMH = 3;
/** Faster than any road vehicle; a jump that implies more is a bad fix. */
export const MAX_PLAUSIBLE_SPEED_KMH = 300;
export const MAX_CELLS = 5000;

type Fix = { t: number; lat: number; lng: number; speed: number | null; ignition: boolean | null };
type WeightedFix = { lat: number; lng: number; weight: number };

/** Klever timestamps are UTC but may come without a zone suffix. */
export function parseUtc(value: string): number {
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
}

/** Great-circle distance in kilometres. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function impliedSpeedKmh(a: Fix, b: Fix): number {
  const km = haversineKm(a.lat, a.lng, b.lat, b.lng);
  const hours = Math.abs(b.t - a.t) / 3_600_000;
  if (hours === 0) return km > 0.1 ? Infinity : 0;
  return km / hours;
}

function toFix(p: RawPosition): Fix | null {
  const { locationLat: lat, locationLng: lng } = p;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const t = parseUtc(p.recordedAt);
  if (!Number.isFinite(t)) return null;
  return { t, lat, lng, speed: p.speed ?? null, ignition: p.ignition ?? null };
}

/**
 * One vehicle's fixes, oldest first, without bad ones. A fix is a spike when reaching it from the
 * previous good fix *and* leaving it for the next fix both need an impossible speed.
 */
export function cleanTrack(track: RawPosition[]): { fixes: Fix[]; dropped: number } {
  const valid = track
    .map(toFix)
    .filter((f): f is Fix => f !== null)
    .sort((a, b) => a.t - b.t);

  const fixes: Fix[] = [];
  for (let i = 0; i < valid.length; i++) {
    const prev = fixes[fixes.length - 1];
    const next = valid[i + 1];
    const cur = valid[i];
    const spike =
      prev !== undefined &&
      impliedSpeedKmh(prev, cur) > MAX_PLAUSIBLE_SPEED_KMH &&
      (next === undefined || impliedSpeedKmh(cur, next) > MAX_PLAUSIBLE_SPEED_KMH);
    if (!spike) fixes.push(cur);
  }
  return { fixes, dropped: track.length - fixes.length };
}

/** Weight per fix. Dwell = seconds until the vehicle's next fix, capped; the last fix gets 0. */
export function weighFixes(fixes: Fix[], mode: WeightMode): WeightedFix[] {
  const out: WeightedFix[] = [];
  for (let i = 0; i < fixes.length; i++) {
    const f = fixes[i];
    if (mode === "density") {
      out.push({ lat: f.lat, lng: f.lng, weight: 1 });
      continue;
    }
    if (mode === "idle" && !(f.ignition === true && f.speed != null && f.speed < IDLE_MAX_SPEED_KMH)) continue;
    const next = fixes[i + 1];
    const seconds = next ? Math.min((next.t - f.t) / 1000, DWELL_CAP_SECONDS) : 0;
    out.push({ lat: f.lat, lng: f.lng, weight: seconds });
  }
  return out;
}

/** Map zoom → the zoom level the grid is built for. Zooms that map to the same level share a grid. */
export function gridZoomLevel(zoom: number): number {
  return Math.min(18, Math.max(3, Math.round(zoom)));
}

/** Grid cell edge in degrees: about 8 screen pixels at this zoom (a 256 px tile spans 360 / 2^z). */
export function cellSizeForZoom(zoom: number): number {
  return 360 / 2 ** gridZoomLevel(zoom) / 32;
}

function inBbox(lat: number, lng: number, b: Bbox): boolean {
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

export function aggregateHeatmap(
  tracks: RawPosition[][],
  options: { mode: WeightMode; zoom: number; bbox?: Bbox | null; maxCells?: number },
): HeatmapResult {
  const { mode, zoom, bbox, maxCells = MAX_CELLS } = options;
  const size = cellSizeForZoom(zoom);
  const grid = new Map<string, { sumLat: number; sumLng: number; n: number; weight: number }>();
  let bounds: Bbox | null = null;
  let totalPoints = 0;
  let dropped = 0;

  for (const track of tracks) {
    const cleaned = cleanTrack(track);
    dropped += cleaned.dropped;
    // Weigh before the bbox filter so a fix just inside the view still knows its next fix.
    for (const p of weighFixes(cleaned.fixes, mode)) {
      totalPoints++;
      if (p.weight <= 0) continue;
      bounds = bounds
        ? {
            south: Math.min(bounds.south, p.lat),
            west: Math.min(bounds.west, p.lng),
            north: Math.max(bounds.north, p.lat),
            east: Math.max(bounds.east, p.lng),
          }
        : { south: p.lat, west: p.lng, north: p.lat, east: p.lng };
      if (bbox && !inBbox(p.lat, p.lng, bbox)) continue;

      const key = `${Math.floor(p.lat / size)}:${Math.floor(p.lng / size)}`;
      const cell = grid.get(key);
      if (cell) {
        cell.sumLat += p.lat;
        cell.sumLng += p.lng;
        cell.n++;
        cell.weight += p.weight;
      } else {
        grid.set(key, { sumLat: p.lat, sumLng: p.lng, n: 1, weight: p.weight });
      }
    }
  }

  const all = [...grid.values()]
    .map((c) => ({
      lat: round(c.sumLat / c.n, 6),
      lng: round(c.sumLng / c.n, 6),
      weight: Math.round(c.weight),
    }))
    .sort((a, b) => b.weight - a.weight);
  const cells = all.slice(0, maxCells);

  return {
    total_points: totalPoints,
    dropped_points: dropped,
    cell_count: cells.length,
    bounds,
    cell_size_deg: size,
    truncated: all.length > cells.length,
    cells,
  };
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
