"use client";

import { gqlRequest } from "@/lib/graphql/client";
import { isMissingFromApi } from "@/lib/map-settings";
import { REGISTER_PUSH_SUBSCRIPTION, REMOVE_PUSH_SUBSCRIPTION, urlBase64ToUint8Array, WEB_PUSH_PUBLIC_KEY } from "./api";

/**
 * Browser push (Web Push with VAPID, backend G5). Separate from the live WebSocket: this reaches
 * the user when the tab is in the background or closed. Permission is only ever asked on a click.
 */

export const SW_URL = "/sw.js";

export type PushState =
  | "unsupported" // no service worker / PushManager / Notification (e.g. iOS Safari outside an installed app)
  | "denied" // the user blocked notifications for this site
  | "backend" // the server doesn't support push subscriptions yet
  | "off"
  | "on";

/** What the browser offers, from plain feature flags so it can be unit-tested. */
export function pushSupport(env: { serviceWorker: boolean; pushManager: boolean; notification: boolean; secure: boolean }): boolean {
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

export function permission(): NotificationPermission | "unsupported" {
  return isPushSupported() ? Notification.permission : "unsupported";
}

/** The fields registerPushSubscription takes, from PushSubscription.toJSON(). Null if incomplete. */
export function subscriptionVariables(
  json: { endpoint?: string | null; keys?: Record<string, string> | null },
  userAgent: string | null,
): { endpoint: string; p256dh: string; auth: string; userAgent: string | null } | null {
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth, userAgent: userAgent ? userAgent.slice(0, 255) : null };
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  return existing ?? navigator.serviceWorker.register(SW_URL, { scope: "/" });
}

async function existingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  return reg ? reg.pushManager.getSubscription() : null;
}

async function sendToServer(sub: PushSubscription): Promise<void> {
  const vars = subscriptionVariables(sub.toJSON(), navigator.userAgent);
  if (!vars) throw new Error("Incomplete push subscription");
  await gqlRequest(REGISTER_PUSH_SUBSCRIPTION, vars);
}

/**
 * Whether the server supports push subscriptions: false only when the operation is missing from
 * the API (backend G5 not live yet). Other errors are thrown.
 */
export async function serverSupportsPush(): Promise<boolean> {
  try {
    await gqlRequest<{ webPushPublicKey: string }>(WEB_PUSH_PUBLIC_KEY);
    return true;
  } catch (err) {
    if (isMissingFromApi(err)) return false;
    throw err;
  }
}

/** Current state for the switch, without asking for permission. */
export async function currentPushState(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (!(await serverSupportsPush())) return "backend";
  return (await existingSubscription()) ? "on" : "off";
}

/** Turn push on: asks for permission (call only from a click), subscribes and tells the server. */
export async function enablePush(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  const result = await Notification.requestPermission();
  if (result !== "granted") return result === "denied" ? "denied" : "off";
  const { webPushPublicKey } = await gqlRequest<{ webPushPublicKey: string }>(WEB_PUSH_PUBLIC_KEY);
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(webPushPublicKey) }));
  await sendToServer(sub);
  return "on";
}

/** Turn push off: removes it on the server, then in the browser. */
export async function disablePush(): Promise<PushState> {
  const sub = await existingSubscription();
  if (sub) {
    await gqlRequest(REMOVE_PUSH_SUBSCRIPTION, { endpoint: sub.endpoint }).catch((err: unknown) => {
      // A missing operation or an already-removed row shouldn't keep the browser subscribed.
      if (!isMissingFromApi(err)) console.warn("[push] remove on server failed", err);
    });
    await sub.unsubscribe();
  }
  return "off";
}

/**
 * On app load: when permission is granted and the browser still has a subscription, send it to
 * the server again (an upsert), so a rotated or server-side-expired one heals. Silent; never asks.
 */
export async function healPushSubscription(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== "granted") return;
  const sub = await existingSubscription();
  if (!sub) return;
  try {
    await sendToServer(sub);
  } catch (err) {
    if (!isMissingFromApi(err)) console.warn("[push] re-register failed", err);
  }
}
