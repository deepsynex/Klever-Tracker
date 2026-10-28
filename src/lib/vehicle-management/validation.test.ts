import { describe, expect, it } from "vitest";
import { emptyVehicleForm, validateVehicleForm } from "./vehicle-form";
import {
  isValidPhone,
  normalizePlate,
  validateAllocation,
  validateCalibration,
  validateDistance,
  validateDocumentRow,
  validateDriverQuickAdd,
  validateGroup,
  validateLookupName,
  validateMaintenance,
  validateReturn,
  validateSensorRow,
  validateShareLink,
  validateShift,
  validateTankRow,
} from "./validation";

describe("vehicle form", () => {
  const valid = { ...emptyVehicleForm(new Date("2026-10-28T08:00:00Z")), plateNo: "DXB-A-12345", vehicleTypeId: "2" };
  const ctx = { otherPlates: ["AUH 777", "dxb a 12345"], today: "2026-10-28" };

  it("rejects a plate that only differs in case or separators", () => {
    expect(normalizePlate("DXB-A 12345")).toBe("dxba12345");
    expect(normalizePlate("T.E.S.T.Q.A.0.0.1")).toBe(normalizePlate("TEST-QA-001"));
    expect(normalizePlate("DXB#A(12345)")).toBe("dxba12345");
    expect(validateVehicleForm(valid, ctx).plateNo).toBe("duplicatePlate");
    expect(validateVehicleForm({ ...valid, plateNo: "DXB-B-1" }, ctx)).toEqual({});
  });

  it("checks limits, finance and dates", () => {
    const errors = validateVehicleForm(
      {
        ...valid,
        plateNo: "NEW-1",
        speedLimitKmh: "800",
        idleLimitMinutes: "5000",
        totalCost: "100000",
        downPayment: "150000",
        installDate: "2026-10-28",
        subscriptionExpiresAt: "2026-01-01",
        lastServiceDate: "2026-12-01",
      },
      ctx,
    );
    expect(errors).toEqual({
      speedLimitKmh: "speedMax",
      idleLimitMinutes: "idleMax",
      downPayment: "downPaymentMax",
      subscriptionExpiresAt: "afterInstall",
      lastServiceDate: "notFuture",
    });
  });
});

describe("dropdown masters and quick add", () => {
  it("rejects duplicate type names regardless of case and spacing, but not the row itself", () => {
    const existing = [
      { id: "1", name: "Truck" },
      { id: "2", name: "Car" },
    ];
    expect(validateLookupName(" truck ", existing)).toEqual({ name: "duplicateName" });
    expect(validateLookupName("Truck", existing, "1")).toEqual({});
    expect(validateLookupName("", existing)).toEqual({ name: "required" });
  });

  it("checks the driver's mobile number", () => {
    expect(isValidPhone("+971 50 000 0101")).toBe(true);
    expect(isValidPhone("12ab")).toBe(false);
    expect(validateDriverQuickAdd({ name: "A", mobile: "123" })).toEqual({ mobile: "phone" });
    expect(validateDriverQuickAdd({ name: "", mobile: "" })).toEqual({ name: "required", mobile: "required" });
  });
});

describe("vehicle child rows", () => {
  it("documents: expiry after issue, permits need a name", () => {
    expect(validateDocumentRow({ type: "insurance", issuedAt: "2026-05-01", expiresAt: "2026-04-01" })).toEqual({ expiresAt: "expiryAfterIssue" });
    expect(validateDocumentRow({ type: "permit", customLabel: "" })).toEqual({ customLabel: "required" });
    expect(validateDocumentRow({ type: "insurance", reminderDaysBefore: "-3" })).toEqual({ reminderDaysBefore: "nonNegative" });
  });

  it("sensors: low limit below high limit, positive max voltage", () => {
    expect(validateSensorRow({ sensorType: "temperature", lowLimit: "8", highLimit: "2" })).toEqual({ highLimit: "lowBelowHigh" });
    expect(validateSensorRow({ sensorType: "temperature", lowLimit: "2", highLimit: "8" })).toEqual({});
    expect(validateSensorRow({ sensorType: "analog_input", maxVoltage: "0" })).toEqual({ maxVoltage: "positive" });
  });

  it("fuel tanks: unique tank number, refill within volume", () => {
    expect(validateTankRow({ tankIndex: "1" }, [1, 2])).toEqual({ tankIndex: "duplicateTank" });
    expect(validateTankRow({ tankIndex: "0" }, [])).toEqual({ tankIndex: "positive" });
    expect(validateTankRow({ tankIndex: "3", volumeLitres: "100", minimumRefillLitres: "150" }, [1])).toEqual({ minimumRefillLitres: "refillMax" });
  });
});

describe("allocate and return", () => {
  const base = { vehicleId: "16", driverId: "13", to: "driver" as const, project: "", date: "2026-10-28", start: "2026-10-28T04:00:00.000Z", due: null, odometer: "" };

  it("won't allocate a vehicle that's already out", () => {
    expect(validateAllocation(base, new Set(["16"]))).toEqual({ vehicleId: "vehicleOut" });
    expect(validateAllocation(base, new Set(["18"]))).toEqual({});
  });

  it("checks the due time and project", () => {
    expect(validateAllocation({ ...base, due: "2026-10-28T03:00:00.000Z", to: "project" }, new Set())).toEqual({ dueDate: "afterStart", project: "required" });
  });

  it("checks the return time, odometer and charges", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    const ret = { date: "2026-10-28", returnedAt: "2026-10-28T10:00:00.000Z", allocatedAt: "2026-10-26 04:00:00+00", odometer: "12680", startOdometerKm: 12500, charges: { salik: "24" } };
    expect(validateReturn(ret, now)).toEqual({});
    expect(validateReturn({ ...ret, returnedAt: "2026-10-29T10:00:00.000Z" }, now)).toEqual({ date: "notFuture" });
    expect(validateReturn({ ...ret, returnedAt: "2026-10-25T10:00:00.000Z" }, now)).toEqual({ date: "afterStart" });
    expect(validateReturn({ ...ret, odometer: "12000", charges: { salik: "-1" } }, now)).toEqual({ odometer: "odometerBack", salik: "nonNegative" });
  });
});

describe("maintenance", () => {
  const record = { vehicleId: "16", odometerKm: "12500", discountType: "flat" as const, discount: "" };
  const item = { itemName: "Oil", quantity: "2", unitPrice: "120", discountType: "flat" as const, discount: "" };

  it("accepts a normal bill", () => {
    expect(validateMaintenance(record, [item])).toEqual({});
  });

  it("checks quantities, prices and discounts", () => {
    const errors = validateMaintenance({ ...record, discountType: "percent", discount: "150" }, [
      { ...item, quantity: "0", unitPrice: "-5" },
      { ...item, itemName: "", discountType: "flat", discount: "500" },
      { ...item, discountType: "percent", discount: "120" },
    ]);
    expect(errors).toEqual({
      "item-0-qty": "positive",
      "item-0-price": "nonNegative",
      "item-1-name": "required",
      "item-1-discount": "discountMax",
      "item-2-discount": "percentMax",
      discount: "percentMax",
    });
  });

  it("caps a flat bill discount at the subtotal", () => {
    expect(validateMaintenance({ ...record, discount: "300" }, [item]).discount).toBe("discountMax");
  });
});

describe("groups, shifts, distance, share links, calibration", () => {
  it("groups: names are unique among siblings only", () => {
    const groups = [
      { id: "1", name: "North", parentId: null },
      { id: "2", name: "Depot A", parentId: "1" },
    ];
    expect(validateGroup({ name: "north", parentId: "", isSub: false, inchargeEmail: "" }, groups).name).toBe("duplicateName");
    expect(validateGroup({ name: "Depot A", parentId: "", isSub: false, inchargeEmail: "" }, groups)).toEqual({});
    expect(validateGroup({ name: "X", parentId: "", isSub: true, inchargeEmail: "bad" }, groups)).toEqual({ parentId: "required", inchargeEmail: "email" });
  });

  it("shifts: need a working day and a unique name", () => {
    expect(validateShift({ name: "Day", from: "08:00", to: "18:00", days: [] }, [{ id: "1", name: "day" }])).toEqual({
      name: "duplicateName",
      days: "daysRequired",
    });
  });

  it("distance: one entry per vehicle per day, matching the readings", () => {
    const logs = [{ id: "1", vehicleId: "16", logDate: "2026-10-27" }];
    const f = { vehicleId: "16", date: "2026-10-27", start: "100", stop: "180", distance: "80" };
    expect(validateDistance(f, logs, "2026-10-28")).toEqual({ date: "duplicateDay" });
    expect(validateDistance(f, logs, "2026-10-28", "1")).toEqual({});
    expect(validateDistance({ ...f, date: "2026-10-26", distance: "50" }, logs, "2026-10-28")).toEqual({ distance: "distanceMismatch" });
    expect(validateDistance({ ...f, date: "2026-11-01" }, logs, "2026-10-28")).toEqual({ date: "notFuture" });
  });

  it("share links: expiry after start and in the future", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    expect(validateShareLink({ vehicleId: "16", endDate: "2026-10-28", startsAt: "2026-10-28T10:00:00.000Z", expiresAt: "2026-10-28T09:00:00.000Z" }, now)).toEqual({ endDate: "afterStart" });
    expect(validateShareLink({ vehicleId: "16", endDate: "2026-10-28", startsAt: null, expiresAt: "2026-10-28T11:00:00.000Z" }, now)).toEqual({ endDate: "future" });
  });

  it("fuel calibration: at least two points, no duplicate voltages, sensible ranges", () => {
    const errors = validateCalibration(
      { name: "Tank", capacity: "0", minV: "4", maxV: "1" },
      [
        { voltage: "1", litres: "0" },
        { voltage: "1", litres: "-5" },
      ],
      [],
    );
    expect(errors).toEqual({ capacity: "positive", maxV: "greaterThanMin", "v-1": "duplicateVoltage", "l-1": "nonNegative" });
    expect(validateCalibration({ name: "Tank", capacity: "100", minV: "0.5", maxV: "4.5" }, [{ voltage: "1", litres: "0" }], []).points).toBe("minPoints");
  });
});
