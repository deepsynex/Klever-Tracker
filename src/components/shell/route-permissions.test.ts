import { describe, expect, it } from "vitest";
import { requiredModule } from "./route-permissions";

describe("requiredModule", () => {
  it("guards every tracking screen with live-position", () => {
    for (const p of ["/live", "/history", "/multi", "/heatmap", "/tracking/history", "/live-route"]) expect(requiredModule(p)).toBe("live-position");
  });

  it("leaves the dashboard, masters and look-alike paths alone", () => {
    expect(requiredModule("/dashboard")).toBeNull();
    expect(requiredModule("/masters/account-management/profile")).toBeNull();
    expect(requiredModule("/livestock")).toBeNull();
  });
});
