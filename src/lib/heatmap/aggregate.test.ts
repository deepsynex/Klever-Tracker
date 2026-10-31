import { describe, expect, it } from "vitest";
import {
  DWELL_CAP_SECONDS,
  aggregateHeatmap,
  cellSizeForZoom,
  cleanTrack,
  parseUtc,
  type RawPosition,
} from "./aggregate";

const T0 = Date.parse("2026-10-12T06:00:00Z");

/** A fix `min` minutes after T0. */
function fix(min: number, lat: number, lng: number, extra: Partial<RawPosition> = {}): RawPosition {
  return {
    recordedAt: new Date(T0 + min * 60_000).toISOString().replace("T", " ").slice(0, 19),
    locationLat: lat,
    locationLng: lng,
    speed: 40,
    ignition: true,
    ...extra,
  };
}

const STOP: [number, number] = [25.2, 55.27];
/** ~7 km from STOP: reachable in 10 minutes, not in 1. */
const OTHER: [number, number] = [25.26, 55.28];

describe("parseUtc", () => {
  it("reads Klever's zone-less timestamps as UTC", () => {
    expect(parseUtc("2026-10-12 06:00:00")).toBe(T0);
    expect(parseUtc("2026-10-12T10:00:00+04:00")).toBe(T0);
  });
});

describe("cleanTrack", () => {
  it("drops (0,0), missing coordinates and single-fix jumps", () => {
    const { fixes, dropped } = cleanTrack([
      fix(0, 25.2, 55.27),
      fix(1, 0, 0),
      fix(2, null as unknown as number, 55.27),
      fix(3, 25.201, 55.271),
      fix(4, 25.9, 56.3), // ~100 km away one minute later, and back again
      fix(5, 25.202, 55.272),
    ]);
    expect(dropped).toBe(3);
    expect(fixes.map((f) => f.lat)).toEqual([25.2, 25.201, 25.202]);
  });

  it("sorts newest-first API data oldest first", () => {
    const { fixes } = cleanTrack([fix(2, 25.202, 55.27), fix(0, 25.2, 55.27), fix(1, 25.201, 55.27)]);
    expect(fixes.map((f) => f.lat)).toEqual([25.2, 25.201, 25.202]);
  });
});

describe("aggregateHeatmap", () => {
  it("density counts points per cell", () => {
    const r = aggregateHeatmap([[fix(0, ...STOP), fix(1, ...STOP), fix(20, ...OTHER)]], { mode: "density", zoom: 14 });
    expect(r.total_points).toBe(3);
    expect(r.cell_count).toBe(2);
    expect(r.cells[0]).toMatchObject({ weight: 2 });
  });

  it("dwell: a 20-minute stop outweighs several passing points", () => {
    const passing = [0, 0.5, 1, 1.5, 2].map((m, i) => fix(m, 25.25 + i * 0.00001, 55.3, { speed: 70 }));
    const stop = [fix(10, ...STOP, { speed: 0 }), fix(30, ...STOP, { speed: 0 }), fix(31, 25.205, 55.275)];
    const r = aggregateHeatmap([[...passing, fix(2.5, 25.255, 55.3), ...stop]], { mode: "dwell", zoom: 14 });

    const weightNear = (lat: number) =>
      r.cells.filter((c) => Math.abs(c.lat - lat) < 0.001).reduce((sum, c) => sum + c.weight, 0);
    expect(weightNear(STOP[0])).toBe(21 * 60); // 20 min + 1 min until the next fix
    expect(weightNear(25.25)).toBe(150); // five fixes 30 s apart
    expect(weightNear(STOP[0])).toBeGreaterThan(weightNear(25.25) * 5);
  });

  it("dwell: a 3-hour gap (device offline) is capped at 30 minutes", () => {
    const r = aggregateHeatmap([[fix(0, ...STOP), fix(180, ...OTHER)]], { mode: "dwell", zoom: 14 });
    expect(r.cells).toHaveLength(1); // the last fix has no next fix, so weight 0
    expect(r.cells[0].weight).toBe(DWELL_CAP_SECONDS);
  });

  it("dwell is computed per vehicle, never across vehicles", () => {
    const a = [fix(0, ...STOP), fix(1, ...STOP)];
    const b = [fix(0.5, ...OTHER), fix(1.5, ...OTHER)];
    const r = aggregateHeatmap([a, b], { mode: "dwell", zoom: 14 });
    expect(r.cells.map((c) => c.weight)).toEqual([60, 60]);
  });

  it("idle keeps only ignition-on fixes slower than 3 km/h", () => {
    const track = [
      fix(0, ...STOP, { speed: 0, ignition: true }), // idling 10 min
      fix(10, 25.21, 55.28, { speed: 0, ignition: false }), // parked 10 min
      fix(20, 25.22, 55.29, { speed: 50, ignition: true }), // driving
      fix(21, 25.23, 55.3, { speed: 2, ignition: null }), // ignition unknown
      fix(22, 25.24, 55.31),
    ];
    const r = aggregateHeatmap([track], { mode: "idle", zoom: 14 });
    expect(r.total_points).toBe(1);
    expect(r.cells).toEqual([expect.objectContaining({ weight: 600 })]);
  });

  it("filters cells to the bbox but keeps data bounds for fitting the map", () => {
    const r = aggregateHeatmap([[fix(0, ...STOP), fix(10, ...OTHER)]], {
      mode: "density",
      zoom: 14,
      bbox: { south: 25.1, west: 55.2, north: 25.25, east: 55.3 },
    });
    expect(r.cell_count).toBe(1);
    expect(r.bounds).toEqual({ south: 25.2, west: 55.27, north: 25.26, east: 55.28 });
  });

  it("returns no bounds and no cells without data", () => {
    const r = aggregateHeatmap([[], [fix(0, 0, 0)]], { mode: "density", zoom: 12 });
    expect(r).toMatchObject({ total_points: 0, cell_count: 0, bounds: null, dropped_points: 1 });
  });

  it("keeps only the heaviest cells over the cap", () => {
    const track = Array.from({ length: 50 }, (_, i) => fix(i, 25 + i * 0.01, 55));
    track.push(fix(120, 25, 55));
    const r = aggregateHeatmap([track], { mode: "density", zoom: 14, maxCells: 10 });
    expect(r.cell_count).toBe(10);
    expect(r.truncated).toBe(true);
    expect(r.cells[0].weight).toBe(2);
  });
});

describe("cellSizeForZoom", () => {
  it("halves with every zoom level and is clamped", () => {
    expect(cellSizeForZoom(13)).toBeCloseTo(cellSizeForZoom(12) / 2);
    expect(cellSizeForZoom(0)).toBe(cellSizeForZoom(3));
    expect(cellSizeForZoom(22)).toBe(cellSizeForZoom(18));
  });
});
