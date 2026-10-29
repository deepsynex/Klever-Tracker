/**
 * Deterministic demo telemetry for the mock API (the heatmap's "seeder"). Three vehicles drive
 * daily routes across Dubai and Sharjah with parking stops, traffic crawls, idling, a device
 * that goes offline for three hours, overnight silence, and a few bad fixes to filter out.
 * Same inputs always give the same fixes, so tests and screenshots are stable.
 */

export type DemoFix = {
  deviceId: string;
  recordedAt: string;
  locationLat: number;
  locationLng: number;
  speed: number;
  heading: number;
  ignition: boolean;
};

type Place = readonly [lat: number, lng: number];

const P = {
  alQuozDepot: [25.1365, 55.229],
  downtown: [25.1972, 55.2744],
  marina: [25.0805, 55.1403],
  jlt: [25.0746, 55.1459],
  mallOfEmirates: [25.1181, 55.2006],
  dip: [24.984, 55.165],
  jebelAli: [25.0118, 55.061],
  deira: [25.2711, 55.3075],
  airport: [25.2486, 55.3547],
  shjIndustrial: [25.311, 55.418],
  shjNahda: [25.3005, 55.372],
  shjMajaz: [25.326, 55.385],
} satisfies Record<string, Place>;

/** `idle` = engine on, standing (drop-off, queue); `park` = engine off. */
type Stop = { at: Place; minutes: number; kind: "park" | "idle" };
type Plan = {
  deviceId: string;
  /** First day with data (UTC date): the tracker's install date. Earlier periods are empty. */
  since: string;
  home: Place;
  stops: Stop[];
  /** Leg index (0-based) with a heavy traffic crawl in the middle. */
  trafficLegs: number[];
  /** Device offline window, minutes after the day's first fix. */
  offline?: { afterMinutes: number; minutes: number };
  badFixes?: boolean;
};

const PLANS: Record<string, Plan> = {
  "1": {
    deviceId: "1",
    since: "2026-09-01",
    home: P.alQuozDepot,
    stops: [
      { at: P.downtown, minutes: 12, kind: "idle" },
      { at: P.marina, minutes: 25, kind: "park" },
      { at: P.jlt, minutes: 15, kind: "park" },
      { at: P.alQuozDepot, minutes: 60, kind: "park" },
      { at: P.mallOfEmirates, minutes: 20, kind: "park" },
    ],
    trafficLegs: [0],
  },
  "2": {
    deviceId: "2",
    since: "2026-09-01",
    home: P.dip,
    stops: [
      { at: P.jebelAli, minutes: 40, kind: "park" },
      { at: P.alQuozDepot, minutes: 30, kind: "park" },
      { at: P.downtown, minutes: 20, kind: "park" },
      { at: P.deira, minutes: 45, kind: "park" },
      { at: P.airport, minutes: 15, kind: "idle" },
      { at: P.alQuozDepot, minutes: 60, kind: "park" },
      { at: P.marina, minutes: 15, kind: "idle" },
    ],
    trafficLegs: [2, 4],
    offline: { afterMinutes: 90, minutes: 180 },
  },
  "3": {
    deviceId: "3",
    since: "2026-09-15",
    home: P.shjIndustrial,
    stops: [
      { at: P.shjNahda, minutes: 20, kind: "park" },
      { at: P.deira, minutes: 12, kind: "idle" },
      { at: P.airport, minutes: 30, kind: "park" },
      { at: P.shjMajaz, minutes: 25, kind: "park" },
    ],
    trafficLegs: [1, 3],
    badFixes: true,
  },
};

/** Tracker devices in the mock that are fitted to a vehicle. */
const DEVICE_TO_VEHICLE: Record<string, string> = { "1": "1", "2": "2" };

const DUBAI_OFFSET_MS = 4 * 3_600_000; // UTC+4, no daylight saving
const DAY_MS = 86_400_000;
const SAMPLE_MOVING_S = 30;
const SAMPLE_PARKED_S = 300;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function kmBetween(a: Place, b: Place): number {
  const dLat = (b[0] - a[0]) * 111.32;
  const dLng = (b[1] - a[1]) * 111.32 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

function headingDeg(a: Place, b: Place): number {
  const deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return Math.round((deg + 360) % 360);
}

function toUtcString(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

/** One vehicle's fixes for one Dubai calendar day, oldest first. */
function dayFixes(vehicleId: string, plan: Plan, dayStartUtc: number): DemoFix[] {
  const rand = mulberry32(Number(vehicleId) * 100_003 + Math.floor(dayStartUtc / DAY_MS));
  const fixes: DemoFix[] = [];
  const push = (t: number, at: Place, speed: number, heading: number, ignition: boolean, jitter = 0.00003) =>
    fixes.push({
      deviceId: plan.deviceId,
      recordedAt: toUtcString(t),
      locationLat: Number((at[0] + (rand() - 0.5) * jitter).toFixed(7)),
      locationLng: Number((at[1] + (rand() - 0.5) * jitter).toFixed(7)),
      speed,
      heading,
      ignition,
    });

  // Leaves home between 06:30 and 07:30 Dubai time.
  let t = dayStartUtc + (6.5 + rand()) * 3_600_000;
  const route: Stop[] = [...plan.stops, { at: plan.home, minutes: 0, kind: "park" }];
  let from: Place = plan.home;

  route.forEach((stop, leg) => {
    const km = kmBetween(from, stop.at) * 1.3; // roads are longer than the straight line
    const cruise = 55 + rand() * 30;
    const hdg = headingDeg(from, stop.at);
    const traffic = plan.trafficLegs.includes(leg);
    const crawlS = traffic ? (10 + rand() * 8) * 60 : 0;
    const driveS = (km / cruise) * 3600 + crawlS;
    const curve = (rand() - 0.5) * 0.02;

    for (let s = 0; s < driveS; s += SAMPLE_MOVING_S) {
      const f = s / driveS;
      const crawling = traffic && f > 0.4 && f < 0.4 + crawlS / driveS;
      const bend = Math.sin(f * Math.PI) * curve;
      const at: Place = [from[0] + (stop.at[0] - from[0]) * f + bend, from[1] + (stop.at[1] - from[1]) * f - bend];
      const speed = crawling ? Math.round(rand() * 8) : Math.round(cruise + (rand() - 0.5) * 20);
      push(t + s * 1000, at, speed, hdg, true, 0.0001);
    }
    t += driveS * 1000;

    const stayS = stop.minutes * 60 * (0.7 + rand() * 0.6);
    const step = stop.kind === "idle" ? SAMPLE_MOVING_S : SAMPLE_PARKED_S;
    for (let s = 0; s < stayS; s += step) push(t + s * 1000, stop.at, 0, hdg, stop.kind === "idle");
    t += stayS * 1000;
    if (stop.minutes === 0) push(t, stop.at, 0, hdg, false); // ignition off at home, then silence overnight
    from = stop.at;
  });

  let out = fixes;
  if (plan.offline) {
    const start = parseFix(fixes[0]) + plan.offline.afterMinutes * 60_000;
    const end = start + plan.offline.minutes * 60_000;
    out = fixes.filter((f) => {
      const ft = parseFix(f);
      return ft < start || ft >= end;
    });
  }
  if (plan.badFixes && out.length > 20) {
    const zero = out[10];
    const spike = out[Math.floor(out.length / 2)];
    out.splice(11, 0, { ...zero, locationLat: 0, locationLng: 0 });
    out.splice(Math.floor(out.length / 2) + 1, 0, {
      ...spike,
      recordedAt: toUtcString(parseFix(spike) + 5_000),
      locationLat: 25.9,
      locationLng: 56.3,
    });
  }
  return out;
}

function parseFix(f: DemoFix): number {
  return Date.parse(`${f.recordedAt.replace(" ", "T")}Z`);
}

const dayCache = new Map<string, DemoFix[]>();

/** Demo fixes for a vehicle or device in [from, to], newest first like the real API. */
export function demoPositions(filter: { vehicleId?: string; deviceId?: string; from: string; to: string }): DemoFix[] {
  const vehicleId = filter.vehicleId ?? (filter.deviceId ? DEVICE_TO_VEHICLE[filter.deviceId] : undefined);
  const plan = vehicleId ? PLANS[vehicleId] : undefined;
  if (!vehicleId || !plan) return [];

  const from = Math.max(Date.parse(filter.from), Date.parse(`${plan.since}T00:00:00Z`));
  const to = Date.parse(filter.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return [];

  const firstDay = Math.floor((from + DUBAI_OFFSET_MS) / DAY_MS) * DAY_MS - DUBAI_OFFSET_MS;
  const out: DemoFix[] = [];
  for (let day = firstDay; day <= to && out.length < 500_000; day += DAY_MS) {
    const key = `${vehicleId}:${day}`;
    let fixes = dayCache.get(key);
    if (!fixes) {
      fixes = dayFixes(vehicleId, plan, day);
      if (dayCache.size > 500) dayCache.clear();
      dayCache.set(key, fixes);
    }
    for (const f of fixes) {
      const ft = parseFix(f);
      if (ft >= from && ft <= to) out.push(f);
    }
  }
  return out.reverse();
}
