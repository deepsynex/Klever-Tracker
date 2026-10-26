import "server-only";

/**
 * Minimal stand-in for the Klever API, used only when KLEVER_MOCK=true in development.
 * It answers the documented auth operations so the UI can be built and tested while the
 * real endpoint is unreachable (api-alignment.md B1). Responses mirror the guide's wording.
 */

export const MOCK_USER = { id: "1", name: "Mariam Al Hashimi", email: "admin@demo.test" };
export const MOCK_PASSWORD = "Demo@12345";
export const MOCK_RESET_TOKEN = "demo-reset-token";
const MOCK_TOKEN = "mock-token-1";

type Body = { query?: string; variables?: Record<string, unknown> };

function json(status: number, payload: unknown) {
  return { status, text: JSON.stringify(payload), contentType: "application/json" };
}

function error(message: string, extensions: Record<string, unknown> = {}) {
  return json(200, { errors: [{ message, extensions }] });
}

export async function mockFetch(rawBody: string, token?: string) {
  let body: Body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return error("Syntax Error: invalid JSON body.");
  }
  const query = body.query ?? "";
  const vars = body.variables ?? {};

  // Small delay so loading states are visible during development.
  await new Promise((r) => setTimeout(r, 300));

  if (/\bping\b/.test(query)) {
    return json(200, { data: { ping: "Klever Tracker GraphQL API is up. (mock)" } });
  }

  if (/\blogin\s*\(/.test(query)) {
    if (vars.email === MOCK_USER.email && vars.password === MOCK_PASSWORD) {
      return json(200, { data: { login: { token: MOCK_TOKEN, user: MOCK_USER } } });
    }
    return error("Invalid credentials.");
  }

  if (/\bforgotPassword\s*\(/.test(query)) {
    return json(200, { data: { forgotPassword: true } });
  }

  if (/\bresetPassword\s*\(/.test(query)) {
    if (vars.token !== MOCK_RESET_TOKEN || vars.email !== MOCK_USER.email) {
      return error("This password reset token is invalid.");
    }
    return json(200, { data: { resetPassword: true } });
  }

  if (token !== MOCK_TOKEN) {
    return error("Unauthenticated.", { category: "authentication" });
  }

  return error("This operation isn't available in mock mode yet.");
}
