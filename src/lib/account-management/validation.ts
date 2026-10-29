/**
 * Validation rules for the Account Management forms, kept pure (no React) so they're unit tested.
 * Same contract as vehicle-management/validation.ts: field → translation key under `validation.*`,
 * an empty object means valid. The API stays the final authority (its field errors are shown too).
 */
import { intOrNull, numberOrNull } from "@/lib/vehicle-management/helpers";
import { isValidPhone, normalizeName, type Errors } from "@/lib/vehicle-management/validation";
import { BEHAVIOUR_WEIGHTS, type AccountForm, type BehaviourForm, type DriverForm, type UserForm } from "./forms";

export const PASSWORD_MIN = 8;

const isBlank = (v: string | null | undefined) => !v || !v.trim();
const same = (a: string | null | undefined, b: string | null | undefined) => !isBlank(a) && !isBlank(b) && normalizeName(a!) === normalizeName(b!);

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

export function validateAccount(form: AccountForm, context: { otherNames?: string[] } = {}): Errors {
  const errors: Errors = {};
  for (const key of ["name", "city", "state", "country", "timezone"] as const) if (isBlank(form[key])) errors[key] = "required";
  if (!errors.name && (context.otherNames ?? []).some((n) => same(n, form.name))) errors.name = "duplicateName";
  if (!isBlank(form.website) && !isValidWebsite(form.website)) errors.website = "website";
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
    others?: Array<{ username: string | null; employeeId: string | null; rfidTagId: string | null }>;
  } = {},
): Errors {
  const errors: Errors = {};
  if (isBlank(form.name)) errors.name = "required";
  if (isBlank(form.mobile)) errors.mobile = "required";
  else if (!isValidPhone(form.mobile)) errors.mobile = "phone";
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
  return errors;
}

// ---------------------------------------------------------------------------------------------
// Role, behaviour settings, change password
// ---------------------------------------------------------------------------------------------

export function validateRole(name: string, others: string[]): Errors {
  if (isBlank(name)) return { name: "required" };
  return others.some((o) => same(o, name)) ? { name: "duplicateName" } : {};
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
