// Shared by proxy.ts (no server-only import allowed there) and the server session helpers.
export const SESSION_COOKIE = "kt_session";
export const USER_COOKIE = "kt_user";

// Google OAuth 2.0 PKCE & state cookies (temporary 10-minute lifetime during auth flow)
export const GOOGLE_OAUTH_STATE_COOKIE = "kt_google_state";
export const GOOGLE_OAUTH_VERIFIER_COOKIE = "kt_google_verifier";

// Klever tokens never expire server-side (api-alignment.md B4). The cookie lifetime caps how
// long a browser keeps one until a logout mutation and token expiry exist on the backend.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"] as const;

export function isPublicPath(pathWithoutLocale: string): boolean {
  return PUBLIC_PATHS.some((p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(`${p}/`));
}
