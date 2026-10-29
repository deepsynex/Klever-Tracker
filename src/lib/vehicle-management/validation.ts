/**
 * Validation rules for every Vehicle Management form, kept pure (no React) so they're unit
 * tested in one place. Each function returns field → translation key under `validation.*`;
 * an empty object means the form is valid. Form values are the raw input strings.
 */
import { numberOrNull, parseApiDateTime, type DiscountType } from "./helpers";

export type Errors = Record<string, string>;

/** Case- and space-insensitive key for duplicate checks ("Al  Futtaim " = "al futtaim"). */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** Plates compare letters and digits only, case-insensitively (same rule as the API): "T.E.S.T-QA 001" = "testqa001". */
export function normalizePlate(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const isBlank = (v: string | null | undefined) => !v || !v.trim();
/** A filled-in value that isn't a number, or is below `min`. */
const below = (v: string, min: number) => !isBlank(v) && ((numberOrNull(v) ?? Number.NaN) < min || numberOrNull(v) === null);
const notAbove = (v: string, min: number) => !isBlank(v) && (numberOrNull(v) === null || (numberOrNull(v) as number) <= min);
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

// ---------------------------------------------------------------------------------------------
// Dropdown masters and quick-add
// ---------------------------------------------------------------------------------------------

/** Vehicle / maintenance / service type name: required and unique among the others. */
export function validateLookupName(name: string, existing: Array<{ id: string; name: string }>, selfId?: string): Errors {
  if (isBlank(name)) return { name: "required" };
  const key = normalizeName(name);
  return existing.some((x) => x.id !== selfId && normalizeName(x.name) === key) ? { name: "duplicateName" } : {};
}

/** Phone: optional leading +, then 7–15 digits (spaces, dashes and brackets allowed). */
export function isValidPhone(value: string): boolean {
  const v = value.trim();
  if (!/^\+?[\d\s\-()]+$/.test(v)) return false;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/** Driver quick-add from the vehicle, allocation and maintenance forms. */
export function validateDriverQuickAdd(values: Record<string, string>): Errors {
  const errors: Errors = {};
  if (isBlank(values.name)) errors.name = "required";
  if (isBlank(values.mobile)) errors.mobile = "required";
  else if (!isValidPhone(values.mobile)) errors.mobile = "phone";
  return errors;
}

// ---------------------------------------------------------------------------------------------
// Vehicle child rows
// ---------------------------------------------------------------------------------------------

/** A vehicle document (insurance, Mulkiya, permit, ...). */
export function validateDocumentRow(v: Record<string, string>): Errors {
  const errors: Errors = {};
  if (isBlank(v.type)) errors.type = "required";
  // Permits and "other" documents are told apart by their name.
  if ((v.type === "permit" || v.type === "national_permit" || v.type === "custom") && isBlank(v.customLabel)) {
    errors.customLabel = "required";
  }
  if (v.issuedAt && v.expiresAt && v.expiresAt < v.issuedAt) errors.expiresAt = "expiryAfterIssue";
  if (below(v.reminderDaysBefore ?? "", 0)) errors.reminderDaysBefore = "nonNegative";
  return errors;
}

/** A sensor (analog/digital input or temperature). Limits only apply to temperature sensors. */
export function validateSensorRow(v: Record<string, string>): Errors {
  const errors: Errors = {};
  if (v.sensorType !== undefined && isBlank(v.sensorType)) errors.sensorType = "required";
  if (below(v.ioIndex ?? "", 0)) errors.ioIndex = "nonNegative";
  if (below(v.sortOrder ?? "", 0)) errors.sortOrder = "nonNegative";
  if (notAbove(v.maxVoltage ?? "", 0)) errors.maxVoltage = "positive";
  const low = numberOrNull(v.lowLimit);
  const high = numberOrNull(v.highLimit);
  if (!isBlank(v.lowLimit) && low === null) errors.lowLimit = "number";
  if (!isBlank(v.highLimit) && high === null) errors.highLimit = "number";
  if (low !== null && high !== null && low >= high) errors.highLimit = "lowBelowHigh";
  return errors;
}

/** A fuel tank; the tank number must be unique on the vehicle. */
export function validateTankRow(v: Record<string, string>, otherTankIndexes: number[]): Errors {
  const errors: Errors = {};
  const index = numberOrNull(v.tankIndex);
  if (isBlank(v.tankIndex)) errors.tankIndex = "required";
  else if (index === null || index < 1 || !Number.isInteger(index)) errors.tankIndex = "positive";
  else if (otherTankIndexes.includes(index)) errors.tankIndex = "duplicateTank";
  if (notAbove(v.volumeLitres ?? "", 0)) errors.volumeLitres = "positive";
  if (below(v.minimumRefillLitres ?? "", 0)) errors.minimumRefillLitres = "nonNegative";
  const volume = numberOrNull(v.volumeLitres);
  const refill = numberOrNull(v.minimumRefillLitres);
  if (!errors.minimumRefillLitres && volume !== null && refill !== null && refill > volume) {
    errors.minimumRefillLitres = "refillMax";
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------
// Allocate / return
// ---------------------------------------------------------------------------------------------

export function validateAllocation(
  f: {
    vehicleId: string;
    driverId: string;
    to: "driver" | "project";
    project: string;
    date: string;
    /** UTC ISO of the allocation, or null */
    start: string | null;
    /** UTC ISO of the due time, or null */
    due: string | null;
    odometer: string;
  },
  /** Vehicles that are out right now (allocated and not yet returned). */
  vehiclesOut: Set<string>,
): Errors {
  const errors: Errors = {};
  if (!f.vehicleId) errors.vehicleId = "required";
  else if (vehiclesOut.has(f.vehicleId)) errors.vehicleId = "vehicleOut";
  if (!f.driverId) errors.driverId = "required";
  if (f.to === "project" && isBlank(f.project)) errors.project = "required";
  if (!f.date) errors.date = "required";
  if (f.start && f.due && f.due <= f.start) errors.dueDate = "afterStart";
  if (below(f.odometer, 0)) errors.odometer = "nonNegative";
  return errors;
}

export function validateReturn(
  f: {
    date: string;
    /** UTC ISO of the return, or null */
    returnedAt: string | null;
    allocatedAt: string;
    odometer: string;
    startOdometerKm: number | null;
    charges: Record<string, string>;
  },
  now: Date = new Date(),
): Errors {
  const errors: Errors = {};
  if (!f.date) errors.date = "required";
  const start = parseApiDateTime(f.allocatedAt);
  const back = f.returnedAt ? new Date(f.returnedAt) : null;
  if (back && start && back.getTime() < start.getTime()) errors.date = "afterStart";
  else if (back && back.getTime() > now.getTime() + MAX_FUTURE_SKEW_MS) errors.date = "notFuture";
  const odo = numberOrNull(f.odometer);
  if (below(f.odometer, 0)) errors.odometer = "nonNegative";
  else if (odo !== null && f.startOdometerKm != null && odo < f.startOdometerKm) errors.odometer = "odometerBack";
  for (const [key, value] of Object.entries(f.charges)) {
    if (below(value, 0)) errors[key] = "nonNegative";
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------------------------

/** A discount: percent 0–100, or a flat amount no more than what it's taken off. */
function discountError(type: DiscountType, value: string, amount: number): string | null {
  if (isBlank(value)) return null;
  const n = numberOrNull(value);
  if (n === null || n < 0) return "nonNegative";
  if (type === "percent" && n > 100) return "percentMax";
  if (type === "flat" && n > amount) return "discountMax";
  return null;
}

/**
 * Maintenance record and its line items. Item errors use keys `item-<row>-<field>` with field
 * name / qty / price / discount; the bill discount is `discount`.
 */
export function validateMaintenance(
  f: { vehicleId: string; odometerKm: string; discountType: DiscountType; discount: string },
  items: Array<{ itemName: string; quantity: string; unitPrice: string; discountType: DiscountType; discount: string }>,
): Errors {
  const errors: Errors = {};
  if (!f.vehicleId) errors.vehicleId = "required";
  if (below(f.odometerKm, 0)) errors.odometerKm = "nonNegative";
  let subtotal = 0;
  items.forEach((item, n) => {
    if (isBlank(item.itemName)) errors[`item-${n}-name`] = "required";
    const qty = numberOrNull(item.quantity);
    if (isBlank(item.quantity) || qty === null || qty <= 0) errors[`item-${n}-qty`] = "positive";
    const price = numberOrNull(item.unitPrice);
    if (below(item.unitPrice, 0)) errors[`item-${n}-price`] = "nonNegative";
    const base = (qty ?? 0) * (price ?? 0);
    const discount = discountError(item.discountType, item.discount, base);
    if (discount) errors[`item-${n}-discount`] = discount;
    const off = numberOrNull(item.discount) ?? 0;
    subtotal += Math.max(0, base - (item.discountType === "percent" ? (base * off) / 100 : off));
  });
  const bill = discountError(f.discountType, f.discount, subtotal);
  if (bill) errors.discount = bill;
  return errors;
}

// ---------------------------------------------------------------------------------------------
// Groups, shifts, distance, share links, fuel calibration
// ---------------------------------------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Group / sub group: name unique among groups with the same parent. */
export function validateGroup(
  f: { name: string; parentId: string; isSub: boolean; inchargeEmail: string },
  groups: Array<{ id: string; name: string; parentId: string | null }>,
  selfId?: string,
): Errors {
  const errors: Errors = {};
  if (isBlank(f.name)) errors.name = "required";
  else {
    const key = normalizeName(f.name);
    const parent = f.parentId || null;
    if (groups.some((g) => g.id !== selfId && (g.parentId || null) === parent && normalizeName(g.name) === key)) {
      errors.name = "duplicateName";
    }
  }
  if (f.isSub && !f.parentId) errors.parentId = "required";
  if (!isBlank(f.inchargeEmail) && !EMAIL.test(f.inchargeEmail.trim())) errors.inchargeEmail = "email";
  return errors;
}

/** Shift: unique name, times, and at least one working day. */
export function validateShift(
  f: { name: string; from: string; to: string; days: string[] },
  shifts: Array<{ id: string; name: string }>,
  selfId?: string,
): Errors {
  const errors: Errors = {};
  if (isBlank(f.name)) errors.name = "required";
  else if (shifts.some((s) => s.id !== selfId && normalizeName(s.name) === normalizeName(f.name))) errors.name = "duplicateName";
  if (!f.from) errors.from = "required";
  if (!f.to) errors.to = "required";
  if (f.from && f.to && f.from === f.to) errors.to = "timeRange";
  if (f.days.length === 0) errors.days = "daysRequired";
  return errors;
}

/** Day-wise distance log: one entry per vehicle per day; distance must match the readings. */
export function validateDistance(
  f: { vehicleId: string; date: string; start: string; stop: string; distance: string },
  logs: Array<{ id: string; vehicleId: string; logDate: string }>,
  today: string,
  selfId?: string,
): Errors {
  const errors: Errors = {};
  if (!f.vehicleId) errors.vehicleId = "required";
  if (!f.date) errors.date = "required";
  else if (f.date > today) errors.date = "notFuture";
  else if (f.vehicleId && logs.some((l) => l.id !== selfId && l.vehicleId === f.vehicleId && l.logDate.slice(0, 10) === f.date)) {
    errors.date = "duplicateDay";
  }
  if (below(f.start, 0)) errors.start = "nonNegative";
  if (below(f.stop, 0)) errors.stop = "nonNegative";
  const s = numberOrNull(f.start);
  const e = numberOrNull(f.stop);
  if (!errors.stop && s !== null && e !== null && e < s) errors.stop = "odometerBack";
  const d = numberOrNull(f.distance);
  if (below(f.distance, 0)) errors.distance = "nonNegative";
  else if (d !== null && s !== null && e !== null && e >= s && Math.abs(d - (e - s)) > 0.5) errors.distance = "distanceMismatch";
  return errors;
}

/** Live-location share link. */
export function validateShareLink(
  f: { vehicleId: string; endDate: string; startsAt: string | null; expiresAt: string | null },
  now: Date = new Date(),
): Errors {
  const errors: Errors = {};
  if (!f.vehicleId) errors.vehicleId = "required";
  if (!f.endDate) errors.endDate = "required";
  if (f.expiresAt && f.startsAt && f.expiresAt <= f.startsAt) errors.endDate = "afterStart";
  else if (f.expiresAt && new Date(f.expiresAt).getTime() <= now.getTime()) errors.endDate = "future";
  return errors;
}

/** Fuel calibration header and its voltage → litres points (keys `v-<row>` / `l-<row>`). */
export function validateCalibration(
  f: { name: string; capacity: string; minV: string; maxV: string },
  points: Array<{ voltage: string; litres: string }>,
  others: Array<{ id: string; name: string }>,
  selfId?: string,
): Errors {
  const errors: Errors = {};
  if (isBlank(f.name)) errors.name = "required";
  else if (others.some((c) => c.id !== selfId && normalizeName(c.name) === normalizeName(f.name))) errors.name = "duplicateName";
  if (notAbove(f.capacity, 0)) errors.capacity = "positive";
  if (below(f.minV, 0)) errors.minV = "nonNegative";
  if (below(f.maxV, 0)) errors.maxV = "nonNegative";
  const lo = numberOrNull(f.minV);
  const hi = numberOrNull(f.maxV);
  if (!errors.maxV && lo !== null && hi !== null && hi <= lo) errors.maxV = "greaterThanMin";
  const seen = new Map<number, number>();
  points.forEach((p, i) => {
    const v = numberOrNull(p.voltage);
    const l = numberOrNull(p.litres);
    if (isBlank(p.voltage) || v === null) errors[`v-${i}`] = "required";
    else if (v < 0) errors[`v-${i}`] = "nonNegative";
    else if (seen.has(v)) errors[`v-${i}`] = "duplicateVoltage";
    else seen.set(v, i);
    if (isBlank(p.litres) || l === null) errors[`l-${i}`] = "required";
    else if (l < 0) errors[`l-${i}`] = "nonNegative";
  });
  if (points.length < 2) errors.points = "minPoints";
  return errors;
}

