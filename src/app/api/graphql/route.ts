import { after, NextResponse, type NextRequest } from "next/server";
import { mutationAuditEntries } from "@/lib/audit/mutation-audit";
import { writeAuditEntries } from "@/lib/audit/write-audit";
import { isAllowedOrigin } from "@/lib/bff";
import { env } from "@/lib/env";
import { isUnauthenticatedBody } from "@/lib/graphql/errors";
import { kleverFetch } from "@/lib/graphql/klever";
import { SESSION_COOKIE, SIGNED_OUT_COOKIE, devAuthToken, USER_COOKIE } from "@/lib/session-config";

const MAX_BODY_BYTES = 200_000;

function errorResponse(status: number, message: string, category: string) {
  return NextResponse.json(
    { errors: [{ message, extensions: { category } }] },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

/**
 * Same-origin GraphQL proxy. The browser sends its query here with the session cookie; this
 * handler adds the bearer token so the token never reaches client-side JavaScript.
 */
export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.headers.get("host"), env.allowedOrigins)) {
    return errorResponse(403, "Request origin not allowed.", "origin");
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value || devAuthToken(request.cookies.has(SIGNED_OUT_COOKIE));
  if (!token) return errorResponse(401, "Unauthenticated.", "authentication");

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return errorResponse(413, "Request body too large.", "request");

  let parsed: { query?: unknown; variables?: unknown; operationName?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return errorResponse(400, "Request body must be JSON.", "request");
  }
  if (typeof parsed.query !== "string" || parsed.query.trim() === "") {
    return errorResponse(400, "Missing GraphQL query.", "request");
  }

  const variables = typeof parsed.variables === "object" && parsed.variables !== null ? (parsed.variables as Record<string, unknown>) : {};
  const operationName = typeof parsed.operationName === "string" ? parsed.operationName : undefined;

  // Forward only the GraphQL fields; never forward client-supplied headers.
  const upstream = await kleverFetch(
    JSON.stringify({ query: parsed.query, variables, ...(operationName ? { operationName } : {}) }),
    token,
  );

  if (upstream.status === 0) return errorResponse(502, "The API could not be reached.", "network");
  if (!upstream.contentType?.includes("json")) {
    return errorResponse(502, `The API returned HTTP ${upstream.status} without a GraphQL response.`, "gateway");
  }

  const response = new NextResponse(upstream.text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

  // Audit trail: every change made through the app is recorded (the backend audits only its own
  // platform-settings change). Saved after the response is sent.
  if (upstream.status === 200 && /\bmutation\b/.test(parsed.query)) {
    let data: Record<string, unknown> | null = null;
    try {
      data = (JSON.parse(upstream.text) as { data?: Record<string, unknown> | null }).data ?? null;
    } catch {
      data = null;
    }
    const entries = mutationAuditEntries(parsed.query, variables, data, operationName);
    console.info("[audit-debug]", entries.length, JSON.stringify(entries).slice(0, 200));
    if (entries.length) {
      const picked = request.headers.get("x-kt-company");
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
      // Started now (not awaited, so the page doesn't wait); after() keeps the server alive until it's done.
      const saving = writeAuditEntries(token, entries, picked && /^\d+$/.test(picked) ? picked : null, ip);
      after(() => saving);
    }
  }

  if (isUnauthenticatedBody(upstream.text)) {
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(USER_COOKIE);
  }
  return response;
}
