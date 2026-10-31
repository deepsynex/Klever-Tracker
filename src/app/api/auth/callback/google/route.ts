import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { decodeOAuthState, exchangeGoogleCode, getGoogleProfile } from "@/lib/auth/google";
import { GOOGLE_OAUTH_STATE_COOKIE, GOOGLE_OAUTH_VERIFIER_COOKIE } from "@/lib/session-config";
import { findKleverUserByEmail, loginWithGoogle } from "@/lib/auth/google-account";
import { safeNextPath } from "@/lib/bff";
import { env } from "@/lib/env";
import { setSession } from "@/lib/session";

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
    cleanupCookies();

    const loginUrl = new URL(`/${locale}/login`, origin);
    if (!profile.email || profile.email_verified === false) {
      loginUrl.searchParams.set("error", "google_unverified");
      return NextResponse.redirect(loginUrl);
    }

    // 6. Ask Klever for a session. Google's own token is never stored: Klever doesn't accept it, so
    // every API call failed with "Unauthenticated." and bounced the user back to login. Klever verifies
    // the Google ID token itself and issues a normal token for the user with that email (B9).
    const result = tokens.id_token ? await loginWithGoogle(tokens.id_token) : ({ kind: "error" } as const);
    if (result.kind === "ok") {
      await setSession(result.token, result.user);
      const path = safeNextPath(next, locale);
      const destination = path === `/${locale}` || path.startsWith(`/${locale}/`) ? path : `/${locale}${path}`;
      return NextResponse.redirect(new URL(destination, origin));
    }
    if (result.kind === "not_registered") {
      loginUrl.searchParams.set("error", "google_not_registered");
      return NextResponse.redirect(loginUrl);
    }
    if (result.kind === "error") {
      loginUrl.searchParams.set("error", "google_unavailable");
      return NextResponse.redirect(loginUrl);
    }

    // 7. The backend doesn't have `loginWithGoogle` yet: check the email with the service account and
    // send a registered user to the password form.
    const match = await findKleverUserByEmail(profile.email);
    if (match === "found") {
      loginUrl.searchParams.set("error", "google_use_password");
      loginUrl.searchParams.set("email", profile.email);
      if (next !== "/dashboard") loginUrl.searchParams.set("next", next);
    } else {
      loginUrl.searchParams.set("error", match === "not_found" ? "google_not_registered" : "google_unavailable");
    }
    return NextResponse.redirect(loginUrl);
  } catch (err) {
    cleanupCookies();
    console.error("[Google OAuth Callback Error]:", err);
    const loginUrl = new URL(`/${locale}/login`, origin);
    loginUrl.searchParams.set("error", "oauth_failed");
    return NextResponse.redirect(loginUrl);
  }
}
