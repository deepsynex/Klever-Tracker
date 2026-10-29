import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  decodeOAuthState,
  exchangeGoogleCode,
  getGoogleProfile,
} from "@/lib/auth/google";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
} from "@/lib/session-config";
import { setSession } from "@/lib/session";
import { env } from "@/lib/env";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const cookieStore = await cookies();
  const savedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const savedVerifier = cookieStore.get(GOOGLE_OAUTH_VERIFIER_COOKIE)?.value;

  const stateData = state ? decodeOAuthState(state) : null;
  const locale = stateData?.locale || "en";
  const next = stateData?.next || "/dashboard";

  // Cleanup helper
  const cleanupCookies = () => {
    cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE);
    cookieStore.delete(GOOGLE_OAUTH_VERIFIER_COOKIE);
  };

  // 1. Check for user cancellation or Google error
  if (error) {
    cleanupCookies();
    const loginUrl = new URL(`/${locale}/login`, origin);
    loginUrl.searchParams.set("error", error === "access_denied" ? "google_cancelled" : "google_error");
    return NextResponse.redirect(loginUrl);
  }

  // 2. Validate CSRF state parameter
  if (!state || !savedState || state !== savedState) {
    cleanupCookies();
    const loginUrl = new URL(`/${locale}/login`, origin);
    loginUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(loginUrl);
  }

  // 3. Ensure authorization code and PKCE verifier exist
  if (!code || !savedVerifier) {
    cleanupCookies();
    const loginUrl = new URL(`/${locale}/login`, origin);
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const base = origin || env.appUrl;
    const redirectUri = `${base}/api/auth/callback/google`;

    // 4. Exchange authorization code for tokens
    const tokens = await exchangeGoogleCode({
      code,
      codeVerifier: savedVerifier,
      redirectUri,
    });

    // 5. Fetch verified Google profile
    const profile = await getGoogleProfile(tokens.access_token);

    // 6. Establish application session
    await setSession(tokens.access_token, {
      id: profile.sub,
      name: profile.name,
      email: profile.email,
    });

    // 7. Cleanup OAuth cookies
    cleanupCookies();

    // 8. Redirect to requested page or dashboard
    const cleanNext = next.startsWith("/") ? next : `/${next}`;
    const destinationPath = cleanNext.startsWith(`/${locale}`)
      ? cleanNext
      : `/${locale}${cleanNext}`;

    return NextResponse.redirect(new URL(destinationPath, origin));
  } catch (err) {
    cleanupCookies();
    console.error("[Google OAuth Callback Error]:", err);
    const loginUrl = new URL(`/${locale}/login`, origin);
    loginUrl.searchParams.set("error", "oauth_failed");
    return NextResponse.redirect(loginUrl);
  }
}
