import { describe, expect, it } from "vitest";
import { classifyMapsError, worseProblem } from "./maps-errors";

describe("classifyMapsError", () => {
  it("recognises the demo-key quota message from the console", () => {
    expect(
      classifyMapsError(
        "Maps Demo Key limit reached: Your daily quota for Maps JavaScript 2D has been met. To continue without interruption and get higher limits, upgrade your account.",
      ),
    ).toBe("quota");
    expect(classifyMapsError("Google Maps JavaScript API error: OverQuotaMapError")).toBe("quota");
  });

  it("tells billing and key problems apart", () => {
    expect(classifyMapsError("Google Maps JavaScript API error: BillingNotEnabledMapError")).toBe("billing");
    expect(classifyMapsError("Google Maps JavaScript API error: RefererNotAllowedMapError")).toBe("key");
    expect(classifyMapsError("Google Maps JavaScript API error: ApiNotActivatedMapError")).toBe("key");
  });

  it("ignores everything else", () => {
    expect(classifyMapsError("Failed to load resource: the server responded with a status of 401")).toBeNull();
    expect(classifyMapsError("Google Maps JavaScript API warning: RetiredVersion")).toBeNull();
  });

  it("keeps the most specific explanation", () => {
    expect(worseProblem("key", "quota")).toBe("quota");
    expect(worseProblem("quota", "load")).toBe("quota");
    expect(worseProblem(null, "billing")).toBe("billing");
  });
});
