import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { bearing, MAX_PLAUSIBLE_SPEED_KMH, metres } from "@/lib/history/road-path";
import { getDisplayTimeZone } from "@/lib/time-zone";
import { parseApiDateTime } from "@/lib/vehicle-management/helpers";

/**
 * Multi Tracking core (multi-tracking-plan.md §8). Pure: no React, no network, so Vitest
 * covers every rule — append rules, trail cap, grid shape, selection limits.
 */

/** Server-computed (API Doc §6.16). Never derived from speed/ignition on the client. */
export type LiveStatus = "moving" | "idle" | "stopped" | "offline";
export const LIVE_STATUSES: readonly LiveStatus[] = ["moving", "idle", "stopped", "offline"];

export type Fix = {
  /** GPS time, ms since epoch (UTC). */
  time: number;
  lat: number;
  lng: number;
  /** km/h */
  speed: number;
  /** Device heading in degrees, when the device reports one. */
  heading: number | null;
  ignition: boolean | null;
  /** Only on latest positions (the history rows carry no status). */
  status?: LiveStatus;
};

export type ViewMode = "grid" | "single";

export const POLL_MS = 15_000;
/** Grid view: one map per tile, so it stays at the plan's 4 × 3. */
export const MAX_GRID = 12;
/** Single-map view, and the API's cap for deviceLastPositionsForVehicles. */
export const MAX_SINGLE = 50;
/** Bounded memory for an 8-hour session (plan N2): oldest points drop beyond this. */
export const MAX_TRAIL_POINTS = 2000;
export const PARKED_JITTER_M = 15;
export const PRELOAD_OPTIONS = [0, 15, 30, 60] as const;
export type PreloadMinutes = (typeof PRELOAD_OPTIONS)[number];
/** A tile's "updated x ago" turns red after this. */
export const STALE_AFTER_MS = 5 * 60_000;

export function parseStatus(value: unknown): LiveStatus {
  return LIVE_STATUSES.includes(value as LiveStatus) ? (value as LiveStatus) : "offline";
}

export type RawFix = {
  recordedAt?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  speed?: number | null;
  heading?: number | null;
  ignition?: boolean | null;
  status?: string | null;
};

/** API row → Fix; null when it has no usable time or position (missing or ~0,0). */
export function toFix(raw: RawFix | null | undefined): Fix | null {
  if (!raw) return null;
  const date = parseApiDateTime(raw.recordedAt ?? null);
  const { locationLat: lat, locationLng: lng } = raw;
  if (!date || typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01)) return null;
  return {
    time: date.getTime(),
    lat,
    lng,
    speed: Math.max(0, raw.speed ?? 0),
    heading: typeof raw.heading === "number" && Number.isFinite(raw.heading) ? raw.heading : null,
    ignition: raw.ignition ?? null,
    ...(raw.status != null ? { status: parseStatus(raw.status) } : {}),
  };
}

/** Plan §8.6: newer only, no parked jitter, no GPS spikes. */
export function shouldAppend(last: Fix | null, p: Fix): boolean {
  if (!last) return true;
  if (p.time <= last.time) return false;
  const m = metres(last, p);
  if (p.speed === 0 && last.speed === 0 && m < PARKED_JITTER_M) return false;
  if ((m / ((p.time - last.time) / 1000)) * 3.6 > MAX_PLAUSIBLE_SPEED_KMH) return false;
  return true;
}

/** One vehicle's live state: its drawn trail and its latest known position. */
export type Track = { trail: Fix[]; latest: Fix | null };

export function emptyTrack(): Track {
  return { trail: [], latest: null };
}

/**
 * Applies incoming fixes (any order) to a track, in place. The trail only takes points that pass
 * `shouldAppend` and is capped at `cap`. `latest` moves to an accepted point (or parked drift);
 * for a rejected GPS spike it keeps its position and only refreshes time and status. A same-time
 * fix still refreshes status, so a parked vehicle can turn "offline" without a new fix.
 * Returns true when anything visible changed.
 */
export function applyFixes(track: Track, incoming: Fix[], cap = MAX_TRAIL_POINTS): boolean {
  let changed = false;
  for (const p of [...incoming].sort((a, b) => a.time - b.time)) {
    const prev = track.trail.at(-1) ?? null;
    const appended = shouldAppend(prev, p);
    if (appended) {
      track.trail.push(p);
      changed = true;
    }
    const l = track.latest;
    const status = p.status ?? l?.status;
    if (!l || (p.time > l.time && (appended || (prev !== null && metres(prev, p) < PARKED_JITTER_M)))) {
      track.latest = { ...p, status };
      changed = true;
    } else if (p.time > l.time || (p.time === l.time && status !== l.status)) {
      track.latest = { ...l, time: p.time, status };
      changed = true;
    }
  }
  if (track.trail.length > cap) track.trail.splice(0, track.trail.length - cap);
  return changed;
}

/**
 * Merges older history (trail preload) under a live track, in place: the trail is rebuilt from
 * both through the same rules, and `latest` keeps whichever is newer (with its server status).
 */
export function mergeHistory(track: Track, history: Fix[], cap = MAX_TRAIL_POINTS): void {
  const rebuilt = emptyTrack();
  applyFixes(rebuilt, [...history, ...track.trail], cap);
  track.trail = rebuilt.trail;
  if (!track.latest || (rebuilt.latest && rebuilt.latest.time > track.latest.time)) track.latest = rebuilt.latest;
}

/** Device heading when reported, else the bearing of the last movement, else north. */
export function headingOf(track: Track): number {
  if (track.latest?.heading != null) return track.latest.heading;
  const t = track.trail;
  const last = t.at(-1);
  if (last) {
    for (let i = t.length - 2; i >= 0; i--) if (metres(t[i], last) > 5) return bearing(t[i], last);
  }
  return 0;
}

/**
 * Grid view window size (percent of the map area) for `n` open windows: as large as the count
 * allows, shrinking to the TouchTraks ¼ × ⅓ only when 10–12 vehicles are tracked.
 */
export function windowSize(n: number): { width: number; height: number } {
  if (n <= 1) return { width: 60, height: 70 };
  if (n === 2) return { width: 50, height: 60 };
  if (n <= 4) return { width: 50, height: 50 };
  if (n <= 6) return { width: 100 / 3, height: 50 };
  if (n <= 9) return { width: 100 / 3, height: 100 / 3 };
  return { width: 25, height: 100 / 3 };
}

/** Plan §8.3: 1 → 1×1, 2 → 2×1, 3–4 → 2×2, 5–6 → 3×2, 7–9 → 3×3, 10–12 → 4×3. */
export function gridShape(n: number): { cols: number; rows: number } {
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  return { cols, rows: Math.max(1, Math.ceil(n / cols)) };
}

export type ToggleResult = { selected: string[]; blocked: null | "gridLimit" | "singleLimit" };

/** Ticks or unticks a vehicle, enforcing the view's limit (plan acceptance test #3). */
export function toggleVehicle(selected: string[], id: string, mode: ViewMode): ToggleResult {
  if (selected.includes(id)) return { selected: selected.filter((x) => x !== id), blocked: null };
  if (mode === "grid" && selected.length >= MAX_GRID) return { selected, blocked: "gridLimit" };
  if (selected.length >= MAX_SINGLE) return { selected, blocked: "singleLimit" };
  return { selected: [...selected, id], blocked: null };
}

/** Distinct trail colours for the single-map view (by tile order), readable on light and dark maps. */
export const TRAIL_COLORS = [
  "#0b6e69",
  "#2563eb",
  "#d97706",
  "#9333ea",
  "#db2777",
  "#0891b2",
  "#65a30d",
  "#dc2626",
  "#4f46e5",
  "#ca8a04",
  "#0d9488",
  "#c026d3",
] as const;

export function trailColor(index: number): string {
  return TRAIL_COLORS[index % TRAIL_COLORS.length];
}

/** "02-11-2026 09:47:56 AM" in the display time zone (personal choice, else the company's). */
export function formatFixTime(time: number, pattern = "dd-MM-yyyy hh:mm:ss a"): string {
  return format(new TZDate(time, getDisplayTimeZone()), pattern);
}

/** Age split for "updated x ago" (the UI words it through messages). */
export function ageParts(ms: number): { unit: "s" | "m" | "h" | "d"; n: number } {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return { unit: "s", n: s };
  if (s < 3600) return { unit: "m", n: Math.floor(s / 60) };
  if (s < 86_400) return { unit: "h", n: Math.floor(s / 3600) };
  return { unit: "d", n: Math.floor(s / 86_400) };
}

/** Saved selection shape (localStorage, per user): sanitised on read. */
export type SavedState = { ids: string[]; view: ViewMode; preload: PreloadMinutes };

export function parseSaved(raw: string | null): SavedState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SavedState>;
    const view: ViewMode = v.view === "single" ? "single" : "grid";
    const ids = Array.isArray(v.ids) ? [...new Set(v.ids.filter((x) => typeof x === "string" && /^\d+$/.test(x)))] : [];
    const preload = PRELOAD_OPTIONS.includes(v.preload as PreloadMinutes) ? (v.preload as PreloadMinutes) : 15;
    return { ids: ids.slice(0, view === "grid" ? MAX_GRID : MAX_SINGLE), view, preload };
  } catch {
    return null;
  }
}
