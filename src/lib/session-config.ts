// Shared by proxy.ts (no server-only import allowed there) and the server session helpers.
export const SESSION_COOKIE = "kt_session";
export const USER_COOKIE = "kt_user";
/** Set on logout so the dev-only DEV_AUTH_TOKEN auto sign-in stays off until the next real sign-in. */
export const SIGNED_OUT_COOKIE = "kt_signed_out";

/** Dev-only fallback token from DEV_AUTH_TOKEN: never in production, and not after the user signed out. */
export function devAuthToken(signedOut: boolean): string | undefined {
  if (process.env.NODE_ENV === "production" || signedOut) return undefined;
  return process.env.DEV_AUTH_TOKEN || undefined;
}

// Google OAuth 2.0 PKCE & state cookies (temporary 10-minute lifetime during auth flow)
export const GOOGLE_OAUTH_STATE_COOKIE = "kt_google_state";
export const GOOGLE_OAUTH_VERIFIER_COOKIE = "kt_google_verifier";

// Klever tokens never expire server-side (api-alignment.md B4). The cookie lifetime caps how
// long a browser keeps one until a logout mutation and token expiry exist on the backend.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

// "/track" is the public live-location page opened from a share link (no sign-in).
export const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/track"] as const;

export function isPublicPath(pathWithoutLocale: string): boolean {
  return PUBLIC_PATHS.some((p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(`${p}/`));
}
