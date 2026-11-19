import { describe, expect, it } from "vitest";
import { mergeTrackedVehicles } from "./vehicle-management";

describe("mergeTrackedVehicles", () => {
  it("adds tracked customer trucks to the own fleet, once each", () => {
    const merged = mergeTrackedVehicles({
      vehicles: { data: [{ id: "1" }, { id: "18" }] },
      trackedVehicles: { data: [{ id: "1" }, { id: "16" }] },
      devices: { data: [] },
    });
    expect(merged).toEqual({ vehicles: { data: [{ id: "1" }, { id: "18" }, { id: "16" }] }, devices: { data: [] } });
  });

  it("copes with a list the role may not read (empty or null)", () => {
    expect(mergeTrackedVehicles({ vehicles: { data: [{ id: "1" }] }, trackedVehicles: null })).toEqual({
      vehicles: { data: [{ id: "1" }] },
    });
    expect(mergeTrackedVehicles({ vehicles: null, trackedVehicles: { data: [{ id: "16" }] } })).toEqual({
      vehicles: { data: [{ id: "16" }] },
    });
  });

  it("leaves results without a tracked list alone", () => {
    const result = { users: { data: [] } };
    expect(mergeTrackedVehicles(result)).toBe(result);
  });
});
