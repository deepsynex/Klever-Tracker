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
