import { describe, expect, it } from "vitest";
import { mayRedirectToLogin } from "./session-config";

const headers = (names: string[]) => ({ has: (n: string) => names.includes(n.toLowerCase()) });

describe("mayRedirectToLogin", () => {
  it("redirects page loads", () => {
    expect(mayRedirectToLogin("GET", headers([]))).toBe(true);
    expect(mayRedirectToLogin("HEAD", headers([]))).toBe(true);
  });

  it("lets Server Actions (Log out) through, even when the session has already ended", () => {
    expect(mayRedirectToLogin("POST", headers(["next-action"]))).toBe(false);
    expect(mayRedirectToLogin("GET", headers(["next-action"]))).toBe(false);
  });

  it("never redirects other writes", () => {
    expect(mayRedirectToLogin("POST", headers([]))).toBe(false);
  });
});
