import { NextResponse, type NextRequest } from "next/server";
import { isAllowedOrigin } from "@/lib/bff";
import { env } from "@/lib/env";
import { SESSION_COOKIE, SIGNED_OUT_COOKIE, devAuthToken } from "@/lib/session-config";

/**
 * Same-origin proxy for Laravel's private-channel authorisation (Reverb, G4). The browser's
 * socket asks here with { socket_id, channel_name }; this adds the bearer token from the session
 * cookie and forwards to the backend's /broadcasting/auth, so the token never reaches client-side
 * JavaScript. The backend decides whether this user may join the channel.
 */

const TIMEOUT_MS = 10_000;

function error(status: number, message: string) {
  return NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** The backend's broadcasting auth URL, on the same origin as the GraphQL endpoint. */
function authUrl(): string {
  return new URL("/broadcasting/auth", env.graphqlUrl).toString();
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.headers.get("host"), env.allowedOrigins)) {
    return error(403, "Request origin not allowed.");
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value || devAuthToken(request.cookies.has(SIGNED_OUT_COOKIE));
  if (!token) return error(401, "Unauthenticated.");

  let body: { socket_id?: unknown; channel_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return error(400, "Request body must be JSON.");
  }
  const socketId = typeof body.socket_id === "string" ? body.socket_id : "";
  const channelName = typeof body.channel_name === "string" ? body.channel_name : "";
  // Pusher socket ids look like "123.456"; private channels are "private-…".
  if (!/^\d+\.\d+$/.test(socketId) || !/^private-[\w.\-=@,;]+$/.test(channelName)) {
    return error(400, "Invalid socket or channel.");
  }

  let upstream: Response;
  try {
    upstream = await fetch(authUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: new URLSearchParams({ socket_id: socketId, channel_name: channelName }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return error(502, "The API could not be reached.");
  }

  const text = await upstream.text();
  if (!upstream.ok) return error(upstream.status === 403 ? 403 : upstream.status === 401 ? 401 : 502, "Channel authorisation refused.");
  // Only the signature goes back to the browser; never upstream headers.
  try {
    const json: unknown = JSON.parse(text);
    if (!json || typeof json !== "object" || typeof (json as { auth?: unknown }).auth !== "string") throw new Error("bad");
    return NextResponse.json(json, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return error(502, "The API returned an invalid authorisation response.");
  }
}
