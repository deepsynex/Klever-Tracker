import "server-only";

const DEFAULT_GRAPHQL_URL = "https://tiretracker.klever.ae/graphql";

const basicUser = process.env.KLEVER_BASIC_AUTH_USER ?? "";
const basicPass = process.env.KLEVER_BASIC_AUTH_PASSWORD ?? "";

export const env = {
  graphqlUrl: process.env.KLEVER_GRAPHQL_URL || DEFAULT_GRAPHQL_URL,
  /**
   * HTTP basic-auth header for the server lock in front of the API (api-alignment.md B1).
   * Only sent on requests without a bearer token, because both use the Authorization header.
   */
  basicAuthHeader: basicUser ? `Basic ${Buffer.from(`${basicUser}:${basicPass}`, "utf8").toString("base64")}` : null,
  /** Mock API for local development. Never active in production builds. */
  mock: process.env.KLEVER_MOCK === "true" && process.env.NODE_ENV !== "production",
  allowedOrigins: (process.env.APP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  isProduction: process.env.NODE_ENV === "production",
};
