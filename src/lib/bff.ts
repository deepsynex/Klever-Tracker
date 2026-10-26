/** Pure helpers for the backend-for-frontend layer, kept separate so they're unit-testable. */

/**
 * Accepts a browser request only when its Origin header matches an allowed origin, or the
 * request's own host when no list is configured. Requests without an Origin are rejected,
 * since browsers always send one on cross-site and same-origin POSTs.
 */
export function isAllowedOrigin(origin: string | null, host: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (allowedOrigins.length > 0) return allowedOrigins.includes(parsed.origin);
  return host !== null && parsed.host === host;
}

/** Returns a same-site path to continue to after login, or the dashboard for anything unsafe. */
export function safeNextPath(next: unknown, locale: string): string {
  const fallback = `/${locale}/dashboard`;
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  return next;
}
