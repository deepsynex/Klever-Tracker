/**
 * Turns Klever (Lighthouse) GraphQL errors and non-GraphQL HTTP failures into a small set of
 * error kinds the UI can translate. Shared by server and client code.
 */

export type ApiErrorKind =
  | "invalid_credentials"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "validation"
  | "api_locked"
  | "gateway"
  | "network"
  | "unknown";

export type ApiError = {
  kind: ApiErrorKind;
  message: string;
  /** Field name → server messages, for validation errors. */
  fields?: Record<string, string[]>;
  status?: number;
};

export type GraphQLErrorShape = {
  message?: string;
  extensions?: {
    category?: string;
    validation?: Record<string, string[]>;
    [key: string]: unknown;
  };
};

// Exact messages documented in the Klever guide.
const INVALID_CREDENTIALS = "Invalid credentials.";
const FORBIDDEN = "Forbidden.";
const NOT_FOUND = "Not found.";
const UNAUTHENTICATED = "Unauthenticated.";

/** "input.email" or "email" → "email" */
function fieldKey(path: string): string {
  const parts = path.split(".");
  return parts[parts.length - 1] ?? path;
}

export function classifyGraphQLErrors(errors: GraphQLErrorShape[]): ApiError {
  const first = errors[0] ?? {};
  const message = first.message ?? "Unknown error";
  const category = first.extensions?.category;

  const validation = errors.find((e) => e.extensions?.validation)?.extensions?.validation;
  if (validation) {
    const fields: Record<string, string[]> = {};
    for (const [path, msgs] of Object.entries(validation)) {
      fields[fieldKey(path)] = [...(fields[fieldKey(path)] ?? []), ...msgs];
    }
    return { kind: "validation", message, fields };
  }

  if (message === INVALID_CREDENTIALS) return { kind: "invalid_credentials", message };
  if (message === UNAUTHENTICATED || category === "authentication") return { kind: "unauthenticated", message };
  if (message === FORBIDDEN || category === "authorization") return { kind: "forbidden", message };
  if (message === NOT_FOUND) return { kind: "not_found", message };
  return { kind: "unknown", message };
}

/** Classifies a raw upstream HTTP response that may not be GraphQL at all (e.g. an nginx 401 page). */
export function classifyHttpResponse(status: number, body: string): { data?: unknown; error?: ApiError } {
  if (status === 0) return { error: { kind: "network", message: "The API could not be reached.", status } };

  let json: { data?: unknown; errors?: GraphQLErrorShape[] } | undefined;
  try {
    json = JSON.parse(body);
  } catch {
    json = undefined;
  }

  if (!json || typeof json !== "object") {
    // A non-GraphQL 401 is the HTTP basic-auth lock in front of the API, not a Klever login failure.
    if (status === 401) {
      return {
        error: { kind: "api_locked", message: "The API is behind an HTTP basic-auth lock (HTTP 401).", status },
      };
    }
    return {
      error: { kind: "gateway", message: `The API returned HTTP ${status} without a GraphQL response.`, status },
    };
  }
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    return { error: { ...classifyGraphQLErrors(json.errors), status } };
  }
  if (json.data === undefined || json.data === null) {
    return { error: { kind: "unknown", message: "The API returned no data.", status } };
  }
  return { data: json.data };
}

export function isUnauthenticatedBody(body: string): boolean {
  try {
    const json = JSON.parse(body) as { errors?: GraphQLErrorShape[] };
    return Array.isArray(json.errors) && json.errors.length > 0 && classifyGraphQLErrors(json.errors).kind === "unauthenticated";
  } catch {
    return false;
  }
}
