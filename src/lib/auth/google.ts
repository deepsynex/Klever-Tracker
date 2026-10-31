import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified?: boolean;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

export interface GoogleTokens {
  access_token: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  refresh_token?: string;
}

export interface GoogleOAuthStateData {
  nonce: string;
  locale: string;
  next?: string;
}

/** Base64URL-encoded SHA-256 hash for PKCE S256 challenge */
function sha256(plain: string): string {
  return createHash("sha256").update(plain).digest("base64url");
}

/** Generates cryptographically secure random Base64URL string */
function randomString(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Creates the Google OAuth 2.0 authorization URL with state and PKCE S256 parameters.
 */
export function createGoogleAuthUrl(options: {
  redirectUri: string;
  locale?: string;
  next?: string;
}): {
  url: string;
  state: string;
  codeVerifier: string;
} {
  const codeVerifier = randomString(32);
  const codeChallenge = sha256(codeVerifier);

  const stateData: GoogleOAuthStateData = {
    nonce: randomString(16),
    locale: options.locale || "en",
    next: options.next || "/dashboard",
  };

  const state = Buffer.from(JSON.stringify(stateData), "utf8").toString("base64url");

  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "select_account",
  });

  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state,
    codeVerifier,
  };
}

/**
 * Exchanges the Google authorization code and PKCE code_verifier for access and ID tokens.
 */
export async function exchangeGoogleCode(options: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    code: options.code,
    code_verifier: options.codeVerifier,
    redirect_uri: options.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google token exchange failed (${response.status}): ${errorText}`);
  }

  return (await response.json()) as GoogleTokens;
}

/**
 * Fetches the authenticated user profile using the Google access token.
 */
export async function getGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Google user profile (${response.status}): ${errorText}`);
  }

  return (await response.json()) as GoogleProfile;
}

/**
 * Decodes and validates the OAuth state parameter.
 */
export function decodeOAuthState(stateString: string): GoogleOAuthStateData | null {
  try {
    const json = Buffer.from(stateString, "base64url").toString("utf8");
    const data = JSON.parse(json);
    if (typeof data.nonce === "string" && typeof data.locale === "string") {
      return data as GoogleOAuthStateData;
    }
    return null;
  } catch {
    return null;
  }
}
