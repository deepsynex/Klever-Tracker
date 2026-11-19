import { describe, expect, it } from "vitest";
import { validateFirstAdmin } from "./first-admin";

describe("validateFirstAdmin", () => {
  const users = [{ email: "ops@acme.ae", username: "acme.admin" }];

  it("needs a name, a valid email and a valid username", () => {
    expect(validateFirstAdmin({ adminName: "", adminEmail: "", adminUsername: "" }, [])).toEqual({
      adminName: "required",
      adminEmail: "required",
      adminUsername: "required",
    });
    expect(validateFirstAdmin({ adminName: "A", adminEmail: "not-an-email", adminUsername: "a b" }, [])).toEqual({
      adminEmail: "email",
      adminUsername: "username",
    });
  });

  it("rejects an email or username another user already has (any company)", () => {
    expect(validateFirstAdmin({ adminName: "A", adminEmail: "OPS@acme.ae", adminUsername: "Acme.Admin" }, users)).toEqual({
      adminEmail: "duplicateEmail",
      adminUsername: "duplicateUsername",
    });
    expect(validateFirstAdmin({ adminName: "A", adminEmail: "new@acme.ae", adminUsername: "new@acme.ae" }, users)).toEqual({});
  });
});
