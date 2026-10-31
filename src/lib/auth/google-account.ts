import "server-only";
import { env } from "@/lib/env";
import type { GraphQLErrorShape } from "@/lib/graphql/errors";
import { kleverFetch, kleverRequest } from "@/lib/graphql/klever";
import { MOCK_USER } from "@/lib/graphql/mock";
import { LOGIN, type LoginResult, type LoginVariables } from "@/lib/graphql/operations";
import type { SessionUser } from "@/lib/session";

/**
 * Result of Klever's `loginWithGoogle` (api-alignment.md B9; spec in ../backend-requests/login-with-google.md).
 * - `ok`: a normal Klever session for the user whose email matches the Google account
 * - `not_registered`: no active user has that email
 * - `unsupported`: the backend doesn't have the mutation yet, so fall back to the email check
 * - `error`: anything else (network, bad Google token, server error)
 */
export type GoogleLoginResult =
  | { kind: "ok"; token: string; user: SessionUser }
  | { kind: "not_registered" }
  | { kind: "unsupported" }
  | { kind: "error" };

const LOGIN_WITH_GOOGLE = /* GraphQL */ `
  mutation LoginWithGoogle($idToken: String!) {
    loginWithGoogle(idToken: $idToken) {
      token
      user {
        id
        name
        email
      }
    }
  }
`;

/** Sends Google's ID token to Klever, which verifies it and issues its own token for the matching user. */
export async function loginWithGoogle(idToken: string): Promise<GoogleLoginResult> {
  const res = await kleverFetch(JSON.stringify({ query: LOGIN_WITH_GOOGLE, variables: { idToken } }));
  let body: { data?: { loginWithGoogle?: { token: string; user: SessionUser } | null }; errors?: GraphQLErrorShape[] };
  try {
    body = JSON.parse(res.text);
  } catch {
    return { kind: "error" };
  }
  const payload = body.data?.loginWithGoogle;
  if (payload?.token) return { kind: "ok", token: payload.token, user: payload.user };

  const err = body.errors?.[0];
  // GraphQL validation rejects a field the schema doesn't have: the mutation isn't deployed yet.
  if (err?.message?.includes('Cannot query field "loginWithGoogle"')) return { kind: "unsupported" };
  // Unknown email, or an inactive user (same answer as `login` gives them).
  if (err?.extensions?.reason === "not_registered" || err?.message === "Invalid credentials.") {
    return { kind: "not_registered" };
  }
  return { kind: "error" };
}

/**
 * Whether a Google account's email belongs to a Klever user.
 * - `found`: a user has this email (they still sign in with their password until B9 ships)
 * - `not_found`: no user has it; the admin must create one
 * - `unavailable`: the lookup itself failed (no service account, API locked or down)
 */
export type GoogleAccountMatch = "found" | "not_found" | "unavailable";

const USER_EMAILS = /* GraphQL */ `
  query GoogleUserLookup($first: Int!, $page: Int) {
    users(first: $first, page: $page) {
      data {
        email
      }
      paginatorInfo {
        lastPage
      }
    }
  }
`;
type UserEmailsResult = { users: { data: { email: string | null }[]; paginatorInfo?: { lastPage?: number } } };

const PAGE_SIZE = 200;
const MAX_PAGES = 50;

/**
 * Klever tokens never expire and each `login` stores a new one, so the service account signs in
 * once per server process and reuses the token.
 */
let serviceToken: string | null = null;

async function getServiceToken(force = false): Promise<string | null> {
  if (serviceToken && !force) return serviceToken;
  if (!env.serviceEmail || !env.servicePassword) {
    console.warn("[Google sign-in] KLEVER_SERVICE_EMAIL / KLEVER_SERVICE_PASSWORD not set; can't look up users.");
    return null;
  }
  const res = await kleverRequest<LoginResult>(LOGIN, {
    email: env.serviceEmail,
    password: env.servicePassword,
  } satisfies LoginVariables);
  if (!res.ok) console.warn(`[Google sign-in] Service account sign-in failed: ${res.error.kind}`);
  serviceToken = res.ok ? res.data.login.token : null;
  return serviceToken;
}

async function hasUserWithEmail(email: string, token: string): Promise<boolean | "unauthenticated" | null> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await kleverRequest<UserEmailsResult>(USER_EMAILS, { first: PAGE_SIZE, page }, { token });
    if (!res.ok) return res.error.kind === "unauthenticated" ? "unauthenticated" : null;
    if (res.data.users.data.some((u) => u.email?.trim().toLowerCase() === email)) return true;
    if (page >= (res.data.users.paginatorInfo?.lastPage ?? 1)) return false;
  }
  return false;
}

/**
 * Looks the email up with the service account (KLEVER_SERVICE_EMAIL / KLEVER_SERVICE_PASSWORD).
 * Tokens are company-scoped, so only users in the service account's company are found (A1).
 */
export async function findKleverUserByEmail(rawEmail: string): Promise<GoogleAccountMatch> {
  const email = rawEmail.trim().toLowerCase();
  if (env.mock) return email === MOCK_USER.email ? "found" : "not_found";

  let token = await getServiceToken();
  if (!token) return "unavailable";
  let found = await hasUserWithEmail(email, token);
  if (found === "unauthenticated") {
    // The stored token was deleted on the backend; sign in again once.
    token = await getServiceToken(true);
    found = token ? await hasUserWithEmail(email, token) : null;
  }
  if (found === true) return "found";
  if (found === false) return "not_found";
  return "unavailable";
}
