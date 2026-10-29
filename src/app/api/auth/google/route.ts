import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createGoogleAuthUrl } from "@/lib/auth/google";
import { GOOGLE_OAUTH_STATE_COOKIE, GOOGLE_OAUTH_VERIFIER_COOKIE } from "@/lib/session-config";
import { env } from "@/lib/env";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const locale = searchParams.get("locale") || "en";
  const next = searchParams.get("next") || "/dashboard";

  // Build the dynamic redirect URI matching the request host
  const base = origin || env.appUrl;
  const redirectUri = `${base}/api/auth/callback/google`;

  const { url, state, codeVerifier } = createGoogleAuthUrl({
    redirectUri,
    locale,
    next,
  });

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 minutes for user to complete Google consent
  };

  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, state, cookieOptions);
  cookieStore.set(GOOGLE_OAUTH_VERIFIER_COOKIE, codeVerifier, cookieOptions);

  return NextResponse.redirect(url);
}
