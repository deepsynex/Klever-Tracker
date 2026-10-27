import { describe, expect, it } from "vitest";
import { buildTrackTargets, companyDate, companyTimeToUtcIso, historyFilter } from "./selection";

describe("buildTrackTargets", () => {
  it("returns nothing when the company has no vehicles or devices", () => {
    expect(buildTrackTargets([], [])).toEqual([]);
  });

  it("lists vehicles, then devices labelled with their vehicle's plate", () => {
    const targets = buildTrackTargets(
      [{ id: "7", plateNo: "DXB-A-1", vehicleName: "Truck 1" }],
      [
        { id: "3", imei: "862272088660768", vehicleId: "7" },
        { id: "4", imei: "111", vehicleId: null },
      ],
    );
    expect(targets.map((t) => [t.key, t.label])).toEqual([
      ["vehicle:7", "DXB-A-1 — Truck 1"],
      ["device:3", "862272088660768 (DXB-A-1)"],
      ["device:4", "111"],
    ]);
  });
});

describe("historyFilter", () => {
  it("sends only the id that matches the target kind", () => {
    expect(historyFilter({ key: "vehicle:7", kind: "vehicle", id: "7", label: "" })).toEqual({ vehicleId: "7" });
    expect(historyFilter({ key: "device:3", kind: "device", id: "3", label: "" })).toEqual({ deviceId: "3" });
  });
});

describe("company time zone", () => {
  it("reads form dates as Asia/Dubai (UTC+4) and sends UTC", () => {
    expect(companyTimeToUtcIso("2026-10-12", "06:00")).toBe("2026-10-12T02:00:00.000Z");
    expect(companyTimeToUtcIso("2026-10-12", "23:59", 59)).toBe("2026-10-12T19:59:59.000Z");
  });

  it("computes today in Dubai, not in the browser's zone", () => {
    // 21:30 UTC on 26 Oct is already 01:30 on 27 Oct in Dubai.
    const now = new Date("2026-10-26T21:30:00Z");
    expect(companyDate(0, now)).toBe("2026-10-27");
    expect(companyDate(6, now)).toBe("2026-10-21");
  });
});
