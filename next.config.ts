import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The push service worker must always be re-fetched, so a new version takes effect.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  async redirects() {
    // Old links keep working. Account & settings moved to short addresses (/en/users instead of
    // /en/masters/account-management/users).
    return [
      {
        source: "/:locale(en|ar)/masters/account-management/:path+",
        destination: "/:locale/:path+",
        permanent: false,
      },
      {
        source: "/:locale(en|ar)/masters/account-management",
        destination: "/:locale/accounts",
        permanent: false,
      },
      // Vehicles moved the same way (/en/vehicles instead of /en/masters/vehicle-management/vehicles).
      {
        source: "/:locale(en|ar)/masters/vehicle-management/:path+",
        destination: "/:locale/:path+",
        permanent: false,
      },
      {
        source: "/:locale(en|ar)/masters/vehicle-management",
        destination: "/:locale/vehicles",
        permanent: false,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
