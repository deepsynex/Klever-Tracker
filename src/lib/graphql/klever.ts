import "server-only";
import { env } from "@/lib/env";
import { classifyHttpResponse, type ApiError } from "./errors";
import { mockFetch } from "./mock";

export type UpstreamResponse = { status: number; text: string; contentType: string | null };

const TIMEOUT_MS = 15_000;

/** Sends a raw GraphQL body to Klever. Status 0 means the request never got a response. */
export async function kleverFetch(body: string, token?: string): Promise<UpstreamResponse> {
  if (env.mock) return mockFetch(body, token);

  // A request carries either the user's bearer token or, for public operations (login, password
  // reset, ping), the optional basic-auth credentials for the server lock. Never both: they share
  // the Authorization header.
  const authorization = token ? `Bearer ${token}` : env.basicAuthHeader;

  try {
    const res = await fetch(env.graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: res.status, text: await res.text(), contentType: res.headers.get("content-type") };
  } catch {
    return { status: 0, text: "", contentType: null };
  }
}

export type KleverResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Typed GraphQL request from server code (Server Components, Server Actions, Route Handlers). */
export async function kleverRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: { token?: string } = {},
): Promise<KleverResult<T>> {
  const res = await kleverFetch(JSON.stringify({ query, variables }), options.token);
  const { data, error } = classifyHttpResponse(res.status, res.text);
  if (error) return { ok: false, error };
  return { ok: true, data: data as T };
}
