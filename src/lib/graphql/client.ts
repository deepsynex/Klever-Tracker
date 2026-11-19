"use client";

import { classifyHttpResponse, type ApiError } from "./errors";

export class ApiRequestError extends Error {
  constructor(public readonly error: ApiError) {
    super(error.message);
    this.name = "ApiRequestError";
  }
}

/**
 * Browser-side GraphQL call through the same-origin /api/graphql proxy.
 * Use it as the queryFn / mutationFn of TanStack Query hooks.
 */
export async function gqlRequest<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  let status = 0;
  let text = "";
  try {
    const res = await fetch("/api/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ query, variables }),
    });
    status = res.status;
    text = await res.text();
  } catch {
    status = 0;
  }

  const { data, error } = classifyHttpResponse(status, text);
  if (error) {
    if (error.kind === "unauthenticated" && typeof window !== "undefined") {
      const locale = document.documentElement.lang || "en";
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      // A full page load on purpose: it drops every cached query from the ended session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/${locale}/login?next=${next}`);
    }
    throw new ApiRequestError(error);
  }
  return data as T;
}

/**
 * Like gqlRequest, for queries that read several lists at once: top-level fields the user's role
 * may not read come back empty instead of failing the whole query (the API fails all of it).
 * Still throws when nothing at all is readable.
 */
export async function gqlRequestPartial<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  let current = query;
  const empty: Record<string, unknown> = {};
  // A retry can hit another refused field, so allow a few rounds.
  for (let round = 0; ; round++) {
    try {
      const data = await gqlRequest<T>(current, variables);
      return { ...data, ...empty };
    } catch (err) {
      const fields = err instanceof ApiRequestError && err.error.kind === "forbidden" ? err.error.forbiddenFields : undefined;
      if (!fields?.length || round >= 5) throw err;
      const { withoutRootFields } = await import("./partial");
      const next = withoutRootFields(current, fields);
      if (!next) throw err;
      current = next.query;
      Object.assign(empty, next.empty);
    }
  }
}
