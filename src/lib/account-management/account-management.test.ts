import { describe, expect, it } from "vitest";
import type { AmDriver, Company } from "@/lib/graphql/account-management";
import { driverExportSheet, driverSampleSheet, parseDriverSheet } from "./driver-sheet";
import {
  accountFormToVariables,
  behaviourFormToVariables,
  behaviourToForm,
  companyToForm,
  driverFormToVariables,
  driverToForm,
  emptyAccountForm,
  userFormToVariables,
  userToForm,
} from "./forms";
import {
  isValidWebsite,
  validateAccount,
  validateBehaviour,
  validateChangePassword,
  validateContact,
  validateDriver,
  validateRole,
  validateUser,
} from "./validation";

const account = () => ({ ...emptyAccountForm(), name: "Acme", city: "Dubai", state: "Dubai" });

describe("account", () => {
  it("requires the address basics and rejects a duplicate name", () => {
    expect(validateAccount({ ...emptyAccountForm(), country: "" })).toEqual({
      name: "required",
      city: "required",
      state: "required",
      country: "required",
    });
    expect(validateAccount(account(), { otherNames: [" ACME "] })).toEqual({ name: "duplicateName" });
  });

  it("checks website, limits and the map pin", () => {
    expect(isValidWebsite("klever.ae")).toBe(true);
    expect(isValidWebsite("https://klever.ae/x")).toBe(true);
    expect(isValidWebsite("not a site")).toBe(false);
    expect(validateAccount({ ...account(), website: "nope", maxUsers: "2.5", totalCharge: "-1" })).toEqual({
      website: "website",
      maxUsers: "wholeNumber",
      totalCharge: "nonNegative",
    });
    expect(validateAccount({ ...account(), locationLat: "91", locationLng: "" })).toEqual({ locationLat: "latitude", locationLng: "required" });
  });

  it("sends the pin as location and hides platform-only fields from company users", () => {
    const form = { ...account(), locationLat: "25.2", locationLng: "55.27", maxUsers: "10", isTrial: true };
    const platform = accountFormToVariables(form, { isPlatform: true });
    expect(platform).toMatchObject({ name: "Acme", location: { lat: 25.2, lng: 55.27 }, maxUsers: 10, isTrial: true, accountType: "customer" });
    expect(platform).not.toHaveProperty("locationLat");
    const company = accountFormToVariables(form, { isPlatform: false });
    for (const key of ["maxUsers", "isTrial", "accountType", "maxStaff", "maxDrivers", "status"]) expect(company).not.toHaveProperty(key);
    expect(accountFormToVariables(account(), { isPlatform: true }).location).toBeNull();
  });

  it("round-trips a saved company", () => {
    const c = { name: "Acme", city: "Dubai", taxExpiresAt: "2027-01-01 00:00:00", maxUsers: 5, locationLat: 25, locationLng: 55, isTrial: true } as Company;
    const form = companyToForm(c);
    expect(form).toMatchObject({ name: "Acme", taxExpiresAt: "2027-01-01", maxUsers: "5", locationLat: "25", isTrial: true, website: "" });
  });

  it("validates contact rows", () => {
    expect(validateContact({ name: "", email: "x", phone: "12" })).toEqual({ name: "required", email: "email", phone: "phone" });
    expect(validateContact({ name: "Ali", email: "ali@acme.ae", phone: "+971 50 123 4567" })).toEqual({});
  });
});

describe("user", () => {
  const user = () => ({ ...userToForm(null), name: "Jane", email: "Jane@Acme.ae", username: "jane", roleId: "11" });

  it("needs a password only when creating, and checks it", () => {
    expect(validateUser(user(), { isNew: true })).toEqual({ password: "required" });
    expect(validateUser({ ...user(), password: "short", confirmPassword: "short" }, { isNew: true })).toEqual({ password: "passwordMin" });
    expect(validateUser({ ...user(), password: "longenough", confirmPassword: "different" }, { isNew: true })).toEqual({
      confirmPassword: "passwordMatch",
    });
    expect(validateUser(user(), { isNew: false })).toEqual({});
  });

  it("rejects duplicates and bad formats", () => {
    const others = [{ email: "jane@acme.ae", username: "JANE" }];
    expect(validateUser(user(), { isNew: false, others })).toEqual({ email: "duplicateEmail", username: "duplicateUsername" });
    expect(validateUser({ ...user(), email: "jane@", username: "j a", mobile: "abc" }, { isNew: false })).toEqual({
      email: "email",
      username: "username",
      mobile: "phone",
    });
  });

  it("sends the password only when typed and lower-cases the email", () => {
    expect(userFormToVariables(user())).not.toHaveProperty("password");
    expect(userFormToVariables({ ...user(), password: "secret123" })).toMatchObject({ password: "secret123", email: "jane@acme.ae", isAdmin: false });
  });
});

describe("driver", () => {
  const driver = () => ({ ...driverToForm(null), name: "Ali", mobile: "+971501234567" });

  it("requires a password when a login is first set", () => {
    expect(validateDriver({ ...driver(), username: "ali" })).toEqual({ password: "required" });
    expect(validateDriver({ ...driver(), username: "ali" }, { savedUsername: "ali" })).toEqual({});
    expect(validateDriver({ ...driver(), password: "secret123", confirmPassword: "secret123" })).toEqual({ username: "required" });
  });

  it("checks the tag, hours and duplicates", () => {
    expect(validateDriver({ ...driver(), hasTag: true, workingHoursPerDay: "25" })).toEqual({ rfidTagId: "required", workingHoursPerDay: "hoursPerDay" });
    const others = [{ username: "ALI", employeeId: "e1", rfidTagId: "TAG1" }];
    expect(validateDriver({ ...driver(), username: "ali", password: "secret123", confirmPassword: "secret123", employeeId: "E1", hasTag: true, rfidTagId: "tag1" }, { others })).toEqual({
      username: "duplicateUsername",
      employeeId: "duplicateEmployeeId",
      rfidTagId: "duplicateTag",
    });
  });

  it("clears the tag when unticked and omits an empty password", () => {
    const vars = driverFormToVariables({ ...driver(), rfidTagId: "TAG1", hasTag: false, canDriveHeavy: true });
    expect(vars).toMatchObject({ rfidTagId: null, canDriveHeavy: true, canDriveLight: false, employmentType: "permanent" });
    expect(vars).not.toHaveProperty("password");
    expect(driverToForm({ rfidTagId: "T", employmentType: null } as AmDriver)).toMatchObject({ hasTag: true, employmentType: "" });
  });
});

describe("roles, behaviour and password", () => {
  it("validates role names", () => {
    expect(validateRole(" ", [])).toEqual({ name: "required" });
    expect(validateRole("admin", ["Admin"])).toEqual({ name: "duplicateName" });
  });

  it("defaults and sends weights only when customised", () => {
    const form = behaviourToForm(null);
    expect(form).toMatchObject({ minimumMileageKm: "20", topScore: "5", weightSpeeding: "20" });
    expect(behaviourFormToVariables(form)).not.toHaveProperty("weightSpeeding");
    expect(behaviourFormToVariables({ ...form, userCustomizedScore: true })).toMatchObject({ weightSpeeding: 20, topScore: 5 });
    expect(validateBehaviour({ ...form, topScore: "0", userCustomizedScore: true, weightSeatbelt: "120" })).toEqual({
      topScore: "positiveWhole",
      weightSeatbelt: "percent",
    });
  });

  it("checks a password change", () => {
    expect(validateChangePassword({ oldPassword: "", newPassword: "", confirmPassword: "" })).toEqual({ oldPassword: "required", newPassword: "required" });
    expect(validateChangePassword({ oldPassword: "samesame1", newPassword: "samesame1", confirmPassword: "samesame1" })).toEqual({ newPassword: "passwordSame" });
    expect(validateChangePassword({ oldPassword: "a", newPassword: "newpass123", confirmPassword: "newpass12" })).toEqual({ confirmPassword: "passwordMatch" });
  });
});

describe("driver sheet", () => {
  it("parses the sample back into driver variables", () => {
    const rows = parseDriverSheet(driverSampleSheet());
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({
      rowNumber: 2,
      errors: {},
      variables: { name: "Ahmed Khan", licenceExpiryDate: "2027-12-31", employmentType: "permanent", canDriveHeavy: false, workingHoursPerDay: 8 },
    });
  });

  it("matches headers loosely, skips empty rows and reports problems per row", () => {
    const rows = parseDriverSheet([
      ["mobile number", "NAME", "License Expiry Date", "Heavy Vehicle", "Employment Type"],
      ["", "", "", "", ""],
      ["12", "", "31/02/2027", "maybe", "contract"],
      ["0501234567", "Sara", new Date("2028-05-01T00:00:00Z"), true, "Temporary"],
    ]);
    expect(rows).toEqual([
      { rowNumber: 3, name: "", variables: { mobile: "12" }, errors: { name: "required", mobile: "phone", licenceExpiryDate: "date", canDriveHeavy: "yesNo" , employmentType: "employmentType"} },
      {
        rowNumber: 4,
        name: "Sara",
        variables: { mobile: "0501234567", name: "Sara", licenceExpiryDate: "2028-05-01", canDriveHeavy: true, employmentType: "temporary" },
        errors: {},
      },
    ]);
  });

  it("rejects a sheet without the required columns, and exports", () => {
    expect(parseDriverSheet([["Name"], ["Ali"]])).toBeNull();
    const out = driverExportSheet([{ name: "Ali", mobile: "1", canDriveHeavy: true, licenceExpiryDate: "2027-01-01 00:00:00", employmentType: "permanent" } as AmDriver]);
    expect(out[1]).toEqual(expect.arrayContaining(["Ali", "Yes", "2027-01-01", "Permanent"]));
  });
});
