import { describe, expect, it } from "vitest";
import type { Vehicle } from "@/lib/graphql/vehicle-management";
import { emptyVehicleForm, validateVehicleForm, vehicleFormToVariables, vehicleToForm } from "./vehicle-form";

const vehicle: Vehicle = {
  id: "7",
  companyId: "1",
  plateNo: "DXB-A-12345",
  vehicleName: "Truck 1",
  vehicleTypeId: "3",
  timezone: "Asia/Dubai",
  primaryDriverId: "4",
  attendant1Id: null,
  attendant2Id: null,
  barcode: null,
  brand: "Isuzu",
  model: "NPR",
  colour: null,
  year: 2022,
  photoPath: null,
  comment: null,
  hasCanBus: true,
  installDate: "2026-10-28 00:00:00",
  paymentType: "monthly",
  subscriptionExpiresAt: "2027-10-28",
  renewedAt: null,
  speedLimitKmh: 100,
  idleLimitMinutes: 10,
  odometerKm: 1250.5,
  lastServiceDate: null,
  lastOilChangeDate: null,
  lastTyreChangeDate: null,
  tyreIntervalKm: null,
  oilIntervalKm: 5000,
  serviceIntervalKm: 10000,
  machineServiceHours: null,
  trackingHoursFrom: "08:00:00",
  trackingHoursTo: "18:00:00",
  workingDays: '["mon","tue"]',
  purchaseDate: null,
  totalCost: null,
  downPayment: null,
  monthlyEmi: null,
  emiCount: null,
  emiDueDay: 5,
  fuelType: "diesel",
  fuelConsumptionRate: 8.5,
  status: "active",
};

describe("vehicle form", () => {
  it("round-trips a vehicle through the form", () => {
    const form = vehicleToForm(vehicle);
    expect(form.installDate).toBe("2026-10-28");
    expect(form.trackingHoursFrom).toBe("08:00");
    expect(form.workingDays).toEqual(["mon", "tue"]);
    expect(form.odometerKm).toBe("1250.5");

    const vars = vehicleFormToVariables(form);
    expect(vars).toMatchObject({
      plateNo: "DXB-A-12345",
      vehicleTypeId: "3",
      installDate: "2026-10-28",
      speedLimitKmh: 100,
      odometerKm: 1250.5,
      trackingHoursFrom: "08:00:00",
      workingDays: '["mon","tue"]',
      hasCanBus: true,
      colour: null, // cleared optional fields are sent as null so they clear
    });
  });

  it("never sends null for NOT NULL columns", () => {
    const form = { ...vehicleToForm(vehicle), odometerKm: "", status: "" };
    const vars = vehicleFormToVariables(form);
    expect("odometerKm" in vars).toBe(false);
    expect("status" in vars).toBe(false);
  });

  it("requires the fields the API requires and checks ranges", () => {
    const errors = validateVehicleForm({ ...emptyVehicleForm(), year: "1800", emiDueDay: "40", oilIntervalKm: "-5" });
    expect(errors).toMatchObject({ plateNo: "required", vehicleTypeId: "required", year: "year", emiDueDay: "dayOfMonth", oilIntervalKm: "nonNegative" });
    expect(errors.installDate).toBeUndefined(); // defaults to today
    expect(validateVehicleForm({ ...vehicleToForm(vehicle) })).toEqual({});
  });
});
