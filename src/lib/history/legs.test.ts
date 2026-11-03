import { describe, expect, it } from "vitest";
import { cleanTrack } from "./clean-track";
import { computeRouteLegs, fixTime, formatDuration, tripTimes, type LegPoint } from "./legs";

const T0 = Date.parse("2026-11-02T06:00:00Z");

/** A fix `min` minutes after T0, in the API's zone-less UTC format. */
function at(min: number, lat: number, lng: number, speed: number, ignition: boolean | null = true) {
  return {
    recordedAt: new Date(T0 + min * 60_000).toISOString().replace("T", " ").slice(0, 19),
    locationLat: lat,
    locationLng: lng,
    speed,
    ignition,
  };
}

/** Driving east one fix a minute (~550 m apart) from `fromMin` to `toMin`, starting at lng. */
function drive(fromMin: number, toMin: number, lng: number) {
  return Array.from({ length: toMin - fromMin + 1 }, (_, k) => at(fromMin + k, 25.2, lng + k * 0.0055, 40));
}

/** Parked one fix a minute, scattered a few metres, engine off. */
function park(fromMin: number, toMin: number, lng: number) {
  return Array.from({ length: toMin - fromMin + 1 }, (_, k) =>
    at(fromMin + k, 25.2 + (k % 3) * 0.00002, lng + (k % 2) * 0.00002, k % 4, false),
  );
}

describe("fixTime", () => {
  it("reads the API's zone-less times as UTC, like parseApiDateTime", () => {
    expect(fixTime({ recordedAt: "2026-11-02 06:00:00" })).toBe(T0);
    expect(fixTime({ recordedAt: "2026-11-02T10:00:00+04:00" })).toBe(T0);
  });
});

describe("computeRouteLegs + tripTimes", () => {
  // 30 min driving, 2 h parked, 20 min driving.
  const lngB = 55.27 + 30 * 0.0055;
  const raw = [...drive(0, 30, 55.27), ...park(31, 150, lngB), ...drive(151, 170, lngB)];
  const points = cleanTrack(raw).points as LegPoint[];
  const legs = computeRouteLegs(points);

  it("splits at the stop and times each leg as driving only", () => {
    expect(legs).toHaveLength(2);
    expect(legs[0].durationMs).toBe(31 * 60_000); // 30 min driving + 1 min pulling in (arrival at min 31)
    expect(legs[1].durationMs).toBeGreaterThanOrEqual(19 * 60_000);
    expect(legs[1].durationMs).toBeLessThanOrEqual(21 * 60_000);
  });

  it("separates driving from stopped time; together they make the span", () => {
    const times = tripTimes(points, legs);
    expect(times.spanMs).toBe(170 * 60_000);
    expect(times.drivingMs + times.stoppedMs).toBe(times.spanMs);
    expect(times.stoppedMs).toBeGreaterThanOrEqual(115 * 60_000); // the 2 h stop
    expect(times.drivingMs).toBeLessThanOrEqual(55 * 60_000);
  });

  it("treats a 4-minute stop as a stop (the old rule needed 5)", () => {
    const short = cleanTrack([...drive(0, 10, 55.27), ...park(11, 15, 55.27 + 10 * 0.0055), ...drive(16, 26, 55.27 + 10 * 0.0055)])
      .points as LegPoint[];
    expect(computeRouteLegs(short)).toHaveLength(2);
  });

  it("keeps one leg through a short wait under 3 minutes", () => {
    const lights = [...drive(0, 10, 55.27), at(11, 25.2, 55.27 + 10 * 0.0055, 0), ...drive(12, 22, 55.27 + 10 * 0.0055)];
    expect(computeRouteLegs(lights)).toHaveLength(1);
  });

  it("handles fewer than two fixes", () => {
    expect(computeRouteLegs([])).toEqual([]);
    expect(tripTimes([at(0, 25.2, 55.27, 0)], [])).toEqual({ spanMs: 0, drivingMs: 0, stoppedMs: 0 });
  });
});

describe("formatDuration", () => {
  it("formats one way everywhere", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(40_000)).toBe("40s");
    expect(formatDuration(59_700)).toBe("1m");
    expect(formatDuration(90_000)).toBe("2m"); // rounded to the nearest minute
    expect(formatDuration(45 * 60_000)).toBe("45m");
    expect(formatDuration((2 * 60 + 5) * 60_000)).toBe("2h 05m");
    expect(formatDuration(NaN)).toBe("0m");
  });
});
