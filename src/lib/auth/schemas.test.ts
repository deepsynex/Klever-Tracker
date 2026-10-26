import { describe, expect, it } from "vitest";
import { fieldErrors, loginSchema, resetPasswordSchema } from "./schemas";

describe("loginSchema", () => {
  it("reports translation keys per field", () => {
    const result = loginSchema.safeParse({ email: "", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)).toEqual({ email: "required", password: "required" });
  });

  it("rejects malformed emails and trims whitespace", () => {
    const bad = loginSchema.safeParse({ email: "jane@", password: "x" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(fieldErrors(bad.error).email).toBe("email");

    const ok = loginSchema.safeParse({ email: "  jane@example.com ", password: "x" });
    expect(ok.success && ok.data.email).toBe("jane@example.com");
  });
});

describe("resetPasswordSchema", () => {
  const base = { token: "t", email: "jane@example.com" };

  it("requires matching passwords of at least 8 characters", () => {
    const short = resetPasswordSchema.safeParse({ ...base, password: "short", confirmPassword: "short" });
    expect(short.success).toBe(false);
    if (!short.success) expect(fieldErrors(short.error).password).toBe("passwordMin");

    const mismatch = resetPasswordSchema.safeParse({ ...base, password: "longenough1", confirmPassword: "different1" });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) expect(fieldErrors(mismatch.error).confirmPassword).toBe("passwordMatch");

    expect(resetPasswordSchema.safeParse({ ...base, password: "longenough1", confirmPassword: "longenough1" }).success).toBe(true);
  });
});
