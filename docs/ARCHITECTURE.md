# Architecture & Conventions

This document describes the system architecture, design decisions, and conventions
used across all products built from the create-gmacko-app template. The decision
record is [`adr/0001-tanstack-effect-d1.md`](./adr/0001-tanstack-effect-d1.md).

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                               Clients                                │
│  TanStack Start (browser) · Expo · operator CLI / MCP server · SDKs   │
│                  all through @gmacko/api-client                      │
└──────────────┬──────────────────────┬────────────────────────────────┘
               │ SSR: in-process      │ fetch /api/*
               ▼                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    One Cloudflare Worker per stage                   │
│  fetch → withSentry → TanStack Start (router, CSP nonce middleware)  │
│    ├─ pages: route loaders call the API in-process (no network hop)  │
│    └─ /api/* → HttpRouter.toWebHandler → Effect HttpApi (@gmacko/api)│
│         EndpointBoundary → RateLimit → role check → credential →     │
│         handler → services (Posts, Settings, Admin, Health, Auth)    │
│  scheduled → cron on the same ManagedRuntime                         │
│  Background.run → waitUntil (telemetry flush, side effects)          │
└──────────────┬───────────────────────────────┬───────────────────────┘
               ▼                               ▼
┌──────────────────────────┐   ┌───────────────────────────────────────┐
│  Cloudflare D1 (SQLite)  │   │  External services                    │
│  Drizzle Effect API over │   │  Stripe · Resend · Sentry · PostHog · │
│  @effect/sql-d1          │   │  OTLP collector · OAuth providers     │
└──────────────────────────┘   └───────────────────────────────────────┘
```

## Design Principles

1. **Everything is an Effect service** — `AppConfig`, `Database`, `Auth`,
   `Background`, `RateLimiter`, `Posts`, `Settings`, and the rest are
   `Context.Service`s with `Layer`s. Handlers ask for services; only
   `apps/web/src/server/runtime.ts` knows the platform (`cloudflare:workers`).

2. **One contract** — `packages/domain` declares the `HttpApi` (paths, `Schema`
   models, typed errors, and the security middleware each endpoint takes).
   Handlers implement it, `@gmacko/api-client` consumes it, the OpenAPI spec and
   `docs/API_AUTH.md` are generated from it. Data never bypasses it: TanStack
   Start server functions exist only for setting a cookie or redirecting
   (`apps/web/src/server/actions.ts`).

3. **No interactive transactions** — D1 has none. Atomic multi-statement writes
   use `Database.batch([...])`; read-check-write uses a guarded write
   (`Database.updateWhere`, precondition in the `WHERE`, 0 rows = `Conflict`).
   `db.transaction` is removed at the type level and forbidden by
   `pnpm check:standards` (`no-db-transaction`).

4. **Expand/contract migrations** — forward-only, checked in, applied before the
   Worker deploys. A release adds columns (nullable or defaulted), tables, and
   indexes; it drops or renames one release after nothing deployed reads them.
   D1 ignores `PRAGMA foreign_keys=OFF` inside a migration, so table rebuilds
   are refused (`no-d1-table-rebuild`). See `drizzle-migrations.md`.

5. **Env is a service** — the Worker has no process environment. Bindings enter
   once through `AppConfig.fromBindings` (`apps/web/src/server/config.ts`);
   nothing in the Worker bundle reads `process.env` (`no-raw-process-env`).
   Locally the bindings come from the repo-root `.env` via the `apps/web/.env`
   link; in stages from wrangler vars and `pnpm secrets:push`.

6. **Observable by default** — JSON logs (`@gmacko/logging`) to Workers Logs,
   OTLP traces/logs/metrics (`@gmacko/telemetry`) flushed on `waitUntil`, one
   span per endpoint (`group.endpoint`) with `x-request-id` / `x-trace-id`
   response headers, Sentry on the Worker and in the browser.

7. **Security by default** — CSP with a per-request nonce, HSTS, every endpoint
   declares its credential, role checks read the database not the cookie cache,
   API keys hashed and scoped, rate limits declared per endpoint.

8. **Convention over configuration** — integrations toggle in
   `packages/config/src/integrations.ts`; disabled ones have no env vars and no
   runtime code paths.

## Package Dependency Rules

Workspace dependencies as declared in each `package.json` (`dependencies`;
`devDependencies` are test-only):

```
tooling/*                → no workspace deps
packages/config          → no workspace deps (leaf)
packages/domain          → no workspace deps (effect only)
packages/db              → no workspace deps (drizzle, @effect/sql-d1)
packages/logging         → no workspace deps
packages/telemetry       → @gmacko/logging
packages/auth            → @gmacko/db, @gmacko/domain
packages/api             → @gmacko/domain, @gmacko/db, @gmacko/auth, @gmacko/config, @gmacko/telemetry
packages/api-client      → @gmacko/domain
packages/ui              → no workspace deps
packages/{analytics,monitoring,i18n,notifications,purchases}
                         → @gmacko/config
packages/{email,payments,storage,realtime}
                         → @gmacko/config, @gmacko/logging
packages/operator-core   → @gmacko/api-client, @gmacko/domain
packages/{api-cli,mcp-server}
                         → @gmacko/operator-core
apps/web                 → api, api-client, auth, db, domain, payments, telemetry, ui, analytics
apps/expo                → api-client, domain, config, analytics, monitoring, i18n
```

Rules that follow:

- `domain` and `api-client` are the only packages a client may depend on; they
  carry no database, auth, or handler code.
- Everything reachable from `apps/web`'s `dependencies` ships in the Worker
  bundle (`pnpm check:standards --graph`): no `process.env`, no `node:` imports.
  `api-cli`, `mcp-server`, and `realtime` are Node-only and stay outside it.
- `Database.plain` (promise-based drizzle) is for the better-auth adapter only;
  everything else uses `Database.db` (`no-plain-drizzle-in-api`).

## Data Flow Patterns

### Request Lifecycle

1. Worker `fetch` (`apps/web/src/server/worker.ts`), wrapped in Sentry's
   `withSentry`.
2. TanStack Start request middleware (`src/server/headers.ts`): security
   headers, CSP nonce into router context.
3. `/api/*` routes to `HttpRouter.toWebHandler` over the `HttpApi`; pages run
   their loaders, which call the same handler in-process with the page
   request's cookie and client address forwarded (`src/lib/api.ts`).
4. HttpApi middleware chain, outermost first: `EndpointBoundary` (one span,
   `x-request-id`/`x-trace-id`, 500 for anything unhandled) → `RateLimit` (429
   with `Retry-After`) → role check (`AdminOnly`, `WorkspaceRole(min)`) →
   credential (`Session` or `SessionOrKey(scope)`, providing `CurrentUser`).
5. Handler → service → `Database` (D1) → typed success or declared error,
   encoded from the contract's `Schema`.
6. Telemetry flush handed to `waitUntil` through `Background`; the response
   returns without waiting.

### Background Work

- `Background.run(effect)` schedules work on `waitUntil` after the response.
- `scheduled` (cron in `wrangler.jsonc` `triggers.crons`) runs on the shared
  `ManagedRuntime` with the same services as the HTTP handlers.

### Webhooks

- `POST /api/webhooks/stripe` (`apps/web/src/routes/api.webhooks.stripe.ts`)
  verifies the signature with `@gmacko/payments` and acknowledges; a bad
  signature is 400, a missing secret 503.

## Multi-Tenancy Model

- Workspaces are the tenant boundary; memberships carry a role
  (`owner` > `admin` > `member`).
- `WorkspaceRole(min)` guards endpoints that act on the caller's current
  workspace; services scope queries by the workspace the middleware resolved.
- Deleting a user cascades sessions, accounts, API keys, and owned workspaces
  through the schema (`settings.deleteAccount`).

## Authentication & Authorization

### Authentication (better-auth 1.7)

- Session cookies (`better-auth.session_token`, `__Secure-` prefixed over https)
- Magic link; GitHub and Google through the generic OAuth plugin with
  env-overridable URLs (so emulate can serve them locally); Apple built in
- Expo plugin for the mobile client; OAuth proxy plugin for previews
- API keys (`gmk_…`) hashed with WebCrypto, scopes `read` / `write` / `delete` / `admin`

### Authorization

- Declared per endpoint in the contract; `docs/API_AUTH.md` is the generated matrix
- `AdminOnly` requires `user.role === "admin"`, read fresh from D1
- `WorkspaceRole(min)` requires at least `min` in the caller's workspace
- A key's `admin` scope does not grant the platform admin role

## Environment Strategy

| Environment | Worker | D1 | Config source | Observability |
|------------|--------|----|---------------|---------------|
| development | `vite dev` on workerd | local, `apps/web/.wrangler/state` | repo-root `.env` via `apps/web/.env` | debug logs; OTLP/Sentry/PostHog off unless set |
| preview | `gmacko-web-preview` (a version per PR) | shared `gmacko-web-preview` | wrangler `env.preview` vars + secrets | info logs, Sentry `preview` |
| staging | `gmacko-web-staging` | `gmacko-web-staging` | wrangler `env.staging` + `pnpm secrets:push --stage staging` | full |
| production | `gmacko-web` | `gmacko-web` | wrangler `env.production` + `pnpm secrets:push --stage production` | full; health responses redacted |

Deploys are migrate-then-deploy (`scripts/deploy-stage.mjs`), orchestrated by
ForgeGraph; see `DEPLOYMENT.md`.

## Key Decisions

The full record is [`adr/0001-tanstack-effect-d1.md`](./adr/0001-tanstack-effect-d1.md).
In short:

- **Effect `HttpApi` over tRPC** — one declarative contract yields the server,
  the typed client, OpenAPI, and the auth matrix; security and rate limits are
  declared per endpoint, not spread over procedure builders.
- **D1 over Postgres** — a database per stage with no server to run, native to
  the Worker, 30-day Time Travel; the cost is no interactive transactions and
  expand/contract-only migrations, both enforced by standards rules.
- **better-auth** — framework-agnostic auth shared by the web app, Expo, and
  the API-key path, from a published release (1.7.2).
- **Turborepo with pnpm workspaces** — incremental builds, shared tooling, one
  contract package consumed by every app.
