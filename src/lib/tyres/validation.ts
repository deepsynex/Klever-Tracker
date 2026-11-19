/**
 * Validation for the Tyres forms, kept pure so it's unit tested. Each function returns
 * field → translation key under `validation.*`; an empty object means the form is valid.
 * Form values are the raw input strings. The API applies the same rules.
 */
import { isValidEmail } from "@/lib/account-management/validation";
import { numberOrNull } from "@/lib/vehicle-management/helpers";
import {
  isValidPhone,
  normalizeName,
  normalizePlate,
  validateLookupName,
  type Errors,
} from "@/lib/vehicle-management/validation";

const isBlank = (v: string | null | undefined) => !v || !v.trim();

/** Filled in, and not a number of 0 or more. */
const notNonNegative = (v: string) => !isBlank(v) && (numberOrNull(v) ?? -1) < 0;
/** Filled in, and not a whole number of 1 or more. */
const notPositiveWhole = (v: string) => {
  if (isBlank(v)) return false;
  const n = numberOrNull(v);
  return n === null || n < 1 || !Number.isInteger(n);
};

/** Customer: name required and unique in the company (case-insensitive); email and phone well-formed. */
export function validateCustomer(
  values: Record<string, string>,
  existing: Array<{ id: string; name: string }>,
  selfId?: string,
): Errors {
  const errors: Errors = { ...validateLookupName(values.name ?? "", existing, selfId) };
  if (!isBlank(values.email) && !isValidEmail(values.email)) errors.email = "email";
  if (!isBlank(values.contactPhone) && !isValidPhone(values.contactPhone)) errors.contactPhone = "phone";
  return errors;
}

/** Customer vehicle: customer, plate (unique) and type required; daily average km 0 or more. */
export function validateCustomerVehicle(values: Record<string, string>, otherPlates: string[]): Errors {
  const errors: Errors = {};
  for (const key of ["customerId", "plateNo", "vehicleTypeId"]) if (isBlank(values[key])) errors[key] = "required";
  if (!errors.plateNo && otherPlates.some((p) => normalizePlate(p) === normalizePlate(values.plateNo))) {
    errors.plateNo = "duplicatePlate";
  }
  if (notNonNegative(values.dailyAvgRunningKm ?? "")) errors.dailyAvgRunningKm = "nonNegative";
  return errors;
}

/** Tyre product: size and brand required; ply rating a whole number; pressure and tread depth 0 or more. */
export function validateTyreProduct(values: Record<string, string>): Errors {
  const errors: Errors = {};
  if (isBlank(values.tyreSizeId)) errors.tyreSizeId = "required";
  if (isBlank(values.tyreBrandId)) errors.tyreBrandId = "required";
  if (notPositiveWhole(values.plyRating ?? "")) errors.plyRating = "positiveWhole";
  if (notNonNegative(values.recommendedPressurePsi ?? "")) errors.recommendedPressurePsi = "nonNegative";
  if (notNonNegative(values.originalTreadDepthMm ?? "")) errors.originalTreadDepthMm = "nonNegative";
  return errors;
}

/** A recommendation code: lower-case letters, digits and underscores ("check_wheel_balance"). */
export const RECOMMENDATION_CODE = /^[a-z][a-z0-9_]*$/;

/** "Check Wheel Balance" → "check_wheel_balance": the suggested code for a new recommendation. */
export function codeFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "r_$1");
}

/**
 * Tyre recommendation: title required. A new one also needs a code that's well-formed and not
 * used yet (the code can't change after it's created).
 */
export function validateRecommendation(
  values: Record<string, string>,
  existing: Array<{ id: string; code: string }>,
  selfId?: string,
): Errors {
  const errors: Errors = {};
  if (isBlank(values.title)) errors.title = "required";
  if (!selfId) {
    const code = (values.code ?? "").trim();
    if (!code) errors.code = "required";
    else if (!RECOMMENDATION_CODE.test(code)) errors.code = "codeFormat";
    else if (existing.some((x) => normalizeName(x.code) === normalizeName(code))) errors.code = "duplicateCode";
  }
  return errors;
}

/**
 * Tyre thresholds: both depths required and within 0–40 mm (exclusive of 0), the replace depth
 * below the critical one, and the pressure tolerance a percentage above 0.
 */
export function validateTyreSettings(values: Record<string, string>): Errors {
  const errors: Errors = {};
  const depth = (key: string) => {
    const v = values[key] ?? "";
    if (isBlank(v)) errors[key] = "required";
    else if ((numberOrNull(v) ?? -1) <= 0) errors[key] = "positive";
    else if ((numberOrNull(v) ?? 0) > 40) errors[key] = "treadRange";
  };
  depth("treadCriticalMm");
  depth("treadReplaceMm");
  if (!errors.treadCriticalMm && !errors.treadReplaceMm) {
    if ((numberOrNull(values.treadReplaceMm ?? "") ?? 0) >= (numberOrNull(values.treadCriticalMm ?? "") ?? 0)) {
      errors.treadReplaceMm = "replaceBelowCritical";
    }
  }
  const pct = values.pressureTolerancePct ?? "";
  if (isBlank(pct)) errors.pressureTolerancePct = "required";
  else if ((numberOrNull(pct) ?? -1) <= 0 || (numberOrNull(pct) ?? 0) > 100) errors.pressureTolerancePct = "percent";
  return errors;
}
