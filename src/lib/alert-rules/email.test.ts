import { describe, expect, it } from "vitest";
import { DEFAULT_SUBJECT, fillPlaceholders } from "./email";

describe("fillPlaceholders", () => {
  it("fills known placeholders and leaves unknown ones as typed", () => {
    expect(fillPlaceholders(DEFAULT_SUBJECT, { alert: "Geofence Enter", vehicle: "GJ-01-KY-5144" })).toBe("Geofence Enter: GJ-01-KY-5144");
    expect(fillPlaceholders("{vehicle} at {geofence} {driver}", { vehicle: "A1", geofence: "" })).toBe("A1 at  {driver}");
  });
});
