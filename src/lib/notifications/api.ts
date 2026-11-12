/**
 * The notification contract with the backend (backend-requests/geofencing-realtime.md, G3–G5):
 * a per-user inbox, unread count, mark read, browser-push subscriptions and the live
 * `.notification.created` broadcast. Pure (no React), so Vitest can test the parsing.
 *
 * Until the backend has these operations, the app hides the bell and the push switch instead of
 * showing errors: see isMissingFromApi in map-settings.ts.
 */

export const MY_NOTIFICATIONS = /* GraphQL */ `
  query MyNotifications($unreadOnly: Boolean, $first: Int, $page: Int) {
    myNotifications(unreadOnly: $unreadOnly, first: $first, page: $page) {
      data {
        id
        alertEventId
        title
        body
        data
        readAt
        createdAt
      }
      paginatorInfo {
        total
        currentPage
        lastPage
      }
    }
  }
`;

export const UNREAD_COUNT = /* GraphQL */ `
  query MyUnreadNotificationCount {
    myUnreadNotificationCount
  }
`;

export const MARK_NOTIFICATION_READ = /* GraphQL */ `
  mutation MarkNotificationRead($id: ID!) {
    markNotificationRead(id: $id) {
      id
      readAt
    }
  }
`;

export const MARK_ALL_NOTIFICATIONS_READ = /* GraphQL */ `
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`;

export const WEB_PUSH_PUBLIC_KEY = /* GraphQL */ `
  query WebPushPublicKey {
    webPushPublicKey
  }
`;

export const REGISTER_PUSH_SUBSCRIPTION = /* GraphQL */ `
  mutation RegisterPushSubscription($endpoint: String!, $p256dh: String!, $auth: String!, $userAgent: String) {
    registerPushSubscription(endpoint: $endpoint, p256dh: $p256dh, auth: $auth, userAgent: $userAgent)
  }
`;

export const REMOVE_PUSH_SUBSCRIPTION = /* GraphQL */ `
  mutation RemovePushSubscription($endpoint: String!) {
    removePushSubscription(endpoint: $endpoint)
  }
`;

/** As the API returns it: `data` is a JSON string. */
export type ApiNotification = {
  id: string;
  alertEventId: string | null;
  title: string;
  body: string;
  data: string | Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsPage = {
  myNotifications: {
    data: ApiNotification[];
    paginatorInfo: { total: number; currentPage: number; lastPage: number };
  };
};

/** The event details carried in `data` (G3). Every field may be missing. */
export type NotificationDetails = {
  eventCode: string | null;
  vehicleId: string | null;
  plateNo: string | null;
  geofenceId: string | null;
  geofenceName: string | null;
  lat: number | null;
  lng: number | null;
  /** UTC "YYYY-MM-DD HH:MM:SS", like every API time. */
  occurredAt: string | null;
  speed: number | null;
  /** Vehicle battery at the time, in mV. */
  externalVoltageMv: number | null;
  /** Reverse-geocoded place, when the backend adds it (L3). */
  address: string | null;
};

export type AppNotification = Omit<ApiNotification, "data"> & { details: NotificationDetails };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** Reads `data` (a JSON string from GraphQL, or an object from the broadcast). Never throws. */
export function parseDetails(data: ApiNotification["data"]): NotificationDetails {
  let d: Record<string, unknown> = {};
  if (typeof data === "string") {
    try {
      const parsed: unknown = JSON.parse(data);
      if (parsed && typeof parsed === "object") d = parsed as Record<string, unknown>;
    } catch {
      // Opaque string: no details.
    }
  } else if (data && typeof data === "object") {
    d = data;
  }
  const lat = num(d.lat);
  const lng = num(d.lng);
  const usable = lat !== null && lng !== null && !(lat === 0 && lng === 0);
  return {
    eventCode: str(d.event_code),
    vehicleId: str(d.vehicle_id),
    plateNo: str(d.plate_no),
    geofenceId: str(d.geofence_id),
    geofenceName: str(d.geofence_name),
    lat: usable ? lat : null,
    lng: usable ? lng : null,
    occurredAt: str(d.occurred_at),
    speed: num(d.speed),
    externalVoltageMv: num(d.external_voltage_mv),
    address: str(d.address),
  };
}

export function toAppNotification(n: ApiNotification): AppNotification {
  return { ...n, details: parseDetails(n.data) };
}

export type NotificationKind = "enter" | "exit" | "other";

export function notificationKind(n: Pick<AppNotification, "details">): NotificationKind {
  return n.details.eventCode === "geofence_enter" ? "enter" : n.details.eventCode === "geofence_exit" ? "exit" : "other";
}

/**
 * Hand-off to the Live screen: the vehicle to focus. Stored for this tab and read once by Live,
 * so the URL stays clean (no query-string state). Browser-push clicks arrive with ?focus=<id>
 * instead (a service worker can't write this tab's storage); Live reads that and strips it.
 */
export const LIVE_FOCUS_KEY = "kt-live-focus";

export function requestLiveFocus(vehicleId: string): void {
  try {
    sessionStorage.setItem(LIVE_FOCUS_KEY, vehicleId);
  } catch {
    // Storage blocked: Live just opens without a focused vehicle.
  }
}

/** The vehicle Live should focus on, from this tab's hand-off or a push click; read once. */
export function takeLiveFocus(): string | null {
  let id: string | null = null;
  try {
    id = sessionStorage.getItem(LIVE_FOCUS_KEY);
    sessionStorage.removeItem(LIVE_FOCUS_KEY);
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("focus");
    if (fromUrl) {
      id = id ?? fromUrl;
      url.searchParams.delete("focus");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }
  return id;
}

/** VAPID public key (base64url) → the Uint8Array PushManager.subscribe expects. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Live WebSocket settings (Reverb, G4). The bell polls instead while these aren't set. */
export function reverbConfig(): { key: string; host: string; port: number; scheme: "https" | "http" } | null {
  const key = process.env.NEXT_PUBLIC_REVERB_APP_KEY;
  const host = process.env.NEXT_PUBLIC_REVERB_HOST;
  if (!key || !host) return null;
  const scheme = process.env.NEXT_PUBLIC_REVERB_SCHEME === "http" ? "http" : "https";
  const port = Number(process.env.NEXT_PUBLIC_REVERB_PORT) || (scheme === "https" ? 443 : 80);
  return { key, host, port, scheme };
}

/** The private channel the backend broadcasts a user's notifications on (G4). */
export function userChannel(userId: string): string {
  return `${process.env.NEXT_PUBLIC_REVERB_USER_CHANNEL_PREFIX || "user."}${userId}`;
}
