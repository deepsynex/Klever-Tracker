import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedOrigin } from "@/lib/bff";
import { env } from "@/lib/env";
import { kleverRequest } from "@/lib/graphql/klever";
import { parseHeatmapQuery } from "@/lib/heatmap/request";
import { buildHeatmap } from "@/lib/heatmap/service";
import { SESSION_COOKIE, SIGNED_OUT_COOKIE, devAuthToken, USER_COOKIE } from "@/lib/session-config";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/heatmap?vehicle_ids[]=1&from=…&to=…&weight_mode=dwell&zoom=12[&bbox=w,s,e,n]
 * Returns aggregated cells only; see src/lib/heatmap/service.ts.
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !isAllowedOrigin(origin, request.headers.get("host"), env.allowedOrigins)) {
    return NextResponse.json({ message: "Request origin not allowed." }, { status: 403, headers: NO_STORE });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value || devAuthToken(request.cookies.has(SIGNED_OUT_COOKIE));
  if (!token) return NextResponse.json({ message: "Unauthenticated." }, { status: 401, headers: NO_STORE });

  const parsed = parseHeatmapQuery(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json(
      { message: "The given data was invalid.", errors: parsed.errors },
      { status: 422, headers: NO_STORE },
    );
  }

  const scope = createHash("sha256").update(token).digest("hex").slice(0, 16);
  const outcome = await buildHeatmap(
    parsed.params,
    (query, variables) => kleverRequest(query, variables, { token }),
    scope,
  );

  const response = NextResponse.json(outcome.body, { status: outcome.status, headers: NO_STORE });
  if (outcome.status === 401) {
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(USER_COOKIE);
  }
  return response;
}
