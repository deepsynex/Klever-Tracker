/*
 * Klever Tracker service worker: browser push notifications only (no offline caching).
 * Payload from the backend (backend-requests/geofencing-realtime.md, G5):
 *   { title, body, url: "/en/live?focus=<vehicleId>", tag: "alert-<alertEventId>", notificationId }
 * Plain JS, served as-is from /sw.js (no bundler).
 */

const DEFAULT_URL = "/en/live";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      // Not JSON: show the text as the body.
      payload = { body: event.data.text() };
    }
  }
  const title = payload.title || "Klever Tracker";
  const options = {
    body: payload.body || "",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    // Same tag = the browser replaces instead of stacking a duplicate for the same alert.
    tag: payload.tag || undefined,
    renotify: false,
    data: { url: payload.url || DEFAULT_URL, notificationId: payload.notificationId || null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || DEFAULT_URL, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin);
      if (tab) {
        await tab.focus();
        if ("navigate" in tab) return tab.navigate(target);
        return undefined;
      }
      return self.clients.openWindow(target);
    })(),
  );
});

// The browser rotated or expired the subscription. Re-subscribing needs the VAPID key, which only
// the app has, so tell open tabs; the app re-registers on its next load anyway (PushHeal).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      for (const tab of tabs) tab.postMessage({ type: "push-subscription-changed" });
    }),
  );
});
