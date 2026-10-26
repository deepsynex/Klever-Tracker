import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, USER_COOKIE } from "./session-config";

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
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  return cookie || (process.env.NODE_ENV !== "production" ? process.env.DEV_AUTH_TOKEN ?? null : null);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(USER_COOKIE)?.value;
  if (!raw) {
    if (process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_TOKEN) {
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
  store.set(USER_COOKIE, Buffer.from(JSON.stringify(user), "utf8").toString("base64url"), options);
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(USER_COOKIE);
}
