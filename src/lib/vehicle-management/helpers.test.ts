import { describe, expect, it } from "vitest";
import {
  apiTime,
  billTotals,
  companyDateTimeParts,
  companyPartsToUtc,
  daysUsed,
  diffMemberships,
  dropUnneededNulls,
  diffRows,
  expiryState,
  formatDate,
  formatDateTime,
  generateShareToken,
  glideDurationMs,
  intOrNull,
  kmDriven,
  latestExpiry,
  lineGross,
  litresAtVoltage,
  numberOrNull,
  parseApiDateTime,
  parseWorkingDays,
  returnChargesTotal,
  serializeWorkingDays,
  shareLinkState,
  shareUrl,
  textOrNull,
  timeInputValue,
} from "./helpers";

describe("form value conversion", () => {
  it("turns empty inputs into null so a cleared field clears the column", () => {
    expect(textOrNull("  ")).toBeNull();
    expect(textOrNull(" DXB-1 ")).toBe("DXB-1");
    expect(numberOrNull("")).toBeNull();
    expect(numberOrNull("12.5")).toBe(12.5);
    expect(numberOrNull("abc")).toBeNull();
    expect(intOrNull("99.6")).toBe(100);
  });
});

describe("working days", () => {
  it("round-trips the API's JSON array in week order", () => {
    expect(serializeWorkingDays(["fri", "mon", "sun"])).toBe('["sun","mon","fri"]');
    expect(parseWorkingDays('["mon","tue","wed","thu","fri"]')).toEqual(["mon", "tue", "wed", "thu", "fri"]);
    expect(serializeWorkingDays([])).toBeNull();
  });

  it("tolerates bad or capitalised input", () => {
    expect(parseWorkingDays("not json")).toEqual([]);
    expect(parseWorkingDays('["Monday","SAT"]')).toEqual(["mon", "sat"]);
  });
});

describe("times and dates", () => {
  it("converts between time inputs and API times", () => {
    expect(timeInputValue("08:30:00")).toBe("08:30");
    expect(apiTime("08:30")).toBe("08:30:00");
    expect(apiTime("")).toBeNull();
  });

  it("reads the API's space-separated UTC timestamps", () => {
    expect(parseApiDateTime("2026-10-28 08:00:00")?.toISOString()).toBe("2026-10-28T08:00:00.000Z");
    expect(parseApiDateTime("2026-10-28T08:00:00Z")?.toISOString()).toBe("2026-10-28T08:00:00.000Z");
    // Postgres-style short offsets, as the API returns for allocation and share-link times
    expect(parseApiDateTime("2026-10-26 04:00:00+00")?.toISOString()).toBe("2026-10-26T04:00:00.000Z");
    expect(parseApiDateTime("2026-10-26 08:00:00+0400")?.toISOString()).toBe("2026-10-26T04:00:00.000Z");
    expect(parseApiDateTime("2026-10-26T08:00:00+04:00")?.toISOString()).toBe("2026-10-26T04:00:00.000Z");
    expect(parseApiDateTime("garbage")).toBeNull();
  });

  it("shows timestamps in Dubai time and dates as they are", () => {
    expect(formatDateTime("2026-10-28 08:00:00")).toBe("28 Oct 2026, 12:00");
    expect(formatDate("2026-10-28")).toBe("28 Oct 2026");
    expect(formatDate(null)).toBe("—");
  });

  it("edits timestamps in Dubai time and saves them as UTC", () => {
    expect(companyDateTimeParts("2026-10-28 20:30:00")).toEqual({ date: "2026-10-29", time: "00:30" });
    expect(companyPartsToUtc("2026-10-29", "00:30")).toBe("2026-10-28T20:30:00.000Z");
    expect(companyPartsToUtc("", "10:00")).toBeNull();
  });
});

describe("allocate / return", () => {
  it("counts started days, at least one", () => {
    expect(daysUsed("2026-10-28 08:00:00", "2026-10-28 18:00:00")).toBe(1);
    expect(daysUsed("2026-10-28 08:00:00", "2026-10-30 09:00:00")).toBe(3);
    expect(daysUsed(null)).toBeNull();
  });

  it("computes km driven and the suggested total", () => {
    expect(kmDriven(1000, 1150)).toBe(150);
    expect(kmDriven(1000, 900)).toBeNull();
    expect(kmDriven(null, 900)).toBeNull();
    expect(returnChargesTotal(12, null, 30.5)).toBe(42.5);
  });
});

describe("maintenance bill", () => {
  it("applies line and bill discounts as percent or flat", () => {
    expect(lineGross(2, 50, "percent", 10)).toBe(90);
    expect(lineGross(1, 120, "flat", 20)).toBe(100);
    expect(lineGross(1, 10, "flat", 50)).toBe(0); // never negative
    expect(billTotals([90, 100], "percent", 10)).toEqual({ subtotal: 190, discountAmount: 19, total: 171 });
    expect(billTotals([90, 100], "flat", 40)).toEqual({ subtotal: 190, discountAmount: 40, total: 150 });
  });
});

describe("diffs", () => {
  it("finds memberships to add and remove", () => {
    const current = [
      { id: "m1", vehicleId: "1" },
      { id: "m2", vehicleId: "2" },
    ];
    expect(diffMemberships(["2", "3"], current)).toEqual({ add: ["3"], remove: ["m1"] });
  });

  it("finds child rows to create, update and delete", () => {
    const d = diffRows([{ id: "a", v: 1 }, { v: 2 }], ["a", "b"]);
    expect(d.create).toEqual([{ v: 2 }]);
    expect(d.update).toEqual([{ id: "a", v: 1 }]);
    expect(d.remove).toEqual(["b"]);
  });
});

describe("documents", () => {
  const docs = [
    { documentableId: "1", type: "insurance", expiresAt: "2026-12-01" },
    { documentableId: "1", type: "insurance", expiresAt: "2027-12-01" },
    { documentableId: "2", type: "insurance", expiresAt: "2028-01-01" },
  ];

  it("takes the latest expiry of a type for one vehicle", () => {
    expect(latestExpiry(docs, "1", "insurance")).toBe("2027-12-01");
    expect(latestExpiry(docs, "1", "registration")).toBeNull();
  });

  it("flags expired and soon-expiring dates", () => {
    expect(expiryState("2026-10-01", "2026-10-28")).toBe("expired");
    expect(expiryState("2026-11-10", "2026-10-28")).toBe("soon");
    expect(expiryState("2027-06-01", "2026-10-28")).toBe("ok");
    expect(expiryState(null, "2026-10-28")).toBe("none");
  });
});

describe("share links", () => {
  it("generates unguessable URL-safe tokens", () => {
    const a = generateShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(generateShareToken()).not.toBe(a);
    expect(shareUrl("https://app.example.com/", a)).toBe(`https://app.example.com/track/${a}`);
  });

  it("knows whether a link is scheduled, active or expired", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    expect(shareLinkState(null, "2026-10-29 00:00:00", now)).toBe("active");
    expect(shareLinkState("2026-10-29 00:00:00", "2026-10-30 00:00:00", now)).toBe("scheduled");
    expect(shareLinkState(null, "2026-10-28 11:00:00", now)).toBe("expired");
  });
});

describe("fuel calibration", () => {
  it("interpolates litres between calibration points", () => {
    const points = [
      { voltage: 4.5, litres: 100 },
      { voltage: 0.5, litres: 0 },
      { voltage: 2.5, litres: 50 },
    ];
    expect(litresAtVoltage(points, 1.5)).toBe(25);
    expect(litresAtVoltage(points, 5)).toBe(100);
    expect(litresAtVoltage([], 1)).toBeNull();
  });
});

describe("live tracking glide", () => {
  it("glides for the real time between fixes, capped at the refresh interval", () => {
    expect(glideDurationMs("2026-10-28 10:12:05", "2026-10-28 10:12:20", 15_000)).toBe(14_250);
    expect(glideDurationMs("2026-10-28 10:12:15", "2026-10-28 10:12:20", 15_000)).toBe(5_000);
    expect(glideDurationMs("2026-10-28 10:12:19.8", "2026-10-28 10:12:20", 15_000)).toBe(1_000);
  });

  it("falls back to most of the interval when the times are unknown or out of order", () => {
    expect(glideDurationMs(null, "2026-10-28 10:12:20", 15_000)).toBe(14_250);
    expect(glideDurationMs("2026-10-28 10:12:30", "2026-10-28 10:12:20", 15_000)).toBe(14_250);
  });
});

describe("dropUnneededNulls", () => {
  it("never sends nulls on create", () => {
    expect(dropUnneededNulls("mutation CreateVehicle($a: Int) { x }", { plateNo: "A", year: null, comment: null })).toEqual({ plateNo: "A" });
  });

  it("on update, only sends null to clear a value that was saved", () => {
    const previous = { year: 2022, totalCost: null };
    expect(dropUnneededNulls("mutation UpdateVehicle($id: ID!) { x }", { id: "1", year: null, totalCost: null, brand: "Isuzu" }, previous)).toEqual({
      id: "1",
      year: null,
      brand: "Isuzu",
    });
  });

  it("leaves updates alone when the saved values aren't known", () => {
    const vars = { id: "1", year: null };
    expect(dropUnneededNulls("mutation UpdateVehicle($id: ID!) { x }", vars)).toBe(vars);
  });
});
