import { describe, expect, it } from "vitest";
import type { AlertRuleRecipient } from "@/lib/graphql/alert-rules";
import { hasToRecipient, isEmail, planRecipients, toRows, validateRows, type RecipientRow } from "./recipients";

const row = (over: Partial<RecipientRow>): RecipientRow => ({ kind: "email", userId: "", email: "", cc: false, ...over });

describe("validateRows", () => {
  it("needs a user or a valid email, and no duplicates (emails ignore case)", () => {
    expect(
      validateRows([
        row({ kind: "user" }),
        row({ email: " " }),
        row({ email: "ops@" }),
        row({ email: "Ops@Example.com" }),
        row({ email: "ops@example.com", cc: true }),
        row({ kind: "user", userId: "4" }),
        row({ kind: "user", userId: "4" }),
      ]),
    ).toEqual({ 0: "userRequired", 1: "emailRequired", 2: "emailInvalid", 4: "duplicate", 6: "duplicate" });
  });

  it("accepts ordinary addresses", () => {
    expect(isEmail("fleet.manager+alerts@klever.ae")).toBe(true);
    expect(isEmail("no spaces@x.com")).toBe(false);
  });
});

describe("hasToRecipient", () => {
  it("is false when everyone is CC", () => {
    expect(hasToRecipient([row({ cc: true })])).toBe(false);
    expect(hasToRecipient([row({ cc: true }), row({})])).toBe(true);
  });
});

describe("planRecipients", () => {
  const saved: AlertRuleRecipient[] = [
    { id: "1", recipientType: "user", userId: "7", email: null, isCc: false },
    { id: "2", recipientType: "email", userId: null, email: "a@x.com", isCc: false },
    { id: "3", recipientType: "email", userId: null, email: "b@x.com", isCc: true },
    { id: "9", recipientType: "phone", userId: null, email: null },
  ];

  it("keeps unchanged rows, replaces changed ones, deletes removed ones and leaves other types alone", () => {
    const rows = toRows(saved);
    expect(rows).toHaveLength(3);
    rows[1] = { ...rows[1], cc: true }; // a@x.com becomes CC
    rows.splice(2, 1); // b@x.com removed
    rows.push(row({ kind: "user", userId: "8", cc: true }));
    expect(planRecipients(saved, rows)).toEqual({
      remove: ["2", "3"],
      add: [
        { recipientType: "email", userId: null, email: "a@x.com", isCc: true },
        { recipientType: "user", userId: "8", email: null, isCc: true },
      ],
    });
  });

  it("does nothing when nothing changed, whatever the order", () => {
    expect(planRecipients(saved, toRows(saved).reverse())).toEqual({ remove: [], add: [] });
  });

  it("applies one list to a rule that has none yet", () => {
    expect(planRecipients([], [row({ email: "a@x.com" })])).toEqual({ remove: [], add: [{ recipientType: "email", userId: null, email: "a@x.com", isCc: false }] });
  });
});
