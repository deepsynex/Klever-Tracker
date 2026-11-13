/**
 * A vehicle's live status for the map and lists: moving, idle (engine on, standing still),
 * stopped (engine off) or offline. The backend works it out per device
 * (deviceLastPositions.status: moving / idle / stopped / offline, offline after the company's
 * offline-minutes setting), so a tracker that has gone silent shows offline however its last
 * point looked. Without a backend status, a fix older than 30 minutes (the backend's default)
 * counts as offline.
 */

export type LiveStatus = "moving" | "idle" | "stopped" | "offline";

const OFFLINE_AFTER_MS = 30 * 60_000;

export function liveStatus(
  backend: string | null | undefined,
  speedKmh: number,
  recordedAtMs: number | null,
  now: number,
  ignition: boolean | null = null,
): LiveStatus {
  if (recordedAtMs === null) return "offline";
  if (backend === "offline") return "offline";
  if (backend === "moving") return "moving";
  if (backend === "idle") return "idle";
  if (backend === "stopped") return "stopped";
  if (now - recordedAtMs > OFFLINE_AFTER_MS) return "offline";
  if (speedKmh > 3) return "moving";
  return ignition === true ? "idle" : "stopped";
}
