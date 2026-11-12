"use client";

import Echo from "laravel-echo";
import Pusher from "pusher-js";
import type { ApiNotification } from "./api";
import { reverbConfig, userChannel } from "./api";

/**
 * Live notifications over Laravel Reverb (backend-requests/geofencing-realtime.md, G4).
 *
 * The bearer token never reaches the browser, so the private channel is authorised through our
 * own server: Pusher's channel-authorisation step POSTs to /api/broadcasting/auth, which adds the
 * token from the session cookie and forwards to the backend's /broadcasting/auth.
 *
 * Connection state is a tiny external store, so components read it with useSyncExternalStore and
 * the bell polls only while the socket isn't connected.
 */

export const NOTIFICATION_EVENT = ".notification.created";

let connected = false;
const listeners = new Set<() => void>();

function setConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  listeners.forEach((l) => l());
}

export function subscribeRealtimeState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isRealtimeConnected(): boolean {
  return connected;
}

/** The broadcast payload: a UserNotification with `data` already decoded (G4). */
export type NotificationBroadcast = Partial<ApiNotification> & { id?: string | number };

/**
 * Opens the socket and listens on the user's private channel. Returns a function that closes it.
 * Does nothing (and returns a no-op) when Reverb isn't configured.
 */
export function connectRealtime(userId: string, onNotification: (n: NotificationBroadcast) => void): () => void {
  const config = reverbConfig();
  if (!config || typeof window === "undefined") return () => {};

  const tls = config.scheme === "https";
  const echo = new Echo({
    broadcaster: "reverb",
    key: config.key,
    wsHost: config.host,
    wsPort: config.port,
    wssPort: config.port,
    forceTLS: tls,
    enabledTransports: tls ? ["wss"] : ["ws"],
    Pusher,
    channelAuthorization: {
      customHandler: ({ socketId, channelName }, callback) => {
        fetch("/api/broadcasting/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ socket_id: socketId, channel_name: channelName }),
        })
          .then(async (res) => {
            if (!res.ok) throw new Error(`Channel authorisation failed (HTTP ${res.status})`);
            callback(null, await res.json());
          })
          .catch((err: unknown) => callback(err instanceof Error ? err : new Error(String(err)), null));
      },
    },
  });

  const pusher = echo.connector.pusher;
  pusher.connection.bind("state_change", ({ current }: { current: string }) => setConnected(current === "connected"));
  setConnected(pusher.connection.state === "connected");

  const channel = userChannel(userId);
  echo.private(channel).listen(NOTIFICATION_EVENT, (payload: NotificationBroadcast) => onNotification(payload));

  return () => {
    echo.leave(channel);
    echo.disconnect();
    setConnected(false);
  };
}
