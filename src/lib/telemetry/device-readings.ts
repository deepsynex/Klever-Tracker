/**
 * The tracker's extra values stored with each position (`positionHistory.attributes`, a JSON
 * string), read into plain units. Teltonika I/O ids as decoded by the backend; see
 * data-not-shown-in-app.md (one level above web/). Pure, so Vitest can test it.
 *
 * Every field is null when the record doesn't carry it: the tracker's minute-by-minute beacon
 * records ({"io_548":"01"}) carry none of these.
 */

export type DeviceReadings = {
  /** Total distance counted by the tracker (I/O 16, `odometer_m`), km. */
  odometerKm: number | null;
  /** Current trip's distance (I/O 199), km; resets when the engine starts. */
  tripKm: number | null;
  /** Total engine-on time (I/O 449), seconds. */
  engineSeconds: number | null;
  /** Ignition (I/O 239, `ignition`); null on records without the reading. */
  ignition: boolean | null;
  /** Accelerometer feels movement (I/O 240, `movement`). */
  moving: boolean | null;
  /** Speed the tracker reports from GPS (I/O 24), km/h. */
  gpsSpeedKmh: number | null;
  /** Driving-style score 0–10 (I/O 15, ×0.01); lower = harsher. */
  ecoScore: number | null;
  /** Acceleration in g on each axis (I/O 17/18/19, mG, signed 16-bit). */
  accelG: { x: number; y: number; z: number } | null;
  /** Vehicle battery (I/O 66, `external_voltage_mv`), volts. */
  vehicleBatteryV: number | null;
  /** The tracker's own backup battery (I/O 67), volts. */
  trackerBatteryV: number | null;
  /** Mobile signal 0–5 (I/O 21). */
  gsmSignal: number | null;
  /** GPS: 1 = fix, 2 = no fix (I/O 69). */
  gpsFix: boolean | null;
  /** Horizontal accuracy (HDOP ×10 as sent); lower is better, above 20 is poor. */
  hdop: number | null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** The decoder stores the 16-bit accelerometer values unsigned; 65295 is really −241. */
export function signed16(v: number): number {
  return v > 32767 ? v - 65536 : v;
}

export function parseAttributes(attributes: string | Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!attributes) return {};
  if (typeof attributes === "object") return attributes;
  try {
    const parsed: unknown = JSON.parse(attributes);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function readDevice(attributes: string | Record<string, unknown> | null | undefined): DeviceReadings {
  const a = parseAttributes(attributes);
  const odometerM = num(a.odometer_m) ?? num(a.io_16);
  const trip = num(a.io_199);
  const engine = num(a.io_449);
  const movement = num(a.movement) ?? num(a.io_240);
  const ignition = num(a.ignition) ?? num(a.io_239);
  const eco = num(a.io_15);
  const ax = num(a.io_17);
  const ay = num(a.io_18);
  const az = num(a.io_19);
  const ext = num(a.external_voltage_mv) ?? num(a.io_66);
  const bat = num(a.battery_voltage_mv) ?? num(a.io_67);
  const gnss = num(a.gnss_status) ?? num(a.io_69);
  return {
    odometerKm: odometerM !== null ? odometerM / 1000 : null,
    tripKm: trip !== null ? trip / 1000 : null,
    engineSeconds: engine,
    ignition: ignition === null ? null : ignition === 1,
    moving: movement === null ? null : movement === 1,
    gpsSpeedKmh: num(a.io_24),
    ecoScore: eco !== null ? Math.round(eco) / 100 : null,
    accelG:
      ax !== null && ay !== null && az !== null
        ? { x: signed16(ax) / 1000, y: signed16(ay) / 1000, z: signed16(az) / 1000 }
        : null,
    vehicleBatteryV: ext !== null ? ext / 1000 : null,
    trackerBatteryV: bat !== null ? bat / 1000 : null,
    gsmSignal: num(a.gsm_signal) ?? num(a.io_21),
    gpsFix: gnss === null ? null : gnss === 1,
    hdop: num(a.hdop) ?? num(a.io_182),
  };
}

/** True when the record carries the tracker's full set of readings (not a beacon-only record). */
export function hasReadings(r: DeviceReadings): boolean {
  return r.odometerKm !== null || r.vehicleBatteryV !== null || r.engineSeconds !== null;
}

/** The newest record that has readings, from a newest-first list of positions. */
export function latestReadings<T extends { attributes?: string | null }>(positionsNewestFirst: T[]): DeviceReadings | null {
  for (const p of positionsNewestFirst) {
    const r = readDevice(p.attributes);
    if (hasReadings(r)) return r;
  }
  return null;
}

/** Engine is running when the vehicle battery is being charged (above 13.2 V on a 12 V system). */
export function engineCharging(volts: number | null): boolean | null {
  return volts === null ? null : volts >= 13.2;
}

/** "21 h 21 m" from seconds. */
export function formatEngineTime(seconds: number | null): string | null {
  if (seconds === null || seconds < 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} m` : `${m} m`;
}

/** Strongest acceleration on the horizontal axes (braking, accelerating, cornering), in g. */
export function horizontalPeakG(r: DeviceReadings): number | null {
  if (!r.accelG) return null;
  return Math.max(Math.abs(r.accelG.x), Math.abs(r.accelG.y));
}

/** Around 0.3 g and above usually counts as harsh acceleration, braking or cornering. */
export const HARSH_G = 0.3;

export type PeriodSummary = {
  /**
   * Distance the tracker's odometer counted while the ignition was on, km. Parked GPS drift
   * (the odometer creeping while the car stands still) is left out. Without ignition readings:
   * the plain first-to-last odometer difference.
   */
  odometerKm: number | null;
  /** Odometer counted while parked (ignition off): GPS drift, not real distance, km. */
  parkedDriftKm: number | null;
  /** Engine-on time added in the period, seconds. */
  engineSeconds: number | null;
  /** Lowest eco score seen (worst moment), 0–10. */
  lowestEco: number | null;
  /** Strongest horizontal acceleration seen, g. */
  peakG: number | null;
  /** Records at or above HARSH_G. */
  harshCount: number;
};

/** A History window's totals from its records (any order). */
export function summarisePeriod(records: Array<{ recordedAt: string; attributes?: string | null }>): PeriodSummary {
  const withReadings = records
    .map((p) => ({ at: p.recordedAt, r: readDevice(p.attributes) }))
    .filter((x) => hasReadings(x.r))
    .sort((a, b) => a.at.localeCompare(b.at));
  const first = withReadings[0]?.r;
  const last = withReadings.at(-1)?.r;
  const diff = (f: (r: DeviceReadings) => number | null) => {
    const a = first ? f(first) : null;
    const b = last ? f(last) : null;
    return a !== null && b !== null && b >= a ? b - a : null;
  };
  // Odometer between consecutive records, counted when the engine was on at either end (the
  // drive itself, plus the last stretch into the stop). Off at both ends = parked drift.
  let drivingKm = 0;
  let driftKm = 0;
  let sawIgnition = false;
  for (let k = 1; k < withReadings.length; k++) {
    const prev = withReadings[k - 1].r;
    const cur = withReadings[k].r;
    if (prev.ignition !== null || cur.ignition !== null) sawIgnition = true;
    if (prev.odometerKm === null || cur.odometerKm === null) continue;
    const step = Math.max(0, cur.odometerKm - prev.odometerKm);
    if (prev.ignition === true || cur.ignition === true) drivingKm += step;
    else driftKm += step;
  }
  const odometerTotal = diff((r) => r.odometerKm);
  let lowestEco: number | null = null;
  let peakG: number | null = null;
  let harshCount = 0;
  for (const { r } of withReadings) {
    if (r.ecoScore !== null && (lowestEco === null || r.ecoScore < lowestEco)) lowestEco = r.ecoScore;
    const g = horizontalPeakG(r);
    if (g !== null) {
      if (peakG === null || g > peakG) peakG = g;
      if (g >= HARSH_G) harshCount++;
    }
  }
  return {
    odometerKm: sawIgnition ? (odometerTotal === null ? null : drivingKm) : odometerTotal,
    parkedDriftKm: sawIgnition && odometerTotal !== null ? driftKm : null,
    engineSeconds: diff((r) => r.engineSeconds),
    lowestEco,
    peakG,
    harshCount,
  };
}
