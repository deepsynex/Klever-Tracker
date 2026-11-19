import { describe, expect, it } from "vitest";
import { firebaseSettings, pushSupport, sameKey } from "./push";

describe("pushSupport", () => {
  const all = { serviceWorker: true, pushManager: true, notification: true, secure: true };
  it("needs every browser feature and a secure context", () => {
    expect(pushSupport(all)).toBe(true);
    expect(pushSupport({ ...all, pushManager: false })).toBe(false); // e.g. iOS Safari outside an installed app
    expect(pushSupport({ ...all, secure: false })).toBe(false);
  });
});

describe("firebaseSettings", () => {
  const env = {
    NEXT_PUBLIC_FIREBASE_API_KEY: "key",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "tiretraker-72b58",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:123:web:abc",
    NEXT_PUBLIC_FIREBASE_VAPID_KEY: "BPub",
  };
  it("builds the Firebase options and VAPID key; the auth domain is optional", () => {
    expect(firebaseSettings(env)).toEqual({
      options: {
        apiKey: "key",
        authDomain: undefined,
        projectId: "tiretraker-72b58",
        messagingSenderId: "123",
        appId: "1:123:web:abc",
      },
      vapidKey: "BPub",
    });
  });
  it("is null while any required value is missing", () => {
    expect(firebaseSettings({ ...env, NEXT_PUBLIC_FIREBASE_VAPID_KEY: "" })).toBeNull();
    expect(firebaseSettings({ ...env, NEXT_PUBLIC_FIREBASE_APP_ID: undefined })).toBeNull();
  });
});

describe("sameKey", () => {
  it("compares application server keys byte by byte", () => {
    const key = new Uint8Array([1, 2, 3]);
    expect(sameKey(new Uint8Array([1, 2, 3]).buffer, key)).toBe(true);
    expect(sameKey(new Uint8Array([1, 2, 4]).buffer, key)).toBe(false);
    expect(sameKey(new Uint8Array([1, 2]).buffer, key)).toBe(false);
    expect(sameKey(null, key)).toBe(false);
  });
});
