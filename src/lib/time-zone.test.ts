import { afterEach, describe, expect, it } from "vitest";
import { companyDate, companyTimeToUtcIso } from "@/lib/history/selection";
import {
  allTimeZones,
  DEFAULT_TIME_ZONE,
  effectiveTimeZone,
  getDisplayTimeZone,
  setDisplayTimeZone,
  timeZoneLabel,
} from "./time-zone";

afterEach(() => setDisplayTimeZone(DEFAULT_TIME_ZONE));

describe("effectiveTimeZone", () => {
  it("prefers the personal choice, then the company's zone, then the default", () => {
    expect(effectiveTimeZone("Asia/Kolkata", "Asia/Dubai")).toBe("Asia/Kolkata");
    expect(effectiveTimeZone("company", "Europe/London")).toBe("Europe/London");
    expect(effectiveTimeZone("company", null)).toBe(DEFAULT_TIME_ZONE);
    expect(effectiveTimeZone("Not/AZone", "Bad/Zone")).toBe(DEFAULT_TIME_ZONE);
  });
});

describe("display time zone", () => {
  it("drives the date/time helpers", () => {
    // 02-11-2026 00:00 in Dubai is 20:00 UTC the day before; in Kolkata it's 18:30 UTC.
    expect(companyTimeToUtcIso("2026-11-02", "00:00")).toBe("2026-11-01T20:00:00.000Z");
    setDisplayTimeZone("Asia/Kolkata");
    expect(getDisplayTimeZone()).toBe("Asia/Kolkata");
    expect(companyTimeToUtcIso("2026-11-02", "00:00")).toBe("2026-11-01T18:30:00.000Z");
    expect(companyDate(0, new Date("2026-11-01T19:00:00Z"))).toBe("2026-11-02");
  });

  it("ignores an invalid zone", () => {
    setDisplayTimeZone("Mars/Olympus");
    expect(getDisplayTimeZone()).toBe(DEFAULT_TIME_ZONE);
  });

  it("labels zones with their name and UTC offset, under current names", () => {
    expect(timeZoneLabel("Asia/Kolkata")).toBe("Asia/Kolkata — India Standard Time (UTC+05:30)");
    expect(timeZoneLabel("Asia/Calcutta")).toBe("Asia/Kolkata — India Standard Time (UTC+05:30)");
    expect(timeZoneLabel("UTC")).toBe("UTC (UTC+00:00)");
  });

  it("offers IST under its current name, once", () => {
    const zones = allTimeZones();
    expect(zones).toContain("Asia/Kolkata");
    expect(zones).not.toContain("Asia/Calcutta");
    expect(zones.filter((z) => z === "Asia/Dubai")).toHaveLength(1);
  });
});
