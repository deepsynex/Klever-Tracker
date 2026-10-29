/**
 * Account Management form ↔ API mapping (pure, so it's unit-tested). Each form keeps raw input
 * strings; a field spec says how each one becomes a mutation variable. `notNull` columns are
 * omitted (not sent as null) when left empty, so clearing them can't break the row.
 */
import type { AmDriver, Company, DriverBehaviourSetting, User } from "@/lib/graphql/account-management";
import { dateInputValue, intOrNull, numberOrNull, numText, textOrNull } from "@/lib/vehicle-management/helpers";

type Kind = "text" | "id" | "int" | "float" | "date";
type FieldSpec = { kind: Kind; notNull?: boolean };

function toForm<K extends string>(spec: Record<K, FieldSpec>, row: Record<string, unknown> | null): Record<K, string> {
  return Object.fromEntries(
    (Object.entries(spec) as Array<[K, FieldSpec]>).map(([key, { kind }]) => {
      const raw = row?.[key];
      if (raw === null || raw === undefined) return [key, ""];
      if (kind === "date") return [key, dateInputValue(String(raw))];
      if (kind === "int" || kind === "float") return [key, numText(raw as number)];
      return [key, String(raw)];
    }),
  ) as Record<K, string>;
}

function toVariables<K extends string>(spec: Record<K, FieldSpec>, form: NoInfer<Record<K, string>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, { kind, notNull }] of Object.entries(spec) as Array<[K, FieldSpec]>) {
    const raw = form[key];
    const value = kind === "int" ? intOrNull(raw) : kind === "float" ? numberOrNull(raw) : textOrNull(raw);
    if (value === null && notNull) continue;
    out[key] = value;
  }
  return out;
}

export const ACCOUNT_TYPES = ["customer", "distributor"] as const;
/** Company status: only these three are allowed (DB constraint, confirmed by the backend 2026-10-29). */
export const COMPANY_STATUSES = ["active", "trial", "suspended"] as const;
export const PAYMENT_MODES = ["yearly", "half_yearly", "quarterly", "monthly"] as const;
export const EMPLOYMENT_TYPES = ["permanent", "temporary"] as const;
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

// ---------------------------------------------------------------------------------------------
// Account (Company)
// ---------------------------------------------------------------------------------------------

const COMPANY_FIELDS = {
  name: { kind: "text", notNull: true },
  address: { kind: "text" },
  city: { kind: "text", notNull: true },
  state: { kind: "text", notNull: true },
  country: { kind: "text", notNull: true },
  timezone: { kind: "text", notNull: true },
  status: { kind: "text", notNull: true },
  website: { kind: "text" },
  industry: { kind: "text" },
  logoPath: { kind: "text" },
  paymentMode: { kind: "text" },
  totalCharge: { kind: "float" },
  taxExpiresAt: { kind: "date" },
  invoicePath: { kind: "text" },
  accountType: { kind: "text", notNull: true },
  maxUsers: { kind: "int" },
  maxStaff: { kind: "int" },
  maxDrivers: { kind: "int" },
  locationLat: { kind: "float" },
  locationLng: { kind: "float" },
} satisfies Record<string, FieldSpec>;

/**
 * Fields only platform staff see and send (the reference site hides them from company users;
 * status is the subscription state, so a company can't change its own).
 */
export const PLATFORM_ONLY_ACCOUNT_FIELDS = ["accountType", "maxUsers", "maxStaff", "maxDrivers", "isTrial", "status"] as const;

export type AccountForm = Record<keyof typeof COMPANY_FIELDS, string> & {
  isTrial: boolean;
  tripCloseOnBarcode: boolean;
  offlineAlertsEnabled: boolean;
};

export function emptyAccountForm(): AccountForm {
  return {
    ...toForm(COMPANY_FIELDS, null),
    country: "United Arab Emirates",
    timezone: "Asia/Dubai",
    status: "active",
    accountType: "customer",
    paymentMode: "yearly",
    isTrial: false,
    tripCloseOnBarcode: false,
    offlineAlertsEnabled: false,
  };
}

export function companyToForm(c: Company): AccountForm {
  return {
    ...toForm(COMPANY_FIELDS, c),
    isTrial: c.isTrial,
    tripCloseOnBarcode: c.tripCloseOnBarcode,
    offlineAlertsEnabled: c.offlineAlertsEnabled,
  };
}

/**
 * Form → createCompany / updateCompany variables. The map pin becomes `location` (both
 * coordinates or neither). Company users don't send the platform-only fields.
 */
export function accountFormToVariables(form: AccountForm, { isPlatform }: { isPlatform: boolean }): Record<string, unknown> {
  const { locationLat, locationLng, ...rest } = toVariables(COMPANY_FIELDS, form);
  const out: Record<string, unknown> = {
    ...rest,
    tripCloseOnBarcode: form.tripCloseOnBarcode,
    offlineAlertsEnabled: form.offlineAlertsEnabled,
    isTrial: form.isTrial,
  };
  const lat = locationLat as number | null;
  const lng = locationLng as number | null;
  out.location = lat !== null && lng !== null ? { lat, lng } : null;
  if (!isPlatform) for (const key of PLATFORM_ONLY_ACCOUNT_FIELDS) delete out[key];
  return out;
}

// ---------------------------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------------------------

const USER_FIELDS = {
  name: { kind: "text", notNull: true },
  mobile: { kind: "text" },
  email: { kind: "text", notNull: true },
  departmentId: { kind: "id" },
  address: { kind: "text" },
  username: { kind: "text", notNull: true },
  status: { kind: "text", notNull: true },
  roleId: { kind: "id", notNull: true },
  photoPath: { kind: "text" },
} satisfies Record<string, FieldSpec>;

export type UserForm = Record<keyof typeof USER_FIELDS, string> & {
  isAdmin: boolean;
  password: string;
  confirmPassword: string;
};

export function userToForm(u: User | null): UserForm {
  return {
    ...toForm(USER_FIELDS, u),
    status: u?.status ?? "active",
    isAdmin: u?.isAdmin ?? false,
    password: "",
    confirmPassword: "",
  };
}

/** Form → createUser / updateUser variables. The password is only sent when one was typed. */
export function userFormToVariables(form: UserForm): Record<string, unknown> {
  const out: Record<string, unknown> = { ...toVariables(USER_FIELDS, form), isAdmin: form.isAdmin };
  if (out.email) out.email = String(out.email).toLowerCase();
  if (form.password) out.password = form.password;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------------------------

const DRIVER_FIELDS = {
  name: { kind: "text", notNull: true },
  employeeId: { kind: "text" },
  mobile: { kind: "text", notNull: true },
  address: { kind: "text" },
  nationality: { kind: "text" },
  photoPath: { kind: "text" },
  username: { kind: "text" },
  employmentType: { kind: "text" },
  visaExpiryDate: { kind: "date" },
  workingHoursPerDay: { kind: "float" },
  overtimeRate: { kind: "float" },
  licenceNo: { kind: "text" },
  licenceExpiryDate: { kind: "date" },
  otherPermitName: { kind: "text" },
  otherPermitNo: { kind: "text" },
  permitExpiresAt: { kind: "date" },
  permitPdfPath: { kind: "text" },
  rfidTagId: { kind: "text" },
  emergencyContactName: { kind: "text" },
  emergencyContactNumber: { kind: "text" },
  bloodGroup: { kind: "text" },
  notes: { kind: "text" },
  status: { kind: "text", notNull: true },
} satisfies Record<string, FieldSpec>;

export type DriverForm = Record<keyof typeof DRIVER_FIELDS, string> & {
  canDriveHeavy: boolean;
  canDriveLight: boolean;
  hasTag: boolean;
  password: string;
  confirmPassword: string;
};

export function driverToForm(d: AmDriver | null): DriverForm {
  return {
    ...toForm(DRIVER_FIELDS, d),
    status: d?.status ?? "active",
    employmentType: d ? (d.employmentType ?? "") : "permanent",
    canDriveHeavy: d?.canDriveHeavy ?? false,
    canDriveLight: d?.canDriveLight ?? false,
    hasTag: Boolean(d?.rfidTagId),
    password: "",
    confirmPassword: "",
  };
}

/** Form → createDriver / updateDriver variables. Unticking "Tag Id" clears the tag. */
export function driverFormToVariables(form: DriverForm): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...toVariables(DRIVER_FIELDS, form),
    canDriveHeavy: form.canDriveHeavy,
    canDriveLight: form.canDriveLight,
  };
  if (!form.hasTag) out.rfidTagId = null;
  if (form.password) out.password = form.password;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Driver behaviour settings
// ---------------------------------------------------------------------------------------------

/** The five score weights the reference site shows (the API's RPM weight is left untouched). */
export const BEHAVIOUR_WEIGHTS = [
  "weightHarshAcceleration",
  "weightHarshBraking",
  "weightExcessiveIdling",
  "weightSpeeding",
  "weightSeatbelt",
] as const;
export type BehaviourWeight = (typeof BEHAVIOUR_WEIGHTS)[number];

export type BehaviourForm = {
  minimumMileageKm: string;
  topScore: string;
  displayAbsoluteValue: boolean;
  userCustomizedScore: boolean;
} & Record<BehaviourWeight, string>;

export function behaviourToForm(s: DriverBehaviourSetting | null): BehaviourForm {
  return {
    minimumMileageKm: s ? numText(s.minimumMileageKm) : "20",
    topScore: s ? numText(s.topScore) : "5",
    displayAbsoluteValue: s?.displayAbsoluteValue ?? false,
    userCustomizedScore: s?.userCustomizedScore ?? false,
    ...(Object.fromEntries(BEHAVIOUR_WEIGHTS.map((w) => [w, s ? numText(s[w]) || "0" : "20"])) as Record<BehaviourWeight, string>),
  };
}

/** Form → variables. With customised scoring off the weights aren't in effect, so they aren't sent. */
export function behaviourFormToVariables(form: BehaviourForm): Record<string, unknown> {
  const out: Record<string, unknown> = {
    minimumMileageKm: numberOrNull(form.minimumMileageKm),
    displayAbsoluteValue: form.displayAbsoluteValue,
    userCustomizedScore: form.userCustomizedScore,
  };
  const top = intOrNull(form.topScore);
  if (top !== null) out.topScore = top;
  if (form.userCustomizedScore) for (const w of BEHAVIOUR_WEIGHTS) out[w] = numberOrNull(form[w]) ?? 0;
  return out;
}
