/**
 * Live map movement: when a vehicle's new fix arrives, its marker glides there in a straight line
 * over about the real time between the two fixes, pointing the way it moves, like the public share
 * page and the history playback. Pure, so it's unit tested; the React side is use-gliding-vehicles.
 */
import { bearing, metres, type LatLng } from "@/lib/history/road-path";
import { MAX_GLIDE_METRES } from "@/lib/vehicle-management/helpers";

export type Glide = {
  from: LatLng;
  to: LatLng;
  /** performance.now() when it started. */
  start: number;
  /** 0 = jump straight to `to`. */
  duration: number;
  /** Which way the marker points during and after the glide. */
  heading: number | null;
};

/**
 * The glide from where the marker is drawn now (`shown`, mid-glide too) to the new fix.
 * No animation when there's nothing drawn yet, the move is tiny, or it's a jump (GPS glitch, gap).
 */
export function startGlide(
  shown: LatLng | null,
  to: LatLng,
  fixHeading: number | null,
  previousHeading: number | null,
  durationMs: number,
  now: number,
  reducedMotion = false,
): Glide {
  if (!shown) return { from: to, to, start: now, duration: 0, heading: fixHeading };
  const distance = metres(shown, to);
  // Point along the movement; when (nearly) still, keep the device's own heading.
  const heading = distance > 3 ? bearing(shown, to) : (fixHeading ?? previousHeading);
  const jump = distance < 0.5 || distance > MAX_GLIDE_METRES || reducedMotion;
  return { from: shown, to, start: now, duration: jump ? 0 : durationMs, heading };
}

/** Where the marker is at `now`, and whether the glide has finished. */
export function glidePosition(g: Glide, now: number): LatLng & { done: boolean } {
  if (g.duration <= 0) return { ...g.to, done: true };
  const k = Math.min(1, Math.max(0, (now - g.start) / g.duration));
  return { lat: g.from.lat + (g.to.lat - g.from.lat) * k, lng: g.from.lng + (g.to.lng - g.from.lng) * k, done: k >= 1 };
}
