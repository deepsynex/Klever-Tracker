import { NextResponse } from "next/server";
import { kleverRequest } from "@/lib/graphql/klever";
import { SHARED_LOCATION_BY_TOKEN, type SharedLocationByTokenResult } from "@/lib/graphql/vehicle-management";

const TOKEN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Public position refresh for the /track page. It only ever runs the public
 * `sharedLiveLocationByToken` query, without any bearer token, so it can't reach anything a
 * share link itself doesn't expose. Returns `{ link }`, null when the link is unknown or expired.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/track/[token]">) {
  const { token } = await params;
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (!TOKEN.test(token)) return NextResponse.json({ link: null }, { headers });

  const result = await kleverRequest<SharedLocationByTokenResult>(SHARED_LOCATION_BY_TOKEN, { shareToken: token });
  if (!result.ok) return NextResponse.json({ error: result.error.kind }, { status: 502, headers });
  return NextResponse.json({ link: result.data.sharedLiveLocationByToken }, { headers });
}
