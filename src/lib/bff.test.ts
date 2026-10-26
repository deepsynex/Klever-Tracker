import { describe, expect, it } from "vitest";
import { isAllowedOrigin, safeNextPath } from "./bff";

describe("isAllowedOrigin", () => {
  it("accepts the request's own host when no list is configured", () => {
    expect(isAllowedOrigin("https://app.example.ae", "app.example.ae", [])).toBe(true);
  });

  it("rejects other hosts, missing and malformed origins", () => {
    expect(isAllowedOrigin("https://evil.example", "app.example.ae", [])).toBe(false);
    expect(isAllowedOrigin(null, "app.example.ae", [])).toBe(false);
    expect(isAllowedOrigin("not a url", "app.example.ae", [])).toBe(false);
  });

  it("uses the configured list when present", () => {
    const allowed = ["https://app.example.ae"];
    expect(isAllowedOrigin("https://app.example.ae", "internal:3000", allowed)).toBe(true);
    expect(isAllowedOrigin("http://app.example.ae", "internal:3000", allowed)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/ar/settings/users?page=2", "ar")).toBe("/ar/settings/users?page=2");
  });

  it("falls back to the dashboard for open-redirect attempts", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "", null, "/a\r\nSet-Cookie:x"]) {
      expect(safeNextPath(bad, "en")).toBe("/en/dashboard");
    }
  });
});
