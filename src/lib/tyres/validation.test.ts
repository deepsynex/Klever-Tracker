import { describe, expect, it } from "vitest";
import {
  codeFromTitle,
  validateCustomer,
  validateCustomerVehicle,
  validateRecommendation,
  validateTyreProduct,
  validateTyreSettings,
} from "./validation";

describe("validateCustomer", () => {
  const existing = [{ id: "1", name: "QA Test Customer" }];
  it("needs a name that isn't used yet (case-insensitive)", () => {
    expect(validateCustomer({ name: " " }, existing)).toEqual({ name: "required" });
    expect(validateCustomer({ name: "qa test  customer" }, existing)).toEqual({ name: "duplicateName" });
    expect(validateCustomer({ name: "QA Test Customer" }, existing, "1")).toEqual({});
  });
  it("checks email and phone only when filled in", () => {
    expect(validateCustomer({ name: "Al Noor", email: "", contactPhone: "" }, existing)).toEqual({});
    expect(validateCustomer({ name: "Al Noor", email: "a@b", contactPhone: "12" }, existing)).toEqual({
      email: "email",
      contactPhone: "phone",
    });
    expect(validateCustomer({ name: "Al Noor", email: "a@b.com", contactPhone: "+971 50 000 0000" }, existing)).toEqual(
      {},
    );
  });
});

describe("validateCustomerVehicle", () => {
  it("needs customer, plate and type", () => {
    expect(validateCustomerVehicle({ customerId: "", plateNo: "", vehicleTypeId: "" }, [])).toEqual({
      customerId: "required",
      plateNo: "required",
      vehicleTypeId: "required",
    });
  });
  it("rejects a plate another vehicle has, ignoring punctuation and case", () => {
    expect(
      validateCustomerVehicle({ customerId: "1", plateNo: "test qa-001", vehicleTypeId: "2" }, ["TEST-QA-001"]).plateNo,
    ).toBe("duplicatePlate");
  });
  it("needs a daily average of 0 km or more", () => {
    const base = { customerId: "1", plateNo: "X1", vehicleTypeId: "2" };
    expect(validateCustomerVehicle({ ...base, dailyAvgRunningKm: "-5" }, [])).toEqual({
      dailyAvgRunningKm: "nonNegative",
    });
    expect(validateCustomerVehicle({ ...base, dailyAvgRunningKm: "abc" }, [])).toEqual({
      dailyAvgRunningKm: "nonNegative",
    });
    expect(validateCustomerVehicle({ ...base, dailyAvgRunningKm: "250" }, [])).toEqual({});
  });
});

describe("validateTyreProduct", () => {
  it("needs size and brand, and sensible numbers", () => {
    expect(validateTyreProduct({ tyreSizeId: "", tyreBrandId: "" })).toEqual({
      tyreSizeId: "required",
      tyreBrandId: "required",
    });
    expect(
      validateTyreProduct({
        tyreSizeId: "1",
        tyreBrandId: "1",
        plyRating: "16.5",
        recommendedPressurePsi: "-1",
        originalTreadDepthMm: "x",
      }),
    ).toEqual({
      plyRating: "positiveWhole",
      recommendedPressurePsi: "nonNegative",
      originalTreadDepthMm: "nonNegative",
    });
    expect(
      validateTyreProduct({
        tyreSizeId: "1",
        tyreBrandId: "1",
        plyRating: "18",
        recommendedPressurePsi: "120",
        originalTreadDepthMm: "18",
      }),
    ).toEqual({});
  });
});

describe("validateRecommendation", () => {
  const existing = [{ id: "1", code: "rotate_tyre" }];
  it("checks the code only for a new recommendation", () => {
    expect(validateRecommendation({ code: "", title: "" }, existing)).toEqual({ code: "required", title: "required" });
    expect(validateRecommendation({ code: "Rotate Tyre", title: "x" }, existing)).toEqual({ code: "codeFormat" });
    expect(validateRecommendation({ code: "rotate_tyre", title: "x" }, existing)).toEqual({ code: "duplicateCode" });
    expect(validateRecommendation({ code: "", title: "Rotate" }, existing, "1")).toEqual({});
  });
  it("suggests a code from the title", () => {
    expect(codeFromTitle("Check Wheel Balance")).toBe("check_wheel_balance");
    expect(codeFromTitle("  3 axle — check! ")).toBe("r_3_axle_check");
  });
});

describe("validateTyreSettings", () => {
  const ok = { treadCriticalMm: "6", treadReplaceMm: "3", pressureTolerancePct: "10" };
  it("accepts the defaults", () => {
    expect(validateTyreSettings(ok)).toEqual({});
  });
  it("needs every value, in range, with the replace depth below the critical one", () => {
    expect(validateTyreSettings({ treadCriticalMm: "", treadReplaceMm: "0", pressureTolerancePct: "" })).toEqual({
      treadCriticalMm: "required",
      treadReplaceMm: "positive",
      pressureTolerancePct: "required",
    });
    expect(validateTyreSettings({ ...ok, treadReplaceMm: "6" })).toEqual({ treadReplaceMm: "replaceBelowCritical" });
    expect(validateTyreSettings({ ...ok, treadCriticalMm: "45", pressureTolerancePct: "150" })).toEqual({
      treadCriticalMm: "treadRange",
      pressureTolerancePct: "percent",
    });
  });
});
