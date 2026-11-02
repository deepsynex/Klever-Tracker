import { describe, expect, it } from "vitest";
import {
  ageParts,
  applyFixes,
  emptyTrack,
  gridShape,
  headingOf,
  MAX_GRID,
  MAX_SINGLE,
  mergeHistory,
  parseSaved,
  parseStatus,
  toFix,
  toggleVehicle,
  type Fix,
} from "./core";

const T0 = Date.UTC(2026, 10, 2, 6, 0, 0);
const s = 1000;
/** ~111 m per 0.001° of latitude. */
const fix = (sec: number, lat: number, speed: number, extra: Partial<Fix> = {}): Fix => ({
  time: T0 + sec * s,
  lat,
  lng: 55.3,
  speed,
  heading: null,
  ignition: true,
  ...extra,
});

describe("toFix / parseStatus", () => {
  it("reads the server status and drops unusable rows", () => {
    expect(
      toFix({ recordedAt: "2026-11-02 06:00:00", locationLat: 25.2, locationLng: 55.3, speed: 40, heading: 90, status: "moving" }),
    ).toMatchObject({ time: T0, speed: 40, heading: 90, status: "moving" });
    expect(toFix({ recordedAt: "2026-11-02 06:00:00", locationLat: 0, locationLng: 0 })).toBeNull();
    expect(toFix(null)).toBeNull();
    expect(parseStatus("idle")).toBe("idle");
    expect(parseStatus("parked")).toBe("offline");
  });
});

describe("applyFixes", () => {
  it("appends a duplicate once and ignores late (older) points", () => {
    const t = emptyTrack();
    applyFixes(t, [fix(0, 25.2, 40), fix(15, 25.2015, 40)]);
    expect(applyFixes(t, [fix(15, 25.2015, 40)])).toBe(false);
    expect(applyFixes(t, [fix(5, 25.3, 40)])).toBe(false);
    expect(t.trail).toHaveLength(2);
    expect(t.latest?.time).toBe(T0 + 15 * s);
  });

  it("keeps a parked vehicle to one point while its status still updates", () => {
    const t = emptyTrack();
    applyFixes(t, [fix(0, 25.2, 0, { status: "stopped" })]);
    for (let i = 1; i <= 120; i++) applyFixes(t, [fix(i * 15, 25.2 + (i % 2) * 0.00003, 0, { status: "stopped" })]);
    expect(t.trail).toHaveLength(1);
    expect(applyFixes(t, [{ ...t.latest!, status: "offline" }])).toBe(true);
    expect(t.latest?.status).toBe("offline");
  });

  it("keeps the marker in place on a GPS spike but refreshes its time", () => {
    const t = emptyTrack();
    applyFixes(t, [fix(0, 25.2, 60, { status: "moving" })]);
    applyFixes(t, [fix(15, 26.2, 60, { status: "moving" })]); // 111 km in 15 s
    expect(t.trail).toHaveLength(1);
    expect(t.latest).toMatchObject({ lat: 25.2, time: T0 + 15 * s });
  });

  it("caps the trail, dropping the oldest points", () => {
    const t = emptyTrack();
    applyFixes(t, Array.from({ length: 30 }, (_, i) => fix(i * 10, 25.2 + i * 0.001, 40)), 10);
    expect(t.trail).toHaveLength(10);
    expect(t.trail[0].time).toBe(T0 + 200 * s);
  });
});

describe("mergeHistory", () => {
  it("puts a preloaded trail under the live position", () => {
    const t = emptyTrack();
    applyFixes(t, [fix(600, 25.26, 40, { status: "moving" })]);
    mergeHistory(t, Array.from({ length: 10 }, (_, i) => fix(i * 60, 25.2 + i * 0.006, 40)));
    expect(t.trail).toHaveLength(11);
    expect(t.trail[0].time).toBe(T0);
    expect(t.latest).toMatchObject({ time: T0 + 600 * s, status: "moving" });
  });
});

describe("headingOf", () => {
  it("prefers the device heading, else the direction of travel", () => {
    const t = emptyTrack();
    applyFixes(t, [fix(0, 25.2, 40), fix(15, 25.21, 40)]);
    expect(headingOf(t)).toBeCloseTo(0, 0);
    applyFixes(t, [fix(30, 25.211, 40, { heading: 135 })]);
    expect(headingOf(t)).toBe(135);
  });
});

describe("grid and selection", () => {
  it("lays tiles out as the plan's table", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 9, 10, 12].map((n) => gridShape(n).cols)).toEqual([1, 2, 2, 2, 3, 3, 3, 3, 4, 4]);
    expect(gridShape(12)).toEqual({ cols: 4, rows: 3 });
    expect(gridShape(0)).toEqual({ cols: 1, rows: 1 });
  });

  it("blocks a 13th tile in grid view but not in single-map view", () => {
    const twelve = Array.from({ length: MAX_GRID }, (_, i) => String(i + 1));
    expect(toggleVehicle(twelve, "13", "grid").blocked).toBe("gridLimit");
    expect(toggleVehicle(twelve, "13", "single").selected).toHaveLength(13);
    const fifty = Array.from({ length: MAX_SINGLE }, (_, i) => String(i + 1));
    expect(toggleVehicle(fifty, "99", "single").blocked).toBe("singleLimit");
    expect(toggleVehicle(["1", "2"], "1", "grid")).toEqual({ selected: ["2"], blocked: null });
  });

  it("sanitises the saved selection", () => {
    expect(parseSaved('{"ids":["3","3","x","7"],"view":"grid","preload":30}')).toEqual({ ids: ["3", "7"], view: "grid", preload: 30 });
    expect(parseSaved('{"ids":[],"view":"nope","preload":7}')).toEqual({ ids: [], view: "grid", preload: 15 });
    expect(parseSaved("{broken")).toBeNull();
  });

  it("words ages", () => {
    expect(ageParts(12_000)).toEqual({ unit: "s", n: 12 });
    expect(ageParts(5 * 60_000)).toEqual({ unit: "m", n: 5 });
    expect(ageParts(3 * 3600_000)).toEqual({ unit: "h", n: 3 });
  });
});
