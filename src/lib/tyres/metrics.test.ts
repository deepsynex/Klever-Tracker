import { describe, expect, it } from "vitest";
import {
  averageTread,
  currentCpk,
  DEFAULT_THRESHOLDS,
  expectedCpk,
  expectedLifeKm,
  pressureCondition,
  runningKm,
  treadCondition,
  tyreMetrics,
  wearCondition,
  wearPercent,
  wearRate,
} from "./metrics";

describe("tread condition", () => {
  it("uses the lowest groove: < 3 mm replace, < 6 mm critical, else good", () => {
    expect(treadCondition([12, 11, 2.9])).toBe("needs_replacement");
    expect(treadCondition([12, 5.9, 8])).toBe("critical");
    expect(treadCondition([6, 6, 6])).toBe("good");
    expect(treadCondition([null, undefined])).toBeNull();
  });
});

describe("pressure condition", () => {
  it("is good within ±5 psi, else over- or under-inflated", () => {
    // ±10 % of 120 psi = ±12 psi.
    expect(pressureCondition(132, 120)).toBe("good");
    expect(pressureCondition(108, 120)).toBe("good");
    expect(pressureCondition(133, 120)).toBe("over_inflated");
    expect(pressureCondition(107, 120)).toBe("under_inflated");
    expect(pressureCondition(124, 120, { ...DEFAULT_THRESHOLDS, pressureTolerancePct: 2 })).toBe("over_inflated");
    expect(pressureCondition(null, 120)).toBeNull();
  });
});

describe("wear condition", () => {
  it("reads uniform, centre, shoulder, outer and inner wear from the three grooves", () => {
    expect(wearCondition(10, 10.5, 10)).toBe("uniform");
    expect(wearCondition(12, 9, 12)).toBe("center");
    expect(wearCondition(8, 12, 8)).toBe("shoulder");
    expect(wearCondition(7, 10, 10)).toBe("outer");
    expect(wearCondition(10, 10, 7)).toBe("inner");
    expect(wearCondition(10, null, 10)).toBeNull();
  });
});

describe("km and cost metrics", () => {
  const fitments = [
    // Fitted at 100 000 km, rotated off at 130 000 (30 000 km).
    { fittedOdometerKm: 100_000, removedOdometerKm: 130_000, removedAt: "2026-06-01 00:00:00" },
    // Fitted again at 130 000, still on; vehicle now at 150 000 (20 000 km).
    { fittedOdometerKm: 130_000, removedOdometerKm: null, removedAt: null },
  ];

  it("adds up running km over each fitment (not the vehicle's)", () => {
    expect(runningKm(fitments, 150_000)).toBe(50_000);
    expect(runningKm([], 150_000)).toBeNull();
  });

  it("returns null instead of dividing by zero for a tyre with no wear yet", () => {
    expect(wearRate(5_000, 18, 18)).toBeNull();
    expect(wearRate(0, 18, 16)).toBeNull();
    expect(currentCpk(1_000, 0)).toBeNull();
    expect(expectedCpk(1_000, null)).toBeNull();
  });

  it("works out average tread, wear %, wear rate, expected life and CPK", () => {
    expect(averageTread(10, 11, 12)).toBe(11);
    expect(wearPercent(9, 18)).toBeCloseTo(0.5);
    expect(wearRate(50_000, 18, 13)).toBe(10_000); // 5 mm worn over 50 000 km
    expect(expectedLifeKm(10_000, 18)).toBe(160_000); // down to 2 mm
    expect(currentCpk(1_600, 50_000)).toBeCloseTo(0.032);
    expect(expectedCpk(1_600, 160_000)).toBeCloseTo(0.01);
  });

  it("puts it all together for one tyre", () => {
    const m = tyreMetrics({
      outer: 13,
      center: 13,
      inner: 13,
      actualPressure: 100,
      recommendedPressure: 120,
      originalTread: 18,
      price: 1_600,
      fitments,
      currentOdometerKm: 150_000,
    });
    expect(m).toMatchObject({
      avgTread: 13,
      tread: "good",
      pressure: "under_inflated",
      wear: "uniform",
      runningKm: 50_000,
      wearRateKmPerMm: 10_000,
      expectedLifeKm: 160_000,
    });
    expect(m.currentCpk).toBeCloseTo(0.032);
  });
});
