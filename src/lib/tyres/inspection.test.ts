import { describe, expect, it } from "vitest";
import { emptyReading, inspectionInput, suggestedCodes, validateHeader, validateReading } from "./inspection";

const header = { vehicleId: "16", date: "2026-11-19", time: "10:00", odometerKm: "13000", remarks: "" };
const ctx = { lastOdometerKm: 12_500, nowUtc: "2026-11-19 08:00:00", atUtc: "2026-11-19 06:00:00" };

describe("inspection header", () => {
  it("passes a complete header", () => {
    expect(validateHeader(header, ctx)).toEqual({});
  });
  it("needs vehicle, date, time and odometer", () => {
    expect(
      validateHeader({ vehicleId: "", date: "", time: "", odometerKm: "", remarks: "" }, { ...ctx, atUtc: null }),
    ).toEqual({
      vehicleId: "required",
      date: "required",
      time: "required",
      odometerKm: "required",
    });
  });
  it("refuses an odometer below the last reading, and a time in the future", () => {
    expect(validateHeader({ ...header, odometerKm: "12000" }, ctx)).toEqual({ odometerKm: "odometerBack" });
    expect(validateHeader(header, { ...ctx, atUtc: "2026-11-19 09:00:00" })).toEqual({ time: "notFuture" });
  });
});

describe("tyre reading", () => {
  it("needs pressure and the three groove depths, in range", () => {
    expect(validateReading(emptyReading())).toEqual({
      actualPressurePsi: "required",
      outer: "required",
      center: "required",
      inner: "required",
    });
    expect(
      validateReading({
        ...emptyReading(),
        actualPressurePsi: "250",
        recommendedPsi: "300",
        outer: "-1",
        center: "12",
        inner: "45",
      }),
    ).toEqual({
      actualPressurePsi: "pressureRange",
      recommendedPsi: "pressureRange",
      outer: "treadRange",
      inner: "treadRange",
    });
  });
  it("needs a remark when the tyre is marked removed", () => {
    const r = {
      ...emptyReading(),
      actualPressurePsi: "110",
      outer: "4",
      center: "4",
      inner: "4",
      tyreCondition: "removed" as const,
    };
    expect(validateReading(r)).toEqual({ remarks: "required" });
  });
});

describe("suggested recommendations", () => {
  it("follows the conditions", () => {
    expect(suggestedCodes({ tread: "good", pressure: "good", wear: "uniform" })).toEqual([]);
    expect(suggestedCodes({ tread: "needs_replacement", pressure: "under_inflated", wear: "outer" }).sort()).toEqual([
      "check_alignment",
      "correct_pressure",
      "retread_tyre",
    ]);
    expect(suggestedCodes({ tread: "critical", pressure: "good", wear: "center" })).toEqual(["rotate_tyre"]);
  });
});

describe("save payload", () => {
  it("sends the header and every complete reading by position, with or without a tyre", () => {
    const done = {
      ...emptyReading(120),
      actualPressurePsi: "118",
      outer: "12",
      center: "11.5",
      inner: "12",
      recommendationIds: ["3"],
    };
    const sizeOnly = { ...done, recommendedPsi: "" };
    const input = inspectionInput(header, "2026-11-19 06:00:00", { FL: done, FR: emptyReading(), SP1: sizeOnly }, [
      { code: "FL", tyreId: "5" },
      { code: "FR", tyreId: "6" },
      { code: "SP1", tyreId: null },
    ]);
    expect(input).toEqual({
      vehicleId: "16",
      inspectedAt: "2026-11-19 06:00:00",
      odometerKm: 13000,
      remarks: null,
      items: [
        {
          positionCode: "FL",
          tyreId: "5",
          actualPressurePsi: 118,
          recommendedPressurePsi: 120,
          outerTreadMm: 12,
          centerTreadMm: 11.5,
          innerTreadMm: 12,
          tyreCondition: "running",
          photoPath: null,
          remarks: null,
          recommendationIds: ["3"],
        },
        {
          positionCode: "SP1",
          tyreId: null,
          actualPressurePsi: 118,
          recommendedPressurePsi: null,
          outerTreadMm: 12,
          centerTreadMm: 11.5,
          innerTreadMm: 12,
          tyreCondition: "running",
          photoPath: null,
          remarks: null,
          recommendationIds: ["3"],
        },
      ],
    });
  });
});
