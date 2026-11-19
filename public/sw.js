/*
 * Klever Tracker service worker: browser push notifications only (no offline caching).
 * Pushes come through Firebase Cloud Messaging (backend G5, API Doc §6.22):
 *   { notification: { title, body },
 *     data: { url: "/en/live?focus=<vehicleId>", tag: "alert-<alertEventId>", notificationId,
 *             alertEventId, vehicleId, eventCode } }   (every data value is a string)
 * The app gets the token with Firebase and this worker's registration, so no Firebase code is
 * needed here. Plain JS, served as-is from /sw.js (no bundler).
 */

const DEFAULT_URL = "/en/live";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** The push in one shape, whether it came from FCM ({ notification, data }) or as plain fields. */
function readPush(event) {
  let raw = {};
  if (event.data) {
    try {
      raw = event.data.json();
    } catch {
      // Not JSON: show the text as the body.
      raw = { body: event.data.text() };
    }
  }
  const note = raw.notification || {};
  const data = raw.data || {};
  return {
    title: note.title || raw.title || "Klever Tracker",
    body: note.body || raw.body || "",
    url: data.url || (raw.fcmOptions && raw.fcmOptions.link) || raw.url || DEFAULT_URL,
    tag: data.tag || raw.tag || undefined,
    data,
  };
}

self.addEventListener("push", (event) => {
  const push = readPush(event);
  event.waitUntil(
    (async () => {
      // A visible Klever Tracker tab shows its own toast (and refreshes the inbox): hand it over
      // instead of a system notification on top.
      const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = tabs.filter((c) => c.visibilityState === "visible");
      if (visible.length) {
        for (const tab of visible) tab.postMessage({ type: "push-message", data: push.data });
        return;
      }
      await self.registration.showNotification(push.title, {
        body: push.body,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        // Same tag = the browser replaces instead of stacking a duplicate for the same alert.
        tag: push.tag,
        renotify: false,
        data: { url: push.url, notificationId: push.data.notificationId || null },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || DEFAULT_URL, self.location.origin)
    .href;
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

// The browser changed or expired the subscription, so the FCM token is stale. Getting a new one
// needs Firebase, which only the app has: tell open tabs (the app also re-registers on its next load).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      for (const tab of tabs) tab.postMessage({ type: "push-subscription-changed" });
    }),
  );
});
