import type { AlertEventItem, EventTypeItem } from "@/lib/graphql/operations";
import { fixTime } from "./legs";

/**
 * Trip events for the History screen: the backend's alert events (ignition, overspeed, idling…)
 * plus, where the backend has none, ignition on/off events worked out from the track itself.
 *
 * The backend creates ignition events only only for data received after its ignition fix (4 Nov 2026), and only
 * while an "Ignition on/off" alert rule is active, so older windows (and companies without those
 * rules) would otherwise show none. Both sources use the same rule: a change counts once the new
 * state has held for IGNITION_HOLD_MS, so the few seconds of starter cranking don't count.
 */

export const IGNITION_HOLD_MS = 45_000;

export const IGNITION_ON = "ignition_on";
export const IGNITION_OFF = "ignition_off";

export type TripEvent = {
  id: string;
  /** Event type code: ignition_on, ignition_off, overspeed… */
  code: string;
  eventTypeId: string | null;
  /** UTC "YYYY-MM-DD HH:MM:SS", like every API time. */
  occurredAt: string;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  externalVoltageMv: number | null;
  /** "api": a stored alert event. "track": worked out from the fixes in this window. */
  source: "api" | "track";
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
};

type IgnitionFix = {
  recordedAt: string;
  locationLat?: number | null;
  locationLng?: number | null;
  speed?: number | null;
  ignition?: boolean | null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** The alert event's `parameters` JSON: {lat, lng, speed, odometer_m, external_voltage_mv}. */
export function parseEventParameters(parameters: string | null | undefined): {
  lat: number | null;
  lng: number | null;
  speed: number | null;
  externalVoltageMv: number | null;
} {
  let p: Record<string, unknown> = {};
  try {
    const parsed: unknown = parameters ? JSON.parse(parameters) : {};
    if (parsed && typeof parsed === "object") p = parsed as Record<string, unknown>;
  } catch {
    // Opaque string from the API: anything unparsable just has no location.
  }
  const lat = num(p.lat);
  const lng = num(p.lng);
  const usable = lat !== null && lng !== null && !(lat === 0 && lng === 0);
  return {
    lat: usable ? lat : null,
    lng: usable ? lng : null,
    speed: num(p.speed),
    externalVoltageMv: num(p.external_voltage_mv),
  };
}

export function fromAlertEvents(events: AlertEventItem[], types: EventTypeItem[]): TripEvent[] {
  const codeById = new Map(types.map((t) => [t.id, t.code]));
  return events.map((ev) => ({
    id: `api-${ev.id}`,
    code: codeById.get(ev.eventTypeId) ?? "event",
    eventTypeId: ev.eventTypeId,
    occurredAt: ev.occurredAt,
    ...parseEventParameters(ev.parameters),
    source: "api" as const,
    acknowledgedAt: ev.acknowledgedAt,
    resolvedAt: ev.resolvedAt,
  }));
}

/**
 * Ignition on/off events from fixes (oldest first). Only real readings count: a fix with no
 * ignition value (null) is skipped. A change is confirmed when every reading for IGNITION_HOLD_MS
 * after it has the new state and a reading at or beyond that point exists (or the window ends with
 * it still held). The event takes the time and place of the first fix in the new state. No event
 * for the state the window starts in.
 */
export function deriveIgnitionEvents(fixes: IgnitionFix[], types: EventTypeItem[] = []): TripEvent[] {
  const idByCode = new Map(types.map((t) => [t.code, t.id]));
  const readings = fixes.filter((f) => typeof f.ignition === "boolean" && Number.isFinite(fixTime(f)));
  const events: TripEvent[] = [];
  if (readings.length === 0) return events;

  let state = readings[0].ignition as boolean;
  let i = 1;
  while (i < readings.length) {
    const candidate = readings[i];
    if (candidate.ignition === state) {
      i++;
      continue;
    }
    const start = fixTime(candidate);
    let j = i + 1;
    let held = true;
    while (j < readings.length && fixTime(readings[j]) - start < IGNITION_HOLD_MS) {
      if (readings[j].ignition !== candidate.ignition) {
        held = false;
        break;
      }
      j++;
    }
    if (!held) {
      // A flicker: skip to the reading that broke it.
      i = j;
      continue;
    }
    state = candidate.ignition as boolean;
    const code = state ? IGNITION_ON : IGNITION_OFF;
    const usable = candidate.locationLat != null && candidate.locationLng != null && !(candidate.locationLat === 0 && candidate.locationLng === 0);
    events.push({
      id: `track-${code}-${candidate.recordedAt}`,
      code,
      eventTypeId: idByCode.get(code) ?? null,
      occurredAt: candidate.recordedAt,
      lat: usable ? candidate.locationLat! : null,
      lng: usable ? candidate.locationLng! : null,
      speed: candidate.speed ?? null,
      externalVoltageMv: null,
      source: "track",
    });
    i = j;
  }
  return events;
}

/**
 * The window's events, oldest first: every stored event, plus ignition events from the track when
 * the backend sent none for this window (so the two never double up).
 */
export function mergeTripEvents(api: TripEvent[], derived: TripEvent[]): TripEvent[] {
  const apiHasIgnition = api.some((e) => e.code === IGNITION_ON || e.code === IGNITION_OFF);
  const all = apiHasIgnition ? api : [...api, ...derived];
  const at = (e: TripEvent) => fixTime({ recordedAt: e.occurredAt });
  return [...all].sort((a, b) => at(a) - at(b));
}

/** Index of the fix closest in time to `at`, or -1 when there are none. */
export function nearestFixIndex(fixes: Array<{ recordedAt: string }>, at: string): number {
  const target = fixTime({ recordedAt: at });
  let best = -1;
  let bestGap = Infinity;
  fixes.forEach((f, i) => {
    const gap = Math.abs(fixTime(f) - target);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  });
  return best;
}
