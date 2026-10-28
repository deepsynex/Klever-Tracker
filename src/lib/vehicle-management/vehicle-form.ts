import type { Vehicle } from "@/lib/graphql/vehicle-management";
import {
  apiTime,
  companyToday,
  dateInputValue,
  intOrNull,
  numberOrNull,
  numText,
  parseWorkingDays,
  serializeWorkingDays,
  textOrNull,
  timeInputValue,
  type WeekDay,
} from "./helpers";
import { normalizePlate } from "./validation";

/** Vehicle form ↔ API mapping (pure, so it's unit-tested). Field names follow the backend handoff doc. */

export const PAYMENT_TYPES = ["yearly", "half_yearly", "quarterly", "monthly"] as const;
export const FUEL_TYPES = ["petrol", "diesel"] as const;

type Kind = "text" | "id" | "int" | "float" | "date" | "time";

/**
 * Every scalar vehicle field the form edits, with how it's converted. `notNull` columns are
 * omitted (not sent as null) when left empty, so clearing them can't break the row.
 */
type FieldSpec = { kind: Kind; notNull?: boolean };

const FIELDS = {
  plateNo: { kind: "text", notNull: true },
  vehicleName: { kind: "text" },
  vehicleTypeId: { kind: "id", notNull: true },
  timezone: { kind: "text" },
  primaryDriverId: { kind: "id" },
  barcode: { kind: "text" },
  brand: { kind: "text" },
  model: { kind: "text" },
  colour: { kind: "text" },
  year: { kind: "int" },
  photoPath: { kind: "text" },
  comment: { kind: "text" },
  installDate: { kind: "date", notNull: true },
  paymentType: { kind: "text", notNull: true },
  subscriptionExpiresAt: { kind: "date" },
  renewedAt: { kind: "date" },
  speedLimitKmh: { kind: "int", notNull: true },
  idleLimitMinutes: { kind: "int", notNull: true },
  odometerKm: { kind: "float", notNull: true },
  lastServiceDate: { kind: "date" },
  lastOilChangeDate: { kind: "date" },
  lastTyreChangeDate: { kind: "date" },
  tyreIntervalKm: { kind: "int" },
  oilIntervalKm: { kind: "int" },
  serviceIntervalKm: { kind: "int" },
  machineServiceHours: { kind: "float" },
  trackingHoursFrom: { kind: "time" },
  trackingHoursTo: { kind: "time" },
  purchaseDate: { kind: "date" },
  totalCost: { kind: "float" },
  downPayment: { kind: "float" },
  monthlyEmi: { kind: "float" },
  emiCount: { kind: "int" },
  emiDueDay: { kind: "int" },
  fuelType: { kind: "text" },
  fuelConsumptionRate: { kind: "float" },
  status: { kind: "text", notNull: true },
} satisfies Record<string, FieldSpec>;

type FieldKey = keyof typeof FIELDS;
const FIELD_ENTRIES = Object.entries(FIELDS) as Array<[FieldKey, FieldSpec]>;

export type VehicleFormValues = Record<FieldKey, string> & {
  hasCanBus: boolean;
  workingDays: WeekDay[];
};

export function emptyVehicleForm(now = new Date()): VehicleFormValues {
  const values = Object.fromEntries(FIELD_ENTRIES.map(([k]) => [k, ""])) as Record<FieldKey, string>;
  return {
    ...values,
    timezone: "Asia/Dubai",
    installDate: companyToday(now),
    paymentType: "yearly",
    speedLimitKmh: "80",
    idleLimitMinutes: "10",
    odometerKm: "0",
    status: "active",
    hasCanBus: false,
    workingDays: [],
  };
}

export function vehicleToForm(v: Vehicle): VehicleFormValues {
  const values = Object.fromEntries(
    FIELD_ENTRIES.map(([key, { kind }]) => {
      const raw = v[key as keyof Vehicle];
      if (kind === "date") return [key, dateInputValue(raw as string | null)];
      if (kind === "time") return [key, timeInputValue(raw as string | null)];
      if (kind === "int" || kind === "float") return [key, numText(raw as number | null)];
      return [key, raw === null || raw === undefined ? "" : String(raw)];
    }),
  ) as Record<FieldKey, string>;
  return { ...values, hasCanBus: v.hasCanBus, workingDays: parseWorkingDays(v.workingDays) };
}

/** Form → mutation variables (create and update take the same names). */
export function vehicleFormToVariables(form: VehicleFormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, { kind, notNull }] of FIELD_ENTRIES) {
    const raw = form[key];
    const value =
      kind === "int" ? intOrNull(raw) : kind === "float" ? numberOrNull(raw) : kind === "time" ? apiTime(raw) : textOrNull(raw);
    if (value === null && notNull) continue;
    out[key] = value;
  }
  out.hasCanBus = form.hasCanBus;
  out.workingDays = serializeWorkingDays(form.workingDays);
  return out;
}

/** Highest accepted values, to catch typos (e.g. an extra zero). */
export const VEHICLE_LIMITS = { speedLimitKmh: 250, idleLimitMinutes: 1440 };

/**
 * Required-field, range and consistency checks. Returns field → translation key under
 * `validation.*`. `otherPlates` are the plates of every other vehicle, for the duplicate check.
 */
export function validateVehicleForm(
  form: VehicleFormValues,
  context: { otherPlates?: string[]; today?: string } = {},
): Record<string, string> {
  const errors: Record<string, string> = {};
  const today = context.today ?? companyToday();
  for (const key of ["plateNo", "vehicleTypeId", "installDate", "paymentType", "speedLimitKmh", "idleLimitMinutes"] as const) {
    if (!form[key].trim()) errors[key] = "required";
  }
  if (form.plateNo.trim() && (context.otherPlates ?? []).some((p) => normalizePlate(p) === normalizePlate(form.plateNo))) {
    errors.plateNo = "duplicatePlate";
  }
  const nonNegative = [
    "speedLimitKmh",
    "idleLimitMinutes",
    "odometerKm",
    "tyreIntervalKm",
    "oilIntervalKm",
    "serviceIntervalKm",
    "machineServiceHours",
    "totalCost",
    "downPayment",
    "monthlyEmi",
    "emiCount",
    "fuelConsumptionRate",
  ] as const;
  for (const key of nonNegative) {
    const n = numberOrNull(form[key]);
    if (form[key].trim() && (n === null || n < 0)) errors[key] = "nonNegative";
  }
  const speed = numberOrNull(form.speedLimitKmh);
  if (!errors.speedLimitKmh && speed !== null && speed > VEHICLE_LIMITS.speedLimitKmh) errors.speedLimitKmh = "speedMax";
  const idle = numberOrNull(form.idleLimitMinutes);
  if (!errors.idleLimitMinutes && idle !== null && idle > VEHICLE_LIMITS.idleLimitMinutes) errors.idleLimitMinutes = "idleMax";
  const year = numberOrNull(form.year);
  if (form.year.trim() && (year === null || year < 1950 || year > new Date().getFullYear() + 1)) errors.year = "year";
  const due = numberOrNull(form.emiDueDay);
  if (form.emiDueDay.trim() && (due === null || due < 1 || due > 31)) errors.emiDueDay = "dayOfMonth";
  if (form.trackingHoursFrom && form.trackingHoursTo && form.trackingHoursFrom === form.trackingHoursTo) {
    errors.trackingHoursTo = "timeRange";
  }
  const cost = numberOrNull(form.totalCost);
  const down = numberOrNull(form.downPayment);
  if (!errors.downPayment && cost !== null && down !== null && down > cost) errors.downPayment = "downPaymentMax";
  if (form.installDate && form.subscriptionExpiresAt && form.subscriptionExpiresAt < form.installDate) {
    errors.subscriptionExpiresAt = "afterInstall";
  }
  for (const key of ["lastServiceDate", "lastOilChangeDate", "lastTyreChangeDate", "purchaseDate"] as const) {
    if (form[key] && form[key] > today) errors[key] = "notFuture";
  }
  return errors;
}
