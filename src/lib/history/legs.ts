import { parseApiDateTime } from "@/lib/vehicle-management/helpers";
import { STAY_MIN_MS } from "./clean-track";

/**
 * Trip legs and times for the history screen. Pure, so Vitest can test it.
 *
 * Input is the cleaned track (clean-track.ts): oldest first, with each stop reduced to an arrival
 * and a departure fix at speed 0. The gap between those two is the stop, so a leg ends at an
 * arrival and the next one starts at the departure.
 */

export type LegPoint = {
  recordedAt: string;
  locationLat?: number | null;
  locationLng?: number | null;
  speed?: number | null;
};

export type RouteLeg = {
  id: string;
  legNumber: number;
  startIndex: number;
  endIndex: number;
  startTime: string;
  endTime: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  distanceKm: number;
  /** Driving time from the leg's first to last fix. */
  durationMs: number;
  maxSpeed: number;
  avgSpeed: number;
  pointsCount: number;
};

export type TripTimes = {
  /** First to last fix, stops included. */
  spanMs: number;
  /** Sum of the legs. */
  drivingMs: number;
  /** Everything else: stops between legs (and silent gaps there). */
  stoppedMs: number;
};

/**
 * A fix's time in ms. API times are UTC like "2026-11-03 11:33:00"; `new Date()` reads that as
 * local time in Chrome and rejects it in Safari, so always parse through parseApiDateTime.
 */
export function fixTime(p: Pick<LegPoint, "recordedAt">): number {
  return parseApiDateTime(p.recordedAt)?.getTime() ?? NaN;
}

type Coords = Pick<LegPoint, "locationLat" | "locationLng">;

const usable = (p: Coords) => p.locationLat != null && p.locationLng != null && p.locationLat !== 0 && p.locationLng !== 0;

/** Route length along the fixes, in kilometres (haversine). */
export function calculateDistance(points: Coords[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!usable(a) || !usable(b)) continue;
    const rad = Math.PI / 180;
    const dLat = (b.locationLat! - a.locationLat!) * rad;
    const dLng = (b.locationLng! - a.locationLng!) * rad;
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(a.locationLat! * rad) * Math.cos(b.locationLat! * rad) * Math.sin(dLng / 2) ** 2;
    km += 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  return km;
}

/**
 * Where a leg ends: a gap of at least STAY_MIN_MS (the same 3 minutes clean-track uses to call a
 * place a stop) with the vehicle standing at either end.
 */
function isStop(prev: LegPoint, curr: LegPoint): boolean {
  return fixTime(curr) - fixTime(prev) >= STAY_MIN_MS && (prev.speed === 0 || curr.speed === 0);
}

function makeLeg(points: LegPoint[], start: number, end: number, number: number): RouteLeg {
  const legPoints = points.slice(start, end + 1);
  let max = 0;
  let sum = 0;
  let moving = 0;
  for (const p of legPoints) {
    const speed = p.speed ?? 0;
    if (speed > max) max = speed;
    if (speed > 0) {
      sum += speed;
      moving++;
    }
  }
  const first = points[start];
  const last = points[end];
  return {
    id: `leg-${number}`,
    legNumber: number,
    startIndex: start,
    endIndex: end,
    startTime: first.recordedAt,
    endTime: last.recordedAt,
    startLat: first.locationLat!,
    startLng: first.locationLng!,
    endLat: last.locationLat!,
    endLng: last.locationLng!,
    distanceKm: Number(calculateDistance(legPoints).toFixed(1)),
    durationMs: Math.max(0, fixTime(last) - fixTime(first)) || 0,
    maxSpeed: Math.round(max),
    avgSpeed: moving > 0 ? Math.round(sum / moving) : 0,
    pointsCount: legPoints.length,
  };
}

/** Splits the track into driving legs at its stops. A leg needs at least two fixes. */
export function computeRouteLegs(points: LegPoint[]): RouteLeg[] {
  if (points.length < 2) return [];
  const legs: RouteLeg[] = [];
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    if (isStop(points[i - 1], points[i])) {
      // A stop always ends the current leg. Before it there may be a single fix only (a window
      // that starts parked: the stop's arrival fix): that's no leg, but the next one still has to
      // start after the stop, or the whole parked time is counted as driving.
      if (i - start >= 2) legs.push(makeLeg(points, start, i - 1, legs.length + 1));
      start = i;
    }
  }
  if (points.length - start >= 2) legs.push(makeLeg(points, start, points.length - 1, legs.length + 1));
  // A "leg" under a minute and under 200 m sits between two stops at the same place (GPS drift
  // between back-to-back parked stretches): not a drive. Renumber what's left.
  return legs
    .filter((l) => l.durationMs >= MIN_LEG_MS || l.distanceKm >= MIN_LEG_KM)
    .map((l, k) => ({ ...l, id: `leg-${k + 1}`, legNumber: k + 1 }));
}

/** Shorter and less far than both of these, a leg is drift between two stops. */
export const MIN_LEG_MS = 60_000;
export const MIN_LEG_KM = 0.2;

/** Driving, stopped and total time over `points`, given the legs found in them. */
export function tripTimes(points: LegPoint[], legs: RouteLeg[]): TripTimes {
  if (points.length < 2) return { spanMs: 0, drivingMs: 0, stoppedMs: 0 };
  const spanMs = Math.max(0, fixTime(points[points.length - 1]) - fixTime(points[0])) || 0;
  const drivingMs = Math.min(
    spanMs,
    legs.reduce((sum, leg) => sum + leg.durationMs, 0),
  );
  return { spanMs, drivingMs, stoppedMs: spanMs - drivingMs };
}

/**
 * One duration format everywhere, rounded to the nearest minute: "2h 05m", "45m". Under a minute
 * shows seconds ("40s") so a short leg doesn't read as "0m".
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const totalMins = Math.round(ms / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return hours > 0 ? `${hours}h ${String(mins).padStart(2, "0")}m` : `${mins}m`;
}
