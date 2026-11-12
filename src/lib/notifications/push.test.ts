import { describe, expect, it } from "vitest";
import { pushSupport, subscriptionVariables } from "./push";

describe("pushSupport", () => {
  const all = { serviceWorker: true, pushManager: true, notification: true, secure: true };
  it("needs every browser feature and a secure context", () => {
    expect(pushSupport(all)).toBe(true);
    expect(pushSupport({ ...all, pushManager: false })).toBe(false); // e.g. iOS Safari outside an installed app
    expect(pushSupport({ ...all, secure: false })).toBe(false);
  });
});

describe("subscriptionVariables", () => {
  it("maps PushSubscription.toJSON() to the mutation's variables", () => {
    expect(subscriptionVariables({ endpoint: "https://push/x", keys: { p256dh: "P", auth: "A" } }, "Chrome")).toEqual({
      endpoint: "https://push/x",
      p256dh: "P",
      auth: "A",
      userAgent: "Chrome",
    });
  });

  it("rejects an incomplete subscription and trims a long user agent", () => {
    expect(subscriptionVariables({ endpoint: "https://push/x", keys: { p256dh: "P" } }, null)).toBeNull();
    expect(subscriptionVariables({ endpoint: "e", keys: { p256dh: "P", auth: "A" } }, "x".repeat(400))?.userAgent).toHaveLength(255);
  });
});
