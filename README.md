# Klever Tracker Web

Next.js frontend for the Klever Tracker GPS fleet platform. It talks to the existing **Klever Tracker GraphQL API** (Laravel + Lighthouse).

- Plan: [`../implementation-plan.md`](../implementation-plan.md), Phase 1 (Foundation, Auth & Users)
- API differences and backend requests: [`../api-alignment.md`](../api-alignment.md)
- Visual design: [`../design.md`](../design.md), [`../ui-demo.html`](../ui-demo.html)

## Getting started

Requires Node.js 24+.

```bash
npm install
cp .env.example .env.local     # then edit
npm run dev                    # http://localhost:3000
```

The real API currently sits behind an HTTP basic-auth lock (`api-alignment.md` B1). For sign-in, forgot and reset password, put that lock's credentials in `KLEVER_BASIC_AUTH_USER` / `KLEVER_BASIC_AUTH_PASSWORD`. They're sent only on requests without a login token, because the lock and the token share the `Authorization` header. Requests made after sign-in carry the token instead, so they stay blocked until the backend team removes the lock or switches it to an IP allow-list. Without credentials, set `KLEVER_MOCK=true` to develop against the built-in mock. Sign in with `admin@demo.test` / `Demo@12345`. The reset-password mock link is `/en/reset-password?token=demo-reset-token&email=admin@demo.test`. The mock is ignored in production builds.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright, against the mock API) |
| `npm run codegen` | Typed GraphQL documents from `schema.graphql` (once the backend shares it, B2) |

## How sign-in works

The Klever API issues a bearer token that never expires. The browser never sees it:

1. The login form calls a **Server Action** (`src/lib/auth/actions.ts`). It calls the `login` mutation and stores the token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production).
2. Browser data requests go to **`/api/graphql`** on the same origin (`src/app/api/graphql/route.ts`). The handler checks the `Origin` header, reads the cookie, adds `Authorization: Bearer …` and forwards the request to Klever.
3. Server Components call Klever directly with `kleverRequest()` (`src/lib/graphql/klever.ts`).
4. **`src/proxy.ts`** (Next.js 16's renamed middleware) sends signed-out visitors to `/[locale]/login?next=…`. It only checks that the cookie exists; the API authorises every request.
5. An `Unauthenticated.` response clears the cookie and sends the user back to login.

Logout clears the cookie. It can't revoke the token on the server until the backend adds a `logout` mutation (B4).

## Heatmap (`/heatmap`)

Shows where one or more vehicles spent their time over a period of up to 31 days (at most 50 vehicles).

The Klever API has no aggregate query, so the Next.js server builds the heatmap. **`GET /api/heatmap`** (`src/app/api/heatmap/route.ts`) validates the query (`src/lib/heatmap/request.ts`). It checks every vehicle against the company's own `vehicles` / `devices` lists, because Klever scopes by token. Then it pages through `positionHistory` 1,000 fixes at a time and aggregates on the server (`src/lib/heatmap/service.ts`, `aggregate.ts`). The browser only receives `{ total_points, cell_count, bounds, cells: [{ lat, lng, weight }] }`, capped at 5,000 cells. Fixes are cached per session for 5 minutes, so zooming re-aggregates without calling Klever again. Selections over 300,000 points get a 422 asking for a shorter period.

Before weighting, the server drops bad fixes: missing coordinates, `(0,0)`, and single-fix jumps that would need more than 300 km/h. Points are snapped to a grid of about 8 screen pixels at the current zoom. Each cell returns the centroid of its points and the sum of their weights.

| Weight mode | Weight of each GPS fix | Good for |
|---|---|---|
| `density` | 1 | Where the vehicle reported most. Busy roads show up as much as stops, because trackers report more often while moving. |
| `dwell` | Seconds until that vehicle's next fix (SQL: `LEAD(recorded_at) OVER (PARTITION BY vehicle ORDER BY recorded_at)`), **capped at 30 minutes** | Where the vehicle actually spent its time. The cap stops a tracker that was offline or asleep for hours from creating a fake hotspot at its last position. |
| `idle` | Same as `dwell`, but only for fixes with ignition on and speed below 3 km/h | Engine-on waiting: queues, drop-offs with the engine running, idling at sites. |

The map is Google Maps (`@vis.gl/react-google-maps`) with a deck.gl `HeatmapLayer` through `GoogleMapsOverlay`, not the deprecated `google.maps.visualization.HeatmapLayer`. The map refetches when the zoom settles on a level with a different grid size (debounced by 500 ms).

In mock mode (`KLEVER_MOCK=true`), `src/lib/heatmap/demo-tracks.ts` generates repeatable routes for vehicles 1–3 across Dubai and Sharjah from 1 September 2026 onward. They include parking and idling stops, traffic crawls, a three-hour device-offline gap (vehicle 2) and a few bad fixes (vehicle 3).

Not available yet: a company picker for platform staff (the API has no cross-company scope, A1). Passing `company_id` returns a 422.

## Project layout

```
src/
  app/
    [locale]/                 root layout (en | ar, sets dir), fonts, providers
      (auth)/                 login, forgot-password, reset-password
      (app)/                  signed-in shell (sidebar + top bar), dashboard
    api/graphql/route.ts      same-origin GraphQL proxy (BFF)
  components/                 ui/ primitives (shadcn/ui style), shell/, theme and locale switches
  i18n/                       next-intl routing, navigation, request config
  lib/
    auth/                     Server Actions and Zod schemas
    graphql/                  server client, browser client, error mapping, operations, mock
    session.ts                cookie helpers (server only)
  proxy.ts                    locale routing + optimistic auth redirect
messages/en.json, ar.json     all UI text
e2e/                          Playwright tests
```

## Conventions

- **Next.js 16 with Cache Components.** Anything that reads cookies, headers or search params renders inside `<Suspense>`. Read `node_modules/next/dist/docs/` before using an API you haven't used in this version.
- **Locale** comes from `next/root-params` (`[locale]` is the root segment). Use `Link`, `useRouter` and `redirect` from `@/i18n/navigation`.
- **Styling** uses the design tokens in `src/app/globals.css`. Use logical utilities (`ms-`, `pe-`, `start-`) so layouts flip for Arabic.
- **API rules from the Klever guide:** lists return `{ data, paginatorInfo }`; relations are plain IDs; JSON fields are strings; timestamps are UTC; another company's row returns `null`; a permission block returns `"Forbidden."`.
- **Errors** go through `classifyGraphQLErrors` / `classifyHttpResponse` and are shown with the `errors.*` messages.
