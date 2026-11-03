import { describe, expect, it } from "vitest";
import { isMaintenanceDue, kmSinceService, lastServiceOdometers } from "./maintenance-due";

const vehicle = (odometerKm: number | null, serviceIntervalKm: number | null) => ({ id: "1", odometerKm, serviceIntervalKm });

describe("lastServiceOdometers", () => {
  it("keeps the highest reading of completed records only", () => {
    const map = lastServiceOdometers([
      { vehicleId: "1", odometerKm: 10_000, status: "completed" },
      { vehicleId: "1", odometerKm: 40_000, status: "completed" },
      { vehicleId: "1", odometerKm: 45_000, status: "scheduled" },
      { vehicleId: "1", odometerKm: null, status: "completed" },
      { vehicleId: "2", odometerKm: 5_000, status: "in_progress" },
    ]);
    expect(map.get("1")).toBe(40_000);
    expect(map.has("2")).toBe(false);
  });
});

describe("isMaintenanceDue", () => {
  it("counts from 0 km when the vehicle has no completed service", () => {
    expect(isMaintenanceDue(vehicle(45_210, 10_000), new Map())).toBe(true);
    expect(isMaintenanceDue(vehicle(8_000, 10_000), new Map())).toBe(false);
  });

  it("clears once a completed service is recorded, and comes back after another interval", () => {
    expect(isMaintenanceDue(vehicle(45_210, 10_000), new Map([["1", 45_000]]))).toBe(false);
    expect(isMaintenanceDue(vehicle(55_000, 10_000), new Map([["1", 45_000]]))).toBe(true);
  });

  it("is never due without an interval or an odometer reading", () => {
    expect(isMaintenanceDue(vehicle(45_210, null), new Map())).toBe(false);
    expect(isMaintenanceDue(vehicle(45_210, 0), new Map())).toBe(false);
    expect(isMaintenanceDue(vehicle(null, 10_000), new Map())).toBe(false);
  });

  it("never reports negative km when a record's reading is above the current odometer", () => {
    expect(kmSinceService(vehicle(30_000, 10_000), new Map([["1", 31_000]]))).toBe(0);
  });
});
