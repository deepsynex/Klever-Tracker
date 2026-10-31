import "server-only";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  SIGNED_OUT_COOKIE,
  USER_COOKIE,
  devAuthToken,
} from "./session-config";

/** Display-only profile from the login response. Never used for authorisation. */
export type SessionUser = { id: string; name: string; email: string };

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax keeps users signed in when they open the app from an emailed link. CSRF is covered by
    // the Origin check on /api/graphql and Next.js's built-in Server Action origin check.
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value || devAuthToken(store.has(SIGNED_OUT_COOKIE)) || null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(USER_COOKIE)?.value;
  if (!raw) {
    if (devAuthToken(store.has(SIGNED_OUT_COOKIE))) {
      return { id: "1", name: "Verify Admin", email: "verify@klever-tracker.test" };
    }
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as SessionUser;
    return parsed && typeof parsed.name === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export async function setSession(token: string, user: SessionUser): Promise<void> {
  const store = await cookies();
  const options = cookieOptions();
  store.set(SESSION_COOKIE, token, options);
  store.delete(SIGNED_OUT_COOKIE);
  store.set(USER_COOKIE, Buffer.from(JSON.stringify(user), "utf8").toString("base64url"), options);
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(USER_COOKIE);
  // Without this, DEV_AUTH_TOKEN would sign a developer straight back in after logout.
  if (process.env.NODE_ENV !== "production")
    store.set(SIGNED_OUT_COOKIE, "1", { ...cookieOptions(), maxAge: undefined });
}
