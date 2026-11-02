import { describe, expect, it } from "vitest";
import { formatInCompanyTz, isValidTimeZone } from "./company-time";

describe("formatInCompanyTz", () => {
  it("shows the API's UTC time in the company's zone", () => {
    expect(formatInCompanyTz("2026-11-02 05:33:20", "Asia/Dubai")).toBe("02-11-2026 09:33:20 AM");
    expect(formatInCompanyTz("2026-11-02 05:33:20", "Asia/Kolkata")).toBe("02-11-2026 11:03:20 AM");
  });

  it("falls back to Asia/Dubai for an unknown zone and shows a dash for no time", () => {
    expect(formatInCompanyTz("2026-11-02 05:33:20", "Mars/Olympus")).toBe("02-11-2026 09:33:20 AM");
    expect(formatInCompanyTz(null, "Asia/Dubai")).toBe("—");
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});
