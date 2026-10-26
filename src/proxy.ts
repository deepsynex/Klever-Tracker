import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { isAppLocale, routing } from "./i18n/routing";
import { SESSION_COOKIE, isPublicPath } from "./lib/session-config";

const handleI18nRouting = createIntlMiddleware(routing);

/**
 * Optimistic auth check: only looks for the session cookie so signed-out users are sent to
 * login before rendering. Real authorisation happens on the Klever API for every request.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const [, maybeLocale, ...rest] = pathname.split("/");

  if (isAppLocale(maybeLocale)) {
    const subPath = `/${rest.join("/")}`;
    const hasSession = request.cookies.has(SESSION_COOKIE);

    if (!hasSession && !isPublicPath(subPath)) {
      const loginUrl = new URL(`/${maybeLocale}/login`, request.url);
      if (subPath !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }

    if (hasSession && subPath === "/login") {
      return NextResponse.redirect(new URL(`/${maybeLocale}/dashboard`, request.url));
    }
  }

  return handleI18nRouting(request);
}

export const config = {
  // Skip API routes, Next.js internals and files with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
