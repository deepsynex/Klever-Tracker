/**
 * Notification rule recipients (pure part): the form's rows, validation, and the
 * delete/create plan to save them (the API has no update for a recipient).
 */
import type { AlertRuleRecipient } from "@/lib/graphql/alert-rules";

export type RecipientRow = {
  kind: "user" | "email";
  userId: string;
  email: string;
  /** Sent as CC instead of To. */
  cc: boolean;
};

export type RecipientError = "userRequired" | "emailRequired" | "emailInvalid" | "duplicate";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isEmail = (value: string) => EMAIL.test(value.trim());

export function toRows(recipients: AlertRuleRecipient[]): RecipientRow[] {
  return recipients
    .filter((r) => r.recipientType === "user" || r.recipientType === "email")
    .map((r) => ({
      kind: r.recipientType === "user" ? "user" : "email",
      userId: r.userId ?? "",
      email: r.email ?? "",
      cc: Boolean(r.isCc),
    }));
}

/** The identity of a row, for duplicate checks: the user, or the email in lower case. */
const keyOf = (r: RecipientRow) => (r.kind === "user" ? `u:${r.userId}` : `e:${r.email.trim().toLowerCase()}`);

/** Problems per row (by index); empty when every row is fine. */
export function validateRows(rows: RecipientRow[]): Record<number, RecipientError> {
  const errors: Record<number, RecipientError> = {};
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    if (r.kind === "user" && !r.userId) errors[i] = "userRequired";
    else if (r.kind === "email" && !r.email.trim()) errors[i] = "emailRequired";
    else if (r.kind === "email" && !isEmail(r.email)) errors[i] = "emailInvalid";
    else if (seen.has(keyOf(r))) errors[i] = "duplicate";
    seen.add(keyOf(r));
  });
  return errors;
}

/** Whether an email would have a "To" address: at least one recipient not marked CC. */
export const hasToRecipient = (rows: RecipientRow[]) => rows.some((r) => !r.cc);

/**
 * What to send so a rule's saved recipients become `rows`: a saved recipient for the same person
 * with the same To/CC is kept; every other saved one is deleted and every row without a match is
 * created. Matching by person (not by id) lets one list be applied to every rule of a row.
 */
export function planRecipients(
  saved: AlertRuleRecipient[],
  rows: RecipientRow[],
): { remove: string[]; add: Array<{ recipientType: "user" | "email"; userId: string | null; email: string | null; isCc: boolean }> } {
  const candidates = saved.filter((r) => r.recipientType === "user" || r.recipientType === "email");
  const kept = new Set<string>();
  const add: ReturnType<typeof planRecipients>["add"] = [];
  for (const row of rows) {
    const match = candidates.find((r) => !kept.has(r.id) && keyOf(toRows([r])[0]) === keyOf(row) && Boolean(r.isCc) === row.cc);
    if (match) {
      kept.add(match.id);
      continue;
    }
    add.push({
      recipientType: row.kind,
      userId: row.kind === "user" ? row.userId : null,
      email: row.kind === "email" ? row.email.trim() : null,
      isCc: row.cc,
    });
  }
  return { remove: candidates.filter((r) => !kept.has(r.id)).map((r) => r.id), add };
}
