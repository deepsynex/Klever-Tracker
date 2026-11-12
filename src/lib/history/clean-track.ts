import { parseApiDateTime } from "@/lib/vehicle-management/helpers";
import { metres } from "./road-path";

/**
 * Removes parked-GPS drift from a track (stay-point detection).
 *
 * A parked tracker keeps reporting, and each fix lands somewhere inside a cloud around the real
 * spot (VERIFY-1 on 02-11-2026: 659 fixes over 9 h parked, half within 23 m, worst 218 m away,
 * even reporting 4–19 km/h). Joined in order they draw kilometres of zig-zag at a place the
 * vehicle never moved from. Ignition can't be trusted to find these stops either: the same
 * tracker sends a one-off "ignition off" heartbeat every minute while driving.
 *
 * So stops are found from movement over time: a run of fixes that stays within STAY_RADIUS_M of
 * its own centre for at least STAY_MIN_MS is one stop. Brief excursions out of the cloud that come
 * straight back are drift spikes and are dropped. Each stop becomes two fixes at its median spot —
 * arrival and departure, speed 0 — so playback still waits there for the real duration and the
 * leg detection still splits trips at it. Fixes while driving are kept unchanged.
 *
 * Longer drift excursions (VERIFY-1 jumped 195 m north for 5 minutes at 05:29 with speed 0 and
 * ignition off) form a separate short "stop" next to the real one. Two stops that follow each other
 * directly are one stop when they're at the same place (centres within STAY_RADIUS_M) or when only
 * still fixes lie between them (speed under STILL_KMH and ignition not on).
 */

export const STAY_RADIUS_M = 100;
export const STAY_MIN_MS = 3 * 60_000;
/** A fix outside the radius is a drift spike if one of the next this-many fixes is back inside. */
export const SPIKE_LOOKAHEAD = 2;
/** Below this the tracker's reported speed is noise (parked trackers report up to ~20 km/h at times). */
export const STILL_KMH = 5;

export type TrackFix = {
  recordedAt: string;
  locationLat: number | null;
  locationLng: number | null;
  speed: number | null;
  ignition?: boolean | null;
};

export type Stop = {
  lat: number;
  lng: number;
  start: string;
  end: string;
  /** Raw fixes merged into this stop. */
  fixes: number;
  /** How many of those fixes reported the ignition on (the heatmap's idle mode uses the share). */
  ignitionOn: number;
  /** Index of the stop's arrival fix in `points` (its departure fix is the next one). */
  at: number;
};

export type CleanedTrack<T> = {
  points: T[];
  stops: Stop[];
  /** Raw fixes merged into stops or dropped as spikes. */
  removed: number;
};

const ll = (p: TrackFix) => ({ lat: p.locationLat as number, lng: p.locationLng as number });

function timeOf(p: TrackFix): number {
  return parseApiDateTime(p.recordedAt)?.getTime() ?? NaN;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** `points` must be sorted oldest first and have valid coordinates. */
/**
 * Each fix's ignition, with gaps filled: a fix with no reading (null, like the tracker's
 * minute-by-minute beacon records) takes the last known state, or the next one at the start of
 * the window. Null only when the window has no reading at all. Without this, beacon records
 * with GPS-drift speed in the middle of a parked night counted as driving.
 */
export function effectiveIgnition(points: Array<Pick<TrackFix, "ignition">>): Array<boolean | null> {
  const out: Array<boolean | null> = new Array(points.length).fill(null);
  let last: boolean | null = null;
  for (let k = 0; k < points.length; k++) {
    const v = points[k].ignition;
    if (typeof v === "boolean") last = v;
    out[k] = last;
  }
  const firstKnown = out.findIndex((v) => v !== null);
  for (let k = 0; k < firstKnown; k++) out[k] = out[firstKnown];
  return out;
}

export function cleanTrack<T extends TrackFix>(points: T[]): CleanedTrack<T> {
  const out: T[] = [];
  const stops: Stop[] = [];
  /** Per stop: indices of its member fixes, and where its arrival fix sits in `out`. */
  const stopMembers: number[][] = [];
  const stopOutIndex: number[] = [];
  let i = 0;

  const ignitionOn = (members: number[]) => members.filter((k) => points[k].ignition === true).length;
  const ign = effectiveIgnition(points);
  const still = (k: number) => (points[k].speed ?? 0) < STILL_KMH && ign[k] !== true;
  /**
   * Clearly driving: real speed with the ignition on (or unknown). Parked drift often reports
   * speed with the ignition off, so that alone doesn't count.
   */
  const driving = (k: number) => (points[k].speed ?? 0) >= STILL_KMH && ign[k] !== false;

  while (i < points.length) {
    // Grow a candidate stop from fix i around a running centre.
    const members = [i];
    let cLat = points[i].locationLat as number;
    let cLng = points[i].locationLng as number;
    let j = i + 1;
    while (j < points.length) {
      const inside = (k: number) => metres({ lat: cLat, lng: cLng }, ll(points[k])) <= STAY_RADIUS_M;
      if (inside(j)) {
        members.push(j);
        cLat += ((points[j].locationLat as number) - cLat) / members.length;
        cLng += ((points[j].locationLng as number) - cLng) / members.length;
        j++;
        continue;
      }
      // Outside: a spike if the track comes straight back into the cloud, otherwise it left.
      let back = false;
      for (let k = j + 1; k <= j + SPIKE_LOOKAHEAD && k < points.length; k++) {
        if (inside(k)) {
          back = true;
          break;
        }
      }
      if (!back) break;
      j++;
    }

    // Edges where the vehicle is already driving (pulling out of / into the spot) belong to the trip.
    while (members.length && driving(members[members.length - 1])) members.pop();
    let lead = 0;
    while (lead < members.length && driving(members[lead])) lead++;
    const leading = members.splice(0, lead);

    const first = points[members[0] ?? i];
    const last = points[members[members.length - 1] ?? i];
    const duration = timeOf(last) - timeOf(first);

    if (members.length >= 2 && duration >= STAY_MIN_MS) {
      for (const k of leading) out.push(points[k]);
      const prev = stops.length - 1;
      const prevMembers = stopMembers[prev];
      // Directly after the previous stop (nothing kept in between), and either at the same place
      // or reached through still fixes only (a long drift excursion): the same stop.
      const adjacent = prev >= 0 && stopOutIndex[prev] + 2 === out.length;
      let merge = false;
      if (adjacent) {
        const here = {
          lat: median(members.map((k) => points[k].locationLat as number)),
          lng: median(members.map((k) => points[k].locationLng as number)),
        };
        merge = metres(here, stops[prev]) <= STAY_RADIUS_M;
        if (!merge) {
          merge = true;
          for (let k = prevMembers[prevMembers.length - 1] + 1; k <= members[0]; k++) {
            if (!still(k)) {
              merge = false;
              break;
            }
          }
        }
      }
      if (merge) {
        const all = [...prevMembers, ...members];
        const lat = median(all.map((k) => points[k].locationLat as number));
        const lng = median(all.map((k) => points[k].locationLng as number));
        const at = stopOutIndex[prev];
        out[at] = { ...out[at], locationLat: lat, locationLng: lng };
        out[at + 1] = { ...last, locationLat: lat, locationLng: lng, speed: 0 };
        stops[prev] = { lat, lng, start: stops[prev].start, end: last.recordedAt, fixes: all.length, ignitionOn: ignitionOn(all), at };
        stopMembers[prev] = all;
      } else {
        const lat = median(members.map((k) => points[k].locationLat as number));
        const lng = median(members.map((k) => points[k].locationLng as number));
        stopOutIndex.push(out.length);
        out.push({ ...first, locationLat: lat, locationLng: lng, speed: 0 });
        out.push({ ...last, locationLat: lat, locationLng: lng, speed: 0 });
        stops.push({
          lat,
          lng,
          start: first.recordedAt,
          end: last.recordedAt,
          fixes: members.length,
          ignitionOn: ignitionOn(members),
          at: out.length - 2,
        });
        stopMembers.push(members);
      }
      // Continue after the stop's last still fix: spikes inside it are dropped, and trailing
      // driving fixes (pulling out) are drawn as part of the trip.
      i = members[members.length - 1] + 1;
    } else {
      out.push(points[i]);
      i++;
    }
  }

  return { points: out, stops, removed: points.length - out.length };
}
