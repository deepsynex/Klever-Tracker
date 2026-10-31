/**
 * Validation rules for the Account Management forms, kept pure (no React) so they're unit tested.
 * Same contract as vehicle-management/validation.ts: field → translation key under `validation.*`,
 * an empty object means valid. The API stays the final authority (its field errors are shown too).
 */
import { intOrNull, numberOrNull } from "@/lib/vehicle-management/helpers";
import { isValidPhone, normalizeName, type Errors } from "@/lib/vehicle-management/validation";
import { BEHAVIOUR_WEIGHTS, type AccountForm, type BehaviourForm, type DriverForm, type UserForm } from "./forms";

export const PASSWORD_MIN = 8;
/** At most this many contacts per account (as on the reference site). */
export const MAX_CONTACTS = 3;

/**
 * Longest accepted text per field (the inputs also stop typing there). Kept under the database's
 * column sizes so a long value gets a clear message instead of a server error.
 */
export const MAX_LENGTH: Record<string, number> = {
  name: 100,
  address: 255,
  website: 255,
  industry: 100,
  city: 100,
  state: 100,
  country: 100,
  email: 255,
  mobile: 20,
  phone: 20,
  username: 50,
  password: 100,
  nationality: 60,
  employeeId: 50,
  licenceNo: 50,
  otherPermitName: 100,
  otherPermitNo: 50,
  rfidTagId: 50,
  emergencyContactName: 100,
  emergencyContactNumber: 20,
  notes: 1000,
};

const isBlank = (v: string | null | undefined) => !v || !v.trim();
const same = (a: string | null | undefined, b: string | null | undefined) => !isBlank(a) && !isBlank(b) && normalizeName(a!) === normalizeName(b!);

/** Phone numbers compared by digits, ignoring the +971 / 00971 / 0 prefix ("050 123 4567" = "+971501234567"). */
export function phoneKey(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "").replace(/^(00971|971|0)/, "");
}
const samePhone = (a: string | null | undefined, b: string | null | undefined) => phoneKey(a) !== "" && phoneKey(a) === phoneKey(b);

/** "tooLong" for each listed field longer than MAX_LENGTH allows (an earlier error on the field wins). */
function checkLengths(errors: Errors, form: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const max = MAX_LENGTH[key];
    if (max && !errors[key] && String(form[key] ?? "").trim().length > max) errors[key] = "tooLong";
  }
}

/** A "yyyy-MM-dd" date with a realistic year (catches typos like 0026 or 20266). */
export function isRealisticDate(value: string, minYear = 2000, maxYear = 2100): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return Boolean(m) && Number(m![1]) >= minYear && Number(m![1]) <= maxYear;
}
function checkDates(errors: Errors, form: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const v = String(form[key] ?? "");
    if (v && !errors[key] && !isRealisticDate(v)) errors[key] = "dateRange";
  }
}

/** Passwords need at least one letter and one digit (no special-character rule, by decision). */
export function isStrongPassword(value: string): boolean {
  return /[A-Za-z]/.test(value) && /\d/.test(value);
}

/** Whether a company has used up its limit (null limit = unlimited). */
export function limitReached(max: number | null | undefined, count: number): boolean {
  return max !== null && max !== undefined && count >= max;
}

/** name@domain.tld, no spaces. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Login names: 3–50 letters, digits, dots, dashes, underscores or @ (so an email works too). */
export function isValidUsername(value: string): boolean {
  return /^[A-Za-z0-9._@-]{3,50}$/.test(value.trim());
}

/** http(s) address, or a bare domain like "example.ae". */
export function isValidWebsite(value: string): boolean {
  const v = value.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return url.hostname.includes(".") && !/\s/.test(v);
  } catch {
    return false;
  }
}

function checkNewPassword(errors: Errors, password: string, confirm: string, field = "password", confirmField = "confirmPassword") {
  if (password.length < PASSWORD_MIN) errors[field] = "passwordMin";
  else if (password.length > MAX_LENGTH.password!) errors[field] = "tooLong";
  else if (!isStrongPassword(password)) errors[field] = "passwordWeak";
  else if (password !== confirm) errors[confirmField] = "passwordMatch";
}

function nonNegative(errors: Errors, form: Record<string, unknown>, keys: readonly string[], integer = false) {
  for (const key of keys) {
    const raw = String(form[key] ?? "");
    if (isBlank(raw)) continue;
    const n = integer ? intOrNull(raw) : numberOrNull(raw);
    if (n === null || n < 0 || (integer && !Number.isInteger(Number(raw)))) errors[key] = integer ? "wholeNumber" : "nonNegative";
  }
}

// ---------------------------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------------------------

export function validateAccount(form: AccountForm, context: { otherNames?: string[]; isPlatform?: boolean } = {}): Errors {
  const errors: Errors = {};
  for (const key of ["name", "city", "state", "country", "timezone"] as const) if (isBlank(form[key])) errors[key] = "required";
  if (!errors.name && (context.otherNames ?? []).some((n) => same(n, form.name))) errors.name = "duplicateName";
  checkLengths(errors, form, ["name", "address", "website", "industry", "city", "state", "country"]);
  if (!errors.website && !isBlank(form.website) && !isValidWebsite(form.website)) errors.website = "website";
  checkDates(errors, form, ["taxExpiresAt"]);
  // Status and the Trial box are platform-only; a company user can't fix a mismatch, so only staff are held to it.
  if (context.isPlatform && (form.status === "trial") !== form.isTrial) errors.isTrial = "trialMismatch";
  nonNegative(errors, form, ["totalCharge"]);
  nonNegative(errors, form, ["maxUsers", "maxStaff", "maxDrivers"], true);
  const lat = numberOrNull(form.locationLat);
  const lng = numberOrNull(form.locationLng);
  const hasLat = !isBlank(form.locationLat);
  const hasLng = !isBlank(form.locationLng);
  if (hasLat && (lat === null || lat < -90 || lat > 90)) errors.locationLat = "latitude";
  if (hasLng && (lng === null || lng < -180 || lng > 180)) errors.locationLng = "longitude";
  if (hasLat !== hasLng) errors[hasLat ? "locationLng" : "locationLat"] = "required";
  return errors;
}

/** A contact row (name, email and phone are all required by the API). */
export function validateContact(v: Record<string, string>): Errors {
  const errors: Errors = {};
  if (isBlank(v.name)) errors.name = "required";
  if (isBlank(v.email)) errors.email = "required";
  else if (!isValidEmail(v.email)) errors.email = "email";
  if (isBlank(v.phone)) errors.phone = "required";
  else if (!isValidPhone(v.phone)) errors.phone = "phone";
  checkLengths(errors, v, ["name", "email", "phone"]);
  return errors;
}

// ---------------------------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------------------------

export function validateUser(
  form: UserForm,
  context: { isNew: boolean; others?: Array<{ email: string; username: string }> },
): Errors {
  const errors: Errors = {};
  for (const key of ["name", "email", "username", "roleId", "status"] as const) if (isBlank(form[key])) errors[key] = "required";
  if (!errors.email && !isValidEmail(form.email)) errors.email = "email";
  if (!errors.username && !isValidUsername(form.username)) errors.username = "username";
  if (!isBlank(form.mobile) && !isValidPhone(form.mobile)) errors.mobile = "phone";
  const others = context.others ?? [];
  if (!errors.email && others.some((o) => same(o.email, form.email))) errors.email = "duplicateEmail";
  if (!errors.username && others.some((o) => same(o.username, form.username))) errors.username = "duplicateUsername";
  if (context.isNew || form.password || form.confirmPassword) {
    if (context.isNew && !form.password) errors.password = "required";
    else checkNewPassword(errors, form.password, form.confirmPassword);
  }
  checkLengths(errors, form, ["name", "email", "mobile", "username", "address"]);
  return errors;
}

// ---------------------------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------------------------

export function validateDriver(
  form: DriverForm,
  context: {
    /** The saved driver's login name ("" for a new driver or one without a login). */
    savedUsername?: string;
    /** Other drivers: usernames are unique everywhere; pass only this company's for the other fields. */
    others?: Array<{ username: string | null; employeeId: string | null; rfidTagId: string | null; licenceNo?: string | null; mobile?: string | null }>;
  } = {},
): Errors {
  const errors: Errors = {};
  if (!form.canDriveHeavy && !form.canDriveLight) errors.vehicleType = "vehicleTypeRequired";
  if (isBlank(form.name)) errors.name = "required";
  if (isBlank(form.mobile)) errors.mobile = "required";
  else if (!isValidPhone(form.mobile)) errors.mobile = "phone";
  // "Other permit": name and number go together; an expiry date or PDF needs both.
  const anyPermit = [form.otherPermitName, form.otherPermitNo, form.permitExpiresAt, form.permitPdfPath].some((v) => !isBlank(v));
  if (anyPermit && isBlank(form.otherPermitName)) errors.otherPermitName = "permitIncomplete";
  if (anyPermit && isBlank(form.otherPermitNo)) errors.otherPermitNo = "permitIncomplete";
  checkDates(errors, form, ["licenceExpiryDate", "visaExpiryDate", "permitExpiresAt"]);
  checkLengths(errors, form, ["name", "employeeId", "mobile", "address", "nationality", "licenceNo", "otherPermitName", "otherPermitNo", "rfidTagId", "emergencyContactName", "emergencyContactNumber", "notes"]);
  if (!isBlank(form.emergencyContactNumber) && !isValidPhone(form.emergencyContactNumber)) errors.emergencyContactNumber = "phone";
  nonNegative(errors, form, ["overtimeRate"]);
  const hours = numberOrNull(form.workingHoursPerDay);
  if (!isBlank(form.workingHoursPerDay) && (hours === null || hours < 0 || hours > 24)) errors.workingHoursPerDay = "hoursPerDay";

  // Driver-app login: a username needs a password the first time it's set.
  const username = form.username.trim();
  if (username && !isValidUsername(username)) errors.username = "username";
  if (!username && form.password) errors.username = "required";
  const needsPassword = username !== "" && !context.savedUsername;
  if (needsPassword && !form.password) errors.password = "required";
  else if (form.password || form.confirmPassword) checkNewPassword(errors, form.password, form.confirmPassword);

  if (form.hasTag && isBlank(form.rfidTagId)) errors.rfidTagId = "required";
  const others = context.others ?? [];
  if (!errors.username && username && others.some((o) => same(o.username, username))) errors.username = "duplicateUsername";
  if (!isBlank(form.employeeId) && others.some((o) => same(o.employeeId, form.employeeId))) errors.employeeId = "duplicateEmployeeId";
  if (form.hasTag && !errors.rfidTagId && others.some((o) => same(o.rfidTagId, form.rfidTagId))) errors.rfidTagId = "duplicateTag";
  if (!errors.licenceNo && !isBlank(form.licenceNo) && others.some((o) => same(o.licenceNo, form.licenceNo))) errors.licenceNo = "duplicateLicence";
  if (!errors.mobile && others.some((o) => samePhone(o.mobile, form.mobile))) errors.mobile = "duplicateMobile";
  return errors;
}

/**
 * Expired licence, visa or permit dates: a warning, not an error (a licence can be mid-renewal).
 * Field → translation key under `validation.*`.
 */
export function driverDateWarnings(form: Pick<DriverForm, "licenceExpiryDate" | "visaExpiryDate" | "permitExpiresAt">, today: string): Errors {
  const warnings: Errors = {};
  for (const key of ["licenceExpiryDate", "visaExpiryDate", "permitExpiresAt"] as const) {
    if (form[key] && isRealisticDate(form[key]) && form[key] < today) warnings[key] = "expiredWarning";
  }
  return warnings;
}

// ---------------------------------------------------------------------------------------------
// Role, behaviour settings, change password
// ---------------------------------------------------------------------------------------------

/** Role name required, unique and not too long; `anyAllowed`: the role may view at least one module. */
export function validateRole(name: string, others: string[], anyAllowed = true): Errors {
  const errors: Errors = {};
  if (isBlank(name)) errors.name = "required";
  else if (name.trim().length > MAX_LENGTH.name!) errors.name = "tooLong";
  else if (others.some((o) => same(o, name))) errors.name = "duplicateName";
  if (!anyAllowed) errors.permissions = "permissionsRequired";
  return errors;
}

export function validateBehaviour(form: BehaviourForm): Errors {
  const errors: Errors = {};
  nonNegative(errors, form, ["minimumMileageKm"]);
  const top = intOrNull(form.topScore);
  if (isBlank(form.topScore)) errors.topScore = "required";
  else if (top === null || top < 1 || !Number.isInteger(Number(form.topScore))) errors.topScore = "positiveWhole";
  if (form.userCustomizedScore) {
    for (const w of BEHAVIOUR_WEIGHTS) {
      const n = numberOrNull(form[w]);
      if (isBlank(form[w]) || n === null || n < 0 || n > 100) errors[w] = "percent";
    }
    const total = BEHAVIOUR_WEIGHTS.reduce((sum, w) => sum + (numberOrNull(form[w]) ?? 0), 0);
    if (!BEHAVIOUR_WEIGHTS.some((w) => errors[w]) && Math.abs(total - 100) > 0.01) errors.weightsTotal = "weightsTotal";
  }
  return errors;
}

export function validateChangePassword(v: { oldPassword: string; newPassword: string; confirmPassword: string }): Errors {
  const errors: Errors = {};
  if (!v.oldPassword) errors.oldPassword = "required";
  if (!v.newPassword) errors.newPassword = "required";
  else checkNewPassword(errors, v.newPassword, v.confirmPassword, "newPassword", "confirmPassword");
  if (!errors.newPassword && v.oldPassword && v.newPassword === v.oldPassword) errors.newPassword = "passwordSame";
  return errors;
}
