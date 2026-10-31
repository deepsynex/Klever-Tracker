import { describe, expect, it } from "vitest";
import { aggregateHeatmap } from "./aggregate";
import { demoPositions } from "./demo-tracks";

const DAY = { from: "2026-10-12T00:00:00Z", to: "2026-10-12T23:59:59Z" };
const t = (s: string) => Date.parse(s.endsWith("Z") ? s : `${s.replace(" ", "T")}Z`);

describe("demoPositions", () => {
  it("is deterministic and newest first", () => {
    const a = demoPositions({ vehicleId: "1", ...DAY });
    expect(a).toEqual(demoPositions({ vehicleId: "1", ...DAY }));
    expect(t(a[0].recordedAt)).toBeGreaterThan(t(a[a.length - 1].recordedAt));
    expect(a.length).toBeGreaterThan(150);
  });

  it("stays inside the window and in the Dubai/Sharjah area (bad fixes aside)", () => {
    const fixes = demoPositions({ vehicleId: "3", ...DAY });
    for (const f of fixes) {
      expect(t(f.recordedAt)).toBeGreaterThanOrEqual(t(DAY.from));
      expect(t(f.recordedAt)).toBeLessThanOrEqual(t(DAY.to));
    }
    const good = fixes.filter((f) => f.locationLat > 24.9 && f.locationLat < 25.4);
    expect(fixes.length - good.length).toBe(2); // one (0,0) fix and one jump
  });

  it("has a device-offline gap of about three hours for vehicle 2", () => {
    const times = demoPositions({ vehicleId: "2", ...DAY })
      .map((f) => t(f.recordedAt))
      .reverse();
    const longest = Math.max(...times.slice(1).map((v, i) => v - times[i]));
    expect(longest).toBeGreaterThan(2.5 * 3_600_000);
  });

  it("has parking and idling stops that dominate the dwell heatmap", () => {
    const fixes = demoPositions({ vehicleId: "1", ...DAY });
    expect(fixes.some((f) => f.speed === 0 && !f.ignition)).toBe(true);
    expect(fixes.some((f) => f.speed === 0 && f.ignition)).toBe(true);
    const dwell = aggregateHeatmap([fixes], { mode: "dwell", zoom: 15 });
    const density = aggregateHeatmap([fixes], { mode: "density", zoom: 15 });
    // The heaviest dwell cell holds a far bigger share of the total than the heaviest density cell.
    const share = (r: typeof dwell) => r.cells[0].weight / r.cells.reduce((s, c) => s + c.weight, 0);
    expect(share(dwell)).toBeGreaterThan(share(density));
  });

  it("maps fitted devices to their vehicle and ignores unknown ids", () => {
    expect(demoPositions({ deviceId: "1", ...DAY })).toEqual(demoPositions({ vehicleId: "1", ...DAY }));
    expect(demoPositions({ vehicleId: "99", ...DAY })).toEqual([]);
  });

  it("has no data before the tracker's install date", () => {
    expect(demoPositions({ vehicleId: "1", from: "2020-01-01T00:00:00Z", to: "2020-01-02T00:00:00Z" })).toEqual([]);
  });
});
