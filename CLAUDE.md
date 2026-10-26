# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Klever Tracker Web: a Next.js 16 (App Router, React 19, Cache Components) frontend for the Klever Tracker GPS fleet platform. It has no backend of its own. It talks to an existing Laravel + Lighthouse **GraphQL API**. Planning docs live one level up, outside this folder: `../implementation-plan.md` (the current phase), `../api-alignment.md` (known API gaps, cited in code as B1, B2, B4 and so on) and `../design.md` / `../ui-demo.html` (visual design).

## Commands

Node.js 24+ is required.

```bash
npm run dev                    # dev server on :3000
npm run build                  # production build
npm run lint                   # ESLint
npm run typecheck              # next typegen (route types like LayoutProps<"/[locale]">) + tsc --noEmit
npm test                       # Vitest unit tests (src/**/*.test.ts[x], node environment)
npx vitest run src/lib/bff.test.ts           # a single test file
npx vitest run -t "safeNextPath"             # tests matching a name
npm run test:e2e               # Playwright; starts `next dev` on :3100 with KLEVER_MOCK=true
npx playwright test e2e/auth.spec.ts -g "login"   # a single e2e test
npm run codegen                # typed GraphQL docs into src/gql/ (needs ./schema.graphql, not available yet)
npm run format                 # Prettier (printWidth 120, double quotes, trailing commas)
```

Locally, Playwright runs in the installed Chrome (`channel: "chrome"`) and reuses a dev server that is already running on :3100.

## Local API access

Configure `.env.local` from `.env.example`. With `KLEVER_MOCK=true`, `src/lib/graphql/mock.ts` answers the auth operations instead of the real API. It is never active in production builds. Sign in with `admin@demo.test` / `Demo@12345`. The reset link is `/en/reset-password?token=demo-reset-token&email=admin@demo.test`. The mock matches operations by regex on the query text, so any new operation you need during development must be added there too.

The real API sits behind an HTTP basic-auth lock (B1). `KLEVER_BASIC_AUTH_USER` / `KLEVER_BASIC_AUTH_PASSWORD` are sent **only on requests without a bearer token**, because both use the `Authorization` header. As a result, requests made after sign-in to the real API stay blocked until the backend removes the lock.

## Architecture: auth and data flow (BFF)

The Klever bearer token never expires and must never reach browser JavaScript.

- **Sign-in and password reset** are Server Actions in `src/lib/auth/actions.ts`. They validate with Zod (`schemas.ts`), call `kleverRequest()`, and store the token in an HttpOnly cookie (`kt_session`) plus a display-only user cookie (`kt_user`) through `src/lib/session.ts`. They return a `FormState` whose `error` / `fields` values are **translation keys** (`errors.*`, `validation.*`, or `server:<message>`), not display text.
- **Server Components and Actions** call Klever directly with `kleverRequest<T>()` in `src/lib/graphql/klever.ts` (`server-only`). Pass `{ token }` taken from `getSessionToken()`.
- **Client components** use `gqlRequest<T>()` in `src/lib/graphql/client.ts` as the TanStack Query `queryFn` / `mutationFn`. It posts to the same-origin `/api/graphql` (`src/app/api/graphql/route.ts`). That route checks `Origin` (helpers in `src/lib/bff.ts`), attaches the bearer token from the cookie, forwards only `query`, `variables` and `operationName`, and clears the cookies when the response is `Unauthenticated.`. When the client receives an unauthenticated response, it does a full page load to `/{locale}/login?next=…`.
- **`src/proxy.ts`** is Next.js 16's renamed middleware. It runs next-intl locale routing and an *optimistic* redirect based only on whether the cookie exists. The API does the real authorisation. Public paths are listed in `src/lib/session-config.ts`. That file must stay free of `server-only` imports, because proxy.ts imports it.
- **Errors**: every upstream response goes through `classifyHttpResponse` / `classifyGraphQLErrors` (`src/lib/graphql/errors.ts`), which maps it to an `ApiErrorKind` (`invalid_credentials`, `unauthenticated`, `forbidden`, `validation`, `api_locked`, …). The UI shows each kind through `errors.<kind>` messages. `Providers` disables query retries for kinds that a retry can't fix.
- **GraphQL operations** are hand-typed strings with result and variable types in `src/lib/graphql/operations.ts`. Once the backend shares `schema.graphql` (B2), switch to the codegen `graphql()` documents in `src/gql/`.

## Conventions

- **Cache Components is on** (`cacheComponents: true`). Anything that reads cookies, headers or search params must render inside `<Suspense>`. Check `node_modules/next/dist/docs/` before using an API you haven't used in this version.
- **i18n**: the locales are `en` and `ar` (RTL), always prefixed. `[locale]` is the root segment, so read the locale with `next/root-params` (`locale()`), not from params. Use `Link`, `useRouter` and `redirect` from `@/i18n/navigation`. All UI text belongs in `messages/en.json` and `messages/ar.json`, so add every key to both. The time zone is `Asia/Dubai`.
- **Styling**: Tailwind v4 with design tokens in `src/app/globals.css`, and shadcn-style primitives in `src/components/ui/`. Use logical utilities (`ms-`, `pe-`, `start-`, `end-`) so layouts flip for Arabic.
- **Route groups**: `(auth)` holds the public auth pages. `(app)` holds the signed-in shell (sidebar and top bar).
- **Klever API rules**: lists return `{ data, paginatorInfo }`; relations are plain IDs; JSON fields are strings; timestamps are UTC; another company's row comes back as `null`; a permission block returns `"Forbidden."`.
- Keep pure logic (origin checks, redirect sanitising, error mapping, schemas) in plain modules so Vitest can test it without Next.js.
