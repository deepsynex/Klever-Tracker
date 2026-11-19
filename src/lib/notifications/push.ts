"use client";

import type { FirebaseOptions } from "firebase/app";
import { gqlRequest } from "@/lib/graphql/client";
import { REGISTER_PUSH_TOKEN, REMOVE_PUSH_TOKEN, urlBase64ToUint8Array } from "./api";

/**
 * Browser push through Firebase Cloud Messaging (backend G5, API Doc §6.22). Separate from the live
 * WebSocket: this reaches the user when the tab is in the background or closed. Permission is only
 * ever asked on a click. The app's own service worker (/sw.js) receives the pushes and shows them;
 * Firebase only issues the token the backend sends them to.
 */

export const SW_URL = "/sw.js";
/** This browser's current FCM token, so logout and a token change can tell the server. */
export const PUSH_TOKEN_KEY = "kt.push.token";

export type PushState =
  | "unsupported" // no service worker / PushManager / Notification (e.g. iOS Safari outside an installed app)
  | "setup" // the site has no Firebase settings yet (NEXT_PUBLIC_FIREBASE_*)
  | "denied" // the user blocked notifications for this site
  | "off"
  | "on";

export type FirebaseSettings = { options: FirebaseOptions; vapidKey: string };

/** The Firebase web settings from the environment, or null while any of them is missing. */
export function firebaseSettings(env: Record<string, string | undefined>): FirebaseSettings | null {
  const options: FirebaseOptions = {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || undefined,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const vapidKey = env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!options.apiKey || !options.projectId || !options.messagingSenderId || !options.appId || !vapidKey) return null;
  return { options, vapidKey };
}

// Read one by one: Next.js only inlines NEXT_PUBLIC_* values written out in full.
const SETTINGS = firebaseSettings({
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
});

/** What the browser offers, from plain feature flags so it can be unit-tested. */
export function pushSupport(env: {
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  secure: boolean;
}): boolean {
  return env.serviceWorker && env.pushManager && env.notification && env.secure;
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return pushSupport({
    serviceWorker: "serviceWorker" in navigator,
    pushManager: "PushManager" in window,
    notification: "Notification" in window,
    secure: window.isSecureContext,
  });
}

/** Whether two application server keys are the same bytes (a subscription made with another key can't be reused). */
export function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
}

/** This browser's FCM token while push is on here (sent with sign-out so the server drops it). */
export function storedToken(): string | null {
  try {
    return localStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(PUSH_TOKEN_KEY, token);
    else localStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {
    // Storage blocked: the token is fetched again next time.
  }
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  return existing ?? navigator.serviceWorker.register(SW_URL, { scope: "/" });
}

/** Firebase, loaded on first use. */
async function firebase() {
  const [{ initializeApp, getApps }, fm] = await Promise.all([import("firebase/app"), import("firebase/messaging")]);
  return { initializeApp, getApps, ...fm };
}

async function messaging() {
  if (!SETTINGS) throw new Error("Firebase isn't configured");
  const { initializeApp, getApps, getMessaging } = await firebase();
  const app = getApps()[0] ?? initializeApp(SETTINGS.options);
  return getMessaging(app);
}

/**
 * Gets this browser's FCM token (Firebase reuses it until it changes) and registers it with the
 * server. Registering again is harmless, and a token from a previous login moves to this user.
 */
async function registerToken(): Promise<void> {
  if (!SETTINGS) return;
  const reg = await registration();
  await navigator.serviceWorker.ready;
  // A subscription left from the old Web Push setup uses another key: Firebase can't reuse it.
  const old = await reg.pushManager.getSubscription();
  if (old && !sameKey(old.options.applicationServerKey, urlBase64ToUint8Array(SETTINGS.vapidKey))) {
    await old.unsubscribe();
  }
  const { getToken } = await firebase();
  const token = await getToken(await messaging(), { vapidKey: SETTINGS.vapidKey, serviceWorkerRegistration: reg });
  await gqlRequest(REGISTER_PUSH_TOKEN, { token, userAgent: navigator.userAgent.slice(0, 255) });
  storeToken(token);
}

async function canUse(): Promise<PushState | null> {
  if (!isPushSupported()) return "unsupported";
  if (!SETTINGS) return "setup";
  const { isSupported } = await firebase();
  if (!(await isSupported().catch(() => false))) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return null;
}

/** Current state for the switch, without asking for permission. */
export async function currentPushState(): Promise<PushState> {
  const blocked = await canUse();
  if (blocked) return blocked;
  return Notification.permission === "granted" && storedToken() ? "on" : "off";
}

/** Turn push on: asks for permission (call only from a click), gets the token and tells the server. */
export async function enablePush(): Promise<PushState> {
  const blocked = await canUse();
  if (blocked) return blocked;
  const result = await Notification.requestPermission();
  if (result !== "granted") return result === "denied" ? "denied" : "off";
  await registerToken();
  return "on";
}

/** Turn push off: removes the token on the server, then in Firebase and the browser. */
export async function disablePush(): Promise<PushState> {
  const token = storedToken();
  if (token) {
    await gqlRequest(REMOVE_PUSH_TOKEN, { token }).catch((err: unknown) => {
      // An already-removed token shouldn't keep the browser subscribed.
      console.warn("[push] remove on server failed", err);
    });
  }
  if (SETTINGS) {
    const { deleteToken } = await firebase();
    await deleteToken(await messaging()).catch(() => undefined);
  }
  storeToken(null);
  return "off";
}

/**
 * On every signed-in load (so after each login too): while push is on in this browser, register
 * the token again. That keeps a token Firebase has changed up to date, and moves this browser to
 * whoever is signed in now. Silent; never asks.
 */
export async function healPushSubscription(): Promise<void> {
  // Permission was blocked or reset in the browser's settings since push was turned on: the
  // browser can't show pushes any more, so stop the server sending them here.
  if (isPushSupported() && Notification.permission !== "granted" && storedToken()) {
    await disablePush().catch(() => undefined);
    return;
  }
  if (!isPushSupported() || Notification.permission !== "granted" || !storedToken() || (await canUse())) return;
  try {
    await registerToken();
  } catch (err) {
    console.warn("[push] re-register failed", err);
  }
}
