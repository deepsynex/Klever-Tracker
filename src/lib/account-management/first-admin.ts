/**
 * The first admin user created with a new company (platform staff, Add account). The backend
 * emails them a welcome with a link to set their own password (A5). Pure, so it's unit tested.
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
