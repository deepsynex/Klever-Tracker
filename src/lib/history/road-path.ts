/**
 * Road-snapped route for the history map, from Google's Routes API (computeRoutes).
 * Kept free of React and the Maps JS loader so Vitest can test the request and parsing.
 *
 * How a track becomes a drivable road line:
 * 1. Split it wherever the GPS jumps impossibly far (glitch) or there's a long gap in the data,
 *    because the road between those fixes is unknown (`splitIntoSegments`).
 * 2. In each segment, pick "stops" about STOP_SPACING_M apart, each with the direction the vehicle
 *    was travelling (`planStops`), and route through them in batches. Each stop ends a route leg,
 *    so where every stop lies on the road is known exactly, not guessed.
 * 3. Place the fixes between two stops on the road between those stops only (`alignToLegs`).
 * 4. Cut the short "drive past and turn back" spikes Google adds to reach some stops, unless the
 *    GPS shows the vehicle really turned around there (`trimSpikes`).
 */

export type LatLng = { lat: number; lng: number };
/** A GPS fix; `time` (ms since epoch) lets impossible jumps be detected. */
export type Fix = LatLng & { time?: number };

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

/** Routes API allows up to 25 intermediate waypoints; keep a margin. */
export const MAX_VIA_POINTS = 23;
/** Stops per Routes request: origin + MAX_VIA_POINTS + destination. */
const STOPS_PER_REQUEST = MAX_VIA_POINTS + 2;
/** Parallel Routes requests per track (low, to stay under Google's per-minute limit). */
const CONCURRENCY = 2;
/**
 * Most Routes requests one track may use (each is billed). Long tracks space their stops further
 * apart to stay within it; the fixes in between are still placed on the road.
 */
export const MAX_REQUESTS_PER_TRACK = 10;
/**
 * Minimum distance between routed stops. Closer stops make Google loop around blocks to reach
 * fixes that sit on the wrong side of the road; the fixes in between are still placed on the road.
 */
const STOP_SPACING_M = 100;
/**
 * Faster than this between two fixes is a GPS glitch, not driving (system-design §5.2): the track
 * is split there, no road is drawn across the gap and the marker jumps instead of driving.
 */
export const MAX_PLAUSIBLE_SPEED_KMH = 200;
/**
 * Two consecutive fixes further apart than this are a gap in the data (tracker off, no signal):
 * the road actually driven is unknown, so the track is split there too instead of guessing.
 */
export const MAX_GAP_KM = 5;

/**
 * Raised when Google won't route for this key for the rest of the session: the API isn't enabled
 * or allowed for the key (HTTP 403), or the project's daily request quota is used up (HTTP 429).
 */
export class RoadPathDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoadPathDeniedError";
  }
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_AT_EQUATOR = 111_320;

/** Straight-line distance in metres (equirectangular; accurate at street scale). */
export function metres(a: LatLng, b: LatLng): number {
  const x = (b.lng - a.lng) * M_PER_DEG_LNG_AT_EQUATOR * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const y = (b.lat - a.lat) * M_PER_DEG_LAT;
  return Math.hypot(x, y);
}

/** Closest point to `p` on segment a→b, with its fraction along the segment and distance from `p`. */
function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): { t: number; distance: number } {
  const kx = M_PER_DEG_LNG_AT_EQUATOR * Math.cos(a.lat * (Math.PI / 180));
  const bx = (b.lng - a.lng) * kx;
  const by = (b.lat - a.lat) * M_PER_DEG_LAT;
  const px = (p.lng - a.lng) * kx;
  const py = (p.lat - a.lat) * M_PER_DEG_LAT;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return { t, distance: Math.hypot(px - bx * t, py - by * t) };
}

function cumulativeDistances(path: LatLng[]): number[] {
  const cumulative = [0];
  for (let i = 1; i < path.length; i++) cumulative.push(cumulative[i - 1] + metres(path[i - 1], path[i]));
  return cumulative;
}

/** Point `distance` metres along `path` (clamped to its ends). */
function pointAlong(path: LatLng[], cumulative: number[], distance: number): LatLng {
  if (path.length === 0) return { lat: 0, lng: 0 };
  if (path.length === 1 || distance <= 0) return path[0];
  if (distance >= cumulative[cumulative.length - 1]) return path[path.length - 1];
  let lo = 0;
  let hi = cumulative.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= distance) lo = mid;
    else hi = mid;
  }
  const span = cumulative[hi] - cumulative[lo];
  const t = span === 0 ? 0 : (distance - cumulative[lo]) / span;
  return { lat: path[lo].lat + (path[hi].lat - path[lo].lat) * t, lng: path[lo].lng + (path[hi].lng - path[lo].lng) * t };
}

/** Compass bearing in degrees from a to b (0 = north), for pointing the playback arrow. */
export function bearing(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * toRad) * Math.cos(b.lat * toRad);
  const x =
    Math.cos(a.lat * toRad) * Math.sin(b.lat * toRad) -
    Math.sin(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.cos((b.lng - a.lng) * toRad);
  return (Math.atan2(y, x) / toRad + 360) % 360;
}

/** Smallest angle between two bearings, 0–180 degrees. */
function turnAngle(a: number, b: number): number {
  return Math.abs(((b - a + 540) % 360) - 180);
}

/**
 * Forward-only placement of `points` on `path` between metres `from` and `to`: each point goes to
 * its nearest spot in that window, never behind the previous one (GPS jitter while parked).
 */
function placeBetween(points: LatLng[], path: LatLng[], cumulative: number[], from: number, to: number): number[] {
  const out: number[] = [];
  let along = from;
  for (const p of points) {
    let best = { along, distance: Infinity };
    for (let s = 0; s < path.length - 1; s++) {
      if (cumulative[s + 1] < along || cumulative[s] > to) continue;
      const hit = projectOnSegment(p, path[s], path[s + 1]);
      const d = cumulative[s] + hit.t * (cumulative[s + 1] - cumulative[s]);
      if (hit.distance < best.distance && d >= along && d <= to) best = { along: d, distance: hit.distance };
    }
    along = best.along;
    out.push(along);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Splitting and planning
// ---------------------------------------------------------------------------------------------

/**
 * Splits the track wherever two consecutive fixes are further apart than a vehicle could drive in
 * the time between them, or more than MAX_GAP_KM apart. Returns the fix indices of each segment.
 */
export function splitIntoSegments(fixes: Fix[]): number[][] {
  if (fixes.length === 0) return [];
  const segments: number[][] = [[0]];
  for (let i = 1; i < fixes.length; i++) {
    const a = fixes[i - 1];
    const b = fixes[i];
    const hours = a.time != null && b.time != null ? Math.abs(b.time - a.time) / 3_600_000 : null;
    const km = metres(a, b) / 1000;
    // Allow 1 km regardless of time, so timestamp rounding on close fixes never splits the track.
    const impossible = hours !== null && km > 1 && km / Math.max(hours, 1 / 3600) > MAX_PLAUSIBLE_SPEED_KMH;
    if (impossible || km > MAX_GAP_KM) segments.push([i]);
    else segments[segments.length - 1].push(i);
  }
  return segments;
}

/**
 * Indices (into `points`) of the stops to route through: the first fix, then one every `spacingM`
 * of movement, and the last.
 */
export function planStops(points: LatLng[], spacingM = STOP_SPACING_M): number[] {
  if (points.length === 0) return [];
  const stops = [0];
  for (let i = 1; i < points.length; i++) {
    if (metres(points[stops[stops.length - 1]], points[i]) >= spacingM) stops.push(i);
  }
  const last = points.length - 1;
  if (stops[stops.length - 1] !== last && metres(points[stops[stops.length - 1]], points[last]) >= 10) stops.push(last);
  return stops;
}

/** Direction of travel at each stop: towards the next stop, or from the previous one at the end. */
function stopHeadings(stops: LatLng[]): number[] {
  return stops.map((p, k) =>
    k < stops.length - 1 ? bearing(p, stops[k + 1]) : k > 0 ? bearing(stops[k - 1], p) : 0,
  );
}

// ---------------------------------------------------------------------------------------------
// Routes API
// ---------------------------------------------------------------------------------------------

const toWaypoint = (p: LatLng, heading?: number) => ({
  location: {
    latLng: { latitude: p.lat, longitude: p.lng },
    ...(heading != null ? { heading: Math.round(heading) % 360 } : {}),
  },
});

/**
 * Request body routing through every given stop in order (at most STOPS_PER_REQUEST), each with
 * the vehicle's heading so Google approaches it from the right side of the road.
 */
export function buildRoutesRequest(stops: LatLng[], headings?: number[]) {
  return {
    origin: toWaypoint(stops[0], headings?.[0]),
    destination: toWaypoint(stops[stops.length - 1], headings?.[stops.length - 1]),
    intermediates: stops.slice(1, -1).map((p, k) => toWaypoint(p, headings?.[k + 1])),
    travelMode: "DRIVE",
    polylineQuality: "HIGH_QUALITY",
    polylineEncoding: "GEO_JSON_LINESTRING",
  };
}

type RoutesResponse = {
  routes?: Array<{ legs?: Array<{ polyline?: { geoJsonLinestring?: { coordinates?: number[][] } } }> }>;
};

const toLatLngs = (coords?: number[][]) =>
  (coords ?? []).filter((c) => c.length >= 2).map(([lng, lat]) => ({ lat, lng }));

/** One road line per leg (stop k → stop k+1); null when Google found no route. GeoJSON is [lng, lat]. */
export function parseRouteLegs(json: RoutesResponse, stopCount: number): LatLng[][] | null {
  const legs = json.routes?.[0]?.legs;
  if (!legs || legs.length !== stopCount - 1) return null;
  return legs.map((leg) => toLatLngs(leg.polyline?.geoJsonLinestring?.coordinates));
}

/** Retries for rate limiting (429) and temporary server errors, with growing waits. */
const RETRY_DELAYS_MS = [1_000, 2_500, 5_000];

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });
}

/** True when a 429 body says a per-day quota is used up (retrying today won't help). */
function isDailyQuota(body: string): boolean {
  return /PerDay|per day/i.test(body);
}

/** Successful routes by request body, so the same request is never paid for twice in a session. */
const routeCache = new Map<string, LatLng[][]>();

/**
 * Route legs through the given stops (one Routes request). Throws RoadPathDeniedError when Google
 * won't route for this key today (403, or the daily quota is used up); retries short-term rate
 * limiting; null when no route could be found.
 */
export async function fetchRouteLegs(
  stops: LatLng[],
  headings: number[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<LatLng[][] | null> {
  if (stops.length < 2) return null;
  const body = JSON.stringify(buildRoutesRequest(stops, headings));
  const cached = routeCache.get(body);
  if (cached) return cached;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.legs.polyline.geoJsonLinestring",
      },
      body,
      signal,
    });
    if (res.status === 403) throw new RoadPathDeniedError(`Routes API refused the request (HTTP 403).`);
    if (res.status === 429 && isDailyQuota(await res.clone().text())) {
      throw new RoadPathDeniedError(`Routes API daily quota is used up (HTTP 429).`);
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < RETRY_DELAYS_MS.length) {
      await wait(RETRY_DELAYS_MS[attempt], signal);
      continue;
    }
    if (!res.ok) return null;
    const legs = parseRouteLegs((await res.json()) as RoutesResponse, stops.length);
    if (legs) routeCache.set(body, legs);
    return legs;
  }
}

/** Runs `task` over `items` with at most `limit` in flight, keeping order. */
async function mapLimited<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------------------------
// Aligning fixes to the road
// ---------------------------------------------------------------------------------------------

/** A segment's road line and each of its fixes' distance along it (metres from the start). */
export type SegmentRoad = { path: LatLng[]; along: number[] };

/** Fixes where the vehicle really turned around: its direction flips over ~40 m either side. */
export function gpsTurnarounds(points: LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    let a = i - 1;
    while (a > 0 && metres(points[a], points[i]) < 40) a--;
    let b = i + 1;
    while (b < points.length - 1 && metres(points[b], points[i]) < 40) b++;
    if (metres(points[a], points[i]) < 40 || metres(points[b], points[i]) < 40) continue;
    if (turnAngle(bearing(points[a], points[i]), bearing(points[i], points[b])) > 150) out.push(points[i]);
  }
  return out;
}

/**
 * Cuts "drive past and turn back" spikes: places where the road line reverses on itself, so the
 * stretch before and after run back over each other. Google adds them to reach a stop on the
 * wrong side of the road. Spikes within 60 m of a real GPS turnaround (`turnarounds`) are kept.
 * Returns the new line and a function moving old along-distances onto it.
 */
export function trimSpikes(
  path: LatLng[],
  turnarounds: LatLng[],
): { path: LatLng[]; remap: (distance: number) => number } {
  const cumulative = cumulativeDistances(path);
  const total = cumulative[cumulative.length - 1];
  const at = (d: number) => pointAlong(path, cumulative, d);

  const cuts: Array<[number, number]> = [];
  for (let c = 10; c < total - 10; c += 5) {
    const centre = at(c);
    if (turnAngle(bearing(at(c - 10), centre), bearing(centre, at(c + 10))) <= 150) continue;
    if (turnarounds.some((t) => metres(t, centre) < 60)) continue;
    let depth = 0;
    for (let d = 5; d <= 300 && c - d >= 0 && c + d <= total; d += 5) {
      if (metres(at(c - d), at(c + d)) < 15) depth = d;
      else break;
    }
    if (depth >= 10) {
      cuts.push([c - depth, c + depth]);
      c += depth;
    }
  }
  if (cuts.length === 0) return { path, remap: (d) => d };

  // Merge overlapping cuts, then rebuild the line without them.
  cuts.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const c of cuts) {
    const last = merged[merged.length - 1];
    if (last && c[0] <= last[1]) last[1] = Math.max(last[1], c[1]);
    else merged.push([...c]);
  }

  const out: LatLng[] = [];
  let ci = 0;
  path.forEach((p, i) => {
    while (ci < merged.length && cumulative[i] >= merged[ci][1]) {
      out.push(at(merged[ci][0]), at(merged[ci][1]));
      ci++;
    }
    if (ci < merged.length && cumulative[i] > merged[ci][0]) return; // inside a cut
    out.push(p);
  });
  while (ci < merged.length) out.push(at(merged[ci][0]), at(merged[ci++][1]));

  // Each cut removes its length minus the short bridge between its ends.
  const removed = merged.map(([s, e]) => e - s - metres(at(s), at(e)));
  const remap = (d: number) => {
    let shift = 0;
    for (let k = 0; k < merged.length; k++) {
      const [s, e] = merged[k];
      if (d <= s) break;
      if (d < e) return s - shift; // inside a cut: snap to its start
      shift += removed[k];
    }
    return d - shift;
  };
  return { path: out, remap };
}

/**
 * Joins the legs between consecutive stops into one road line and places every fix on it: each
 * stop at the end of its leg (exact), the fixes in between on the road between their two stops.
 */
export function alignToLegs(points: LatLng[], stops: number[], legs: LatLng[][]): SegmentRoad {
  const path: LatLng[] = [];
  const stopAlong = [0];
  for (const leg of legs) {
    const part = leg.length >= 2 ? leg : [];
    for (const p of path.length ? part.slice(1) : part) path.push(p);
    stopAlong.push(path.length ? cumulativeDistances(path)[path.length - 1] : 0);
  }
  if (path.length < 2) return { path: [points[0]], along: points.map(() => 0) };
  const cumulative = cumulativeDistances(path);

  const along = new Array<number>(points.length).fill(0);
  stops.forEach((fixIndex, k) => (along[fixIndex] = stopAlong[k]));
  for (let k = 0; k < stops.length - 1; k++) {
    const between = points.slice(stops[k] + 1, stops[k + 1]);
    placeBetween(between, path, cumulative, stopAlong[k], stopAlong[k + 1]).forEach(
      (d, j) => (along[stops[k] + 1 + j] = d),
    );
  }
  // Fixes after the last stop (parked within a few metres of it) stay there.
  for (let i = stops[stops.length - 1] + 1; i < points.length; i++) along[i] = stopAlong[stopAlong.length - 1];

  const { path: trimmed, remap } = trimSpikes(path, gpsTurnarounds(points));
  return { path: trimmed, along: along.map(remap) };
}

/**
 * Road lines for a whole track, one per segment (see splitIntoSegments). Segments Google can't
 * route are null, so the GPS fixes are used for them. Throws RoadPathDeniedError if Google refuses
 * the key.
 */
export async function fetchRoadPaths(fixes: Fix[], apiKey: string, signal?: AbortSignal): Promise<(SegmentRoad | null)[]> {
  const segments = splitIntoSegments(fixes).map((indices) => indices.map((i) => fixes[i]));

  type Job = { segment: number; first: number; stops: LatLng[]; headings: number[] };
  // Widen the stop spacing until the whole track fits in MAX_REQUESTS_PER_TRACK requests.
  const requestsFor = (stopsPerSegment: number[][]) =>
    stopsPerSegment.reduce((n, stops) => n + Math.ceil(Math.max(stops.length - 1, 0) / (STOPS_PER_REQUEST - 1)), 0);
  let spacing = STOP_SPACING_M;
  let plans = segments.map((points) => planStops(points, spacing));
  while (requestsFor(plans) > MAX_REQUESTS_PER_TRACK) {
    spacing *= 1.5;
    plans = segments.map((points) => planStops(points, spacing));
  }
  const jobs: Job[] = [];
  plans.forEach((stops, segment) => {
    const stopPoints = stops.map((i) => segments[segment][i]);
    const headings = stopHeadings(stopPoints);
    for (let first = 0; first < stops.length - 1; first += STOPS_PER_REQUEST - 1) {
      jobs.push({
        segment,
        first,
        stops: stopPoints.slice(first, first + STOPS_PER_REQUEST),
        headings: headings.slice(first, first + STOPS_PER_REQUEST),
      });
    }
  });

  const results = await mapLimited(jobs, CONCURRENCY, (job) => fetchRouteLegs(job.stops, job.headings, apiKey, signal));

  return segments.map((points, segment) => {
    const stops = plans[segment];
    if (stops.length < 2) return null;
    const legs: LatLng[][] = [];
    jobs.forEach((job, k) => {
      if (job.segment !== segment) return;
      // A batch Google couldn't route: straight lines between its stops.
      const routed = results[k] ?? job.stops.slice(1).map((p, j) => [job.stops[j], p]);
      legs.push(...routed.map((leg, j) => (leg.length >= 2 ? leg : [job.stops[j], job.stops[j + 1]])));
    });
    return alignToLegs(points, stops, legs);
  });
}

// ---------------------------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------------------------

/**
 * What the playback marker moves along: the road lines (or, without them, the GPS fixes) of every
 * segment joined into one line, with each fix's distance along it and its segment number. Between
 * two segments the marker must jump, never drive (`segmentOf` tells them apart).
 */
export type PlaybackTrack = { path: LatLng[]; cumulative: number[]; along: number[]; segmentOf: number[] };

/** `roads[s]` is a SegmentRoad, a bare road line to place the fixes on, or null for the GPS fixes. */
export function buildPlaybackTrack(fixes: Fix[], roads?: Array<SegmentRoad | LatLng[] | null> | null): PlaybackTrack {
  const segments = splitIntoSegments(fixes);
  const useRoads = !!roads && roads.length === segments.length;

  const path: LatLng[] = [];
  const cumulative: number[] = [];
  const along = new Array<number>(fixes.length).fill(0);
  const segmentOf = new Array<number>(fixes.length).fill(0);

  segments.forEach((indices, s) => {
    const points = indices.map((i) => fixes[i]);
    const road = useRoads ? roads![s] : null;
    let line: LatLng[] = points;
    let distances: number[] | null = null;
    if (Array.isArray(road) && road.length >= 2) {
      line = road;
      const local = cumulativeDistances(road);
      distances = placeBetween(points, road, local, 0, local[local.length - 1]);
    } else if (road && !Array.isArray(road) && road.path.length >= 2) {
      line = road.path;
      distances = road.along;
    }
    const local = cumulativeDistances(line);
    distances ??= local;

    const offset = path.length === 0 ? 0 : cumulative[cumulative.length - 1] + metres(path[path.length - 1], line[0]);
    line.forEach((p, k) => {
      path.push(p);
      cumulative.push(offset + local[k]);
    });
    indices.forEach((fixIndex, k) => {
      along[fixIndex] = offset + distances![k];
      segmentOf[fixIndex] = s;
    });
  });

  return { path, cumulative, along, segmentOf };
}

/** The point `distance` metres along the track (clamped to its ends). */
export function positionAt(track: PlaybackTrack, distance: number): LatLng {
  return pointAlong(track.path, track.cumulative, distance);
}

/** Road positions for each GPS fix along a single road line (used by tests and one-off lookups). */
export function snapPointsToPath(points: LatLng[], path: LatLng[]): LatLng[] {
  if (path.length < 2) return points;
  const track = buildPlaybackTrack(points, [path]);
  return track.along.map((d) => positionAt(track, d));
}
