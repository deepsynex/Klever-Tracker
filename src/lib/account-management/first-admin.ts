/**
 * The first admin user created with a new company (platform staff, Add account). They get a random
 * password nobody sees, and an email with a link to set their own. Pure, so it's unit tested.
 */
import { isValidEmail, isValidUsername } from "./validation";

export type FirstAdmin = { adminName: string; adminEmail: string; adminUsername: string };
type Errors = Record<string, string>;

export const emptyFirstAdmin = (): FirstAdmin => ({ adminName: "", adminEmail: "", adminUsername: "" });

const same = (a: string | null | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

/** Name, email and username are required; email and username are unique across every company (API rule). */
export function validateFirstAdmin(v: FirstAdmin, users: Array<{ email?: string | null; username?: string | null }>): Errors {
  const errors: Errors = {};
  if (!v.adminName.trim()) errors.adminName = "required";
  if (!v.adminEmail.trim()) errors.adminEmail = "required";
  else if (!isValidEmail(v.adminEmail)) errors.adminEmail = "email";
  else if (users.some((u) => same(u.email, v.adminEmail))) errors.adminEmail = "duplicateEmail";
  if (!v.adminUsername.trim()) errors.adminUsername = "required";
  else if (!isValidUsername(v.adminUsername)) errors.adminUsername = "username";
  else if (users.some((u) => same(u.username, v.adminUsername))) errors.adminUsername = "duplicateUsername";
  return errors;
}

const LETTERS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*-_";

/**
 * A random password (cryptographically secure) with letters, digits and symbols, so it passes the
 * API's rules. Never shown or stored by the web: the user sets their own from the emailed link.
 */
export function randomPassword(length = 24, random: (n: number) => Uint32Array = (n) => crypto.getRandomValues(new Uint32Array(n))): string {
  const all = LETTERS + DIGITS + SYMBOLS;
  const r = random(length + 3);
  const pick = (set: string, i: number) => set[r[i]! % set.length]!;
  const chars = Array.from({ length }, (_, i) => pick(all, i));
  // At least one letter, one digit and one symbol, at fixed random-chosen places.
  chars[r[length]! % length] = pick(LETTERS, length);
  chars[(r[length]! + 1) % length] = pick(DIGITS, length + 1);
  chars[(r[length]! + 2) % length] = pick(SYMBOLS, length + 2);
  return chars.join("");
}
