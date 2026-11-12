"use client";

import { useEffect } from "react";
import { healPushSubscription } from "@/lib/notifications/push";

/**
 * Re-sends this browser's push subscription to the server once per load (an idempotent upsert),
 * so a rotated or expired one heals. Never asks for permission. Renders nothing: mount it once in
 * the signed-in shell.
 */
export function PushHeal() {
  useEffect(() => {
    void healPushSubscription();
    // The service worker reports a browser-side rotation; re-register right away.
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === "push-subscription-changed") void healPushSubscription();
    };
    if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}
