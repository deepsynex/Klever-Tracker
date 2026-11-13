/**
 * Excessive idling (pure): is a vehicle standing still with its engine on, and since when?
 * Same rules as the backend's planned IdleDetector, so the live map can show idling now, worked
 * out from the vehicle's recent GPS points:
 *
 *  - An idle point has ignition ON and speed ≤ 5 km/h (GPS drift while stopped stays idle).
 *  - An episode starts at the device time of its first idle point.
 *  - It ends when ignition goes OFF, or the vehicle moves continuously for ≥ 30 s, or ≥ 50 m from
 *    where it started idling. Short speed blips don't reset the timer.
 *  - Points that arrive late (older than one already seen) are ignored for the state.
 *  - A vehicle with no point in the last 5 minutes is stale: never listed.
 * Times are device times (UTC epoch ms).
 */
import { haversineM } from "@/lib/geofences/geometry";

export type IdleFix = { at: number; ignition: boolean | null; speed: number; lat: number; lng: number };

export type IdleOptions = {
  idleSpeedKmh: number;
  moveSeconds: number;
  moveMetres: number;
  staleMs: number;
  thresholdMinutes: number;
};

export const IDLE_DEFAULTS: IdleOptions = { idleSpeedKmh: 5, moveSeconds: 30, moveMetres: 50, staleMs: 5 * 60_000, thresholdMinutes: 10 };

export type IdleEpisode = {
  /** Device time of the first idle point. */
  since: number;
  lat: number;
  lng: number;
  /** True when the idle started before the oldest point we looked at: it's been idle at least this long. */
  atLeast: boolean;
};

/**
 * The vehicle's current idle episode (any length), or null. `fixes` are in the order they were
 * received; one older than the newest already seen is treated as a late, buffered point.
 */
export function currentIdle(fixes: IdleFix[], opts: Partial<IdleOptions> = {}): IdleEpisode | null {
  const o = { ...IDLE_DEFAULTS, ...opts };
  let start: IdleFix | null = null;
  let movingSince: number | null = null;
  let lastAt = -Infinity;
  let first: IdleFix | null = null;
  for (const f of fixes) {
    if (f.at < lastAt) continue; // late, buffered point: kept in history, not used for the live state
    lastAt = f.at;
    first ??= f;
    if (f.ignition === false) {
      start = null;
      movingSince = null;
      continue;
    }
    if (f.ignition !== true) continue; // no ignition reading: can't tell
    if (f.speed <= o.idleSpeedKmh) {
      if (!start) start = f;
      movingSince = null; // back to idle: a blip doesn't reset the timer
      continue;
    }
    if (!start) continue;
    movingSince ??= f.at;
    if (f.at - movingSince >= o.moveSeconds * 1000 || haversineM(start, f) >= o.moveMetres) {
      start = null;
      movingSince = null;
    }
  }
  if (!start) return null;
  return { since: start.at, lat: start.lat, lng: start.lng, atLeast: start === first };
}

/** The excessive-idle episode to list, or null when not idling, under the threshold, or stale. */
export function excessiveIdle(fixes: IdleFix[], now: number, opts: Partial<IdleOptions> = {}): (IdleEpisode & { seconds: number }) | null {
  const o = { ...IDLE_DEFAULTS, ...opts };
  const newest = fixes.reduce((max, f) => Math.max(max, f.at), -Infinity);
  if (!Number.isFinite(newest) || now - newest > o.staleMs) return null;
  const episode = currentIdle(fixes, o);
  if (!episode) return null;
  const seconds = Math.floor((now - episode.since) / 1000);
  return seconds >= o.thresholdMinutes * 60 ? { ...episode, seconds } : null;
}

/** "00 days,00:44:22", the reference panel's format. */
export function formatIdle(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 86_400))} days,${pad(Math.floor((s % 86_400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
