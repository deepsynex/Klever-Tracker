import { NextResponse, type NextRequest } from "next/server";
import { isAllowedOrigin } from "@/lib/bff";
import { env } from "@/lib/env";
import { isUnauthenticatedBody } from "@/lib/graphql/errors";
import { kleverUpload } from "@/lib/graphql/klever";
import { SESSION_COOKIE, USER_COOKIE } from "@/lib/session-config";
import { isUploadPurpose, uploadProblem } from "@/lib/uploads";

function errorResponse(status: number, message: string, category: string) {
  return NextResponse.json({ errors: [{ message, extensions: { category } }] }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Same-origin file upload proxy: the browser posts `file` + `purpose` here, and this handler
 * forwards it to Klever's `uploadFile` with the bearer token from the session cookie, so the
 * token never reaches client-side JavaScript. Returns Klever's GraphQL response as-is.
 */
export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.headers.get("host"), env.allowedOrigins)) {
    return errorResponse(403, "Request origin not allowed.", "origin");
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value || (!env.isProduction ? process.env.DEV_AUTH_TOKEN : undefined);
  if (!token) return errorResponse(401, "Unauthenticated.", "authentication");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "Request body must be multipart form data.", "request");
  }
  const file = form.get("file");
  const purpose = form.get("purpose");
  if (!(file instanceof File) || !isUploadPurpose(purpose)) {
    return errorResponse(400, "Send a file and a valid purpose.", "request");
  }
  const problem = uploadProblem(file, purpose);
  if (problem) {
    return NextResponse.json(
      { errors: [{ message: `upload_${problem}`, extensions: { validation: { file: [`upload_${problem}`] } } }] },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const upstream = await kleverUpload(file, purpose, token);
  if (upstream.status === 0) return errorResponse(502, "The API could not be reached.", "network");
  if (!upstream.contentType?.includes("json")) {
    return errorResponse(502, `The API returned HTTP ${upstream.status} without a GraphQL response.`, "gateway");
  }

  const response = new NextResponse(upstream.text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  if (isUnauthenticatedBody(upstream.text)) {
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(USER_COOKIE);
  }
  return response;
}
