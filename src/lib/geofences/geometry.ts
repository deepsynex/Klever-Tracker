/**
 * Geofence geometry for the editor and the list: circles as polygons, polygon checks, bounds and
 * areas. Pure (no maps library), so Vitest can test it and both map providers can share it.
 * Points are { lat, lng }; GeoJSON positions are [lng, lat].
 */

export type LatLng = { lat: number; lng: number };
export type Position = [number, number];

const EARTH_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The point `distanceM` from `from` along compass `bearingDeg` (0 = north, 90 = east). */
export function destination(from: LatLng, distanceM: number, bearingDeg: number): LatLng {
  const d = distanceM / EARTH_M;
  const b = rad(bearingDeg);
  const lat1 = rad(from.lat);
  const lng1 = rad(from.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lng: ((deg(lng2) + 540) % 360) - 180 };
}

/** A circle as a closed GeoJSON ring of `steps` points (+ the closing one). */
export function circleRing(centre: LatLng, radiusM: number, steps = 64): Position[] {
  const ring: Position[] = [];
  for (let i = 0; i < steps; i++) {
    const p = destination(centre, radiusM, (360 * i) / steps);
    ring.push([p.lng, p.lat]);
  }
  ring.push(ring[0]);
  return ring;
}

const same = (a: LatLng, b: LatLng) => Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9;

/** Polygon points without a repeated closing point (the API auto-closes rings). */
export function openRing(points: LatLng[]): LatLng[] {
  return points.length > 1 && same(points[0], points[points.length - 1]) ? points.slice(0, -1) : points;
}

/** Points as a closed GeoJSON ring. */
export function closeRing(points: LatLng[]): Position[] {
  const open = openRing(points);
  if (open.length === 0) return [];
  return [...open.map((p): Position => [p.lng, p.lat]), [open[0].lng, open[0].lat]];
}

/** Area in square metres (equirectangular projection around the polygon's centre; fine for geofence sizes). */
export function polygonAreaM2(points: LatLng[]): number {
  const open = openRing(points);
  if (open.length < 3) return 0;
  const lat0 = rad(open.reduce((s, p) => s + p.lat, 0) / open.length);
  const xy = open.map((p) => ({ x: rad(p.lng) * EARTH_M * Math.cos(lat0), y: rad(p.lat) * EARTH_M }));
  let twice = 0;
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/** A polygon the API can store: 3+ distinct points enclosing some area (not all on one line). */
export function isValidPolygon(points: LatLng[]): boolean {
  const open = openRing(points);
  const distinct = open.filter((p, i) => open.findIndex((q) => same(p, q)) === i);
  return distinct.length >= 3 && polygonAreaM2(distinct) > 1;
}

/** [[west, south], [east, north]], or null for no points. */
export function boundsOf(points: LatLng[]): [Position, Position] | null {
  if (points.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [
    [w, s],
    [e, n],
  ];
}

export function pointInCircle(p: LatLng, centre: LatLng, radiusM: number): boolean {
  return haversineM(p, centre) <= radiusM;
}

/** Ray casting on lng/lat (fine away from the poles and the antimeridian). */
export function pointInPolygon(p: LatLng, points: LatLng[]): boolean {
  const ring = openRing(points);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}

/** The outer ring of the API's `areaGeoJson` (a GeoJSON Polygon or MultiPolygon) as open points. */
export function parseAreaGeoJson(json: string | null | undefined): LatLng[] {
  if (!json) return [];
  try {
    const g = JSON.parse(json) as { type?: string; coordinates?: unknown };
    const ring =
      g.type === "Polygon"
        ? (g.coordinates as Position[][] | undefined)?.[0]
        : g.type === "MultiPolygon"
          ? (g.coordinates as Position[][][] | undefined)?.[0]?.[0]
          : undefined;
    if (!Array.isArray(ring)) return [];
    return openRing(
      ring.filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])).map(([lng, lat]) => ({ lat, lng })),
    );
  } catch {
    return [];
  }
}

/** Where a circle's radius handle sits: due east of the centre. */
export function radiusHandle(centre: LatLng, radiusM: number): LatLng {
  return destination(centre, radiusM, 90);
}

/** Rounds coordinates to ~1 cm, so saved values stay readable. */
export function roundPoint(p: LatLng): LatLng {
  return { lat: Math.round(p.lat * 1e7) / 1e7, lng: Math.round(p.lng * 1e7) / 1e7 };
}
