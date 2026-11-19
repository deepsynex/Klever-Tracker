import { describe, expect, it } from "vitest";
import { randomPassword, validateFirstAdmin } from "./first-admin";
import { isStrongPassword, PASSWORD_MIN } from "./validation";

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

describe("randomPassword", () => {
  it("is long, passes the password rules and differs each time", () => {
    const a = randomPassword();
    const b = randomPassword();
    expect(a).toHaveLength(24);
    expect(a.length).toBeGreaterThanOrEqual(PASSWORD_MIN);
    expect(isStrongPassword(a)).toBe(true);
    expect(/[!@#$%^&*\-_]/.test(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("always has a letter, a digit and a symbol, even from an unlucky random source", () => {
    const zeros = (n: number) => new Uint32Array(n);
    const p = randomPassword(12, zeros);
    expect(isStrongPassword(p)).toBe(true);
    expect(/[!@#$%^&*\-_]/.test(p)).toBe(true);
  });
});
