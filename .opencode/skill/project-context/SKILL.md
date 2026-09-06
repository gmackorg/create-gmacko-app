---
name: project-context
description: Understand the create-gmacko-app template structure and patterns
---

# Project Context Skill

Use this skill to understand the create-gmacko-app template structure.

## Architecture Overview

This is a T3 Turbo monorepo fork rebuilt around one Cloudflare Worker per stage:

- **Apps**: `apps/web` (TanStack Start + Effect `HttpApi` on Workers, D1 database), `apps/expo` (React Native)
- **Core Packages**: `domain` (the `HttpApi` contract), `api` (services + handlers), `api-client` (typed client + TanStack Query layer), `db` (Drizzle over D1), `auth` (better-auth), `ui`, `config`
- **Operator lane** (optional): `operator-core`, `api-cli`, `mcp-server` over the same contract
- **Integration Packages**: analytics, monitoring, payments, billing, purchases, email, notifications, realtime (Node-only), storage, telemetry, logging

Read `AGENTS.md` first: its "Local Development" section explains how the Worker gets its variables, and "App Invariants" lists the rules `pnpm check:standards` enforces. The decision record is `docs/adr/0001-tanstack-effect-d1.md`.

## Key Files

### Configuration

- `packages/config/src/integrations.ts` - Single source of truth for enabled integrations
- `gmacko.integrations.json` - Scaffold-time manifest (read-only reference)
- `.env.example` - Environment variables documentation (the repo-root `.env` is linked into `apps/web/.env`; never create `apps/web/.dev.vars`)
- `apps/web/src/server/config.ts` - `AppConfig.fromBindings`, the only reader of Worker bindings
- `apps/web/src/env.ts` - Browser-visible `VITE_*` values
- `apps/web/wrangler.jsonc` - Worker names, D1 binding `DB`, and vars per environment

### Database

- `packages/db/src/database.ts` - The `Database` Effect service (`db`, `sql`, `first`, `batch`, `updateWhere`, `ping`, `plain`) over `@effect/sql-d1`
- `packages/db/src/schema.ts` - Drizzle SQLite schema (explicit snake_case column names via `columns.ts`)
- `packages/db/src/auth-schema.ts` - better-auth tables, hand-maintained; `pnpm auth:generate` writes the CLI output to `packages/db/.cache/auth-schema.generated.ts` for reconciliation
- `packages/db/drizzle.config.ts` - drizzle-kit config; `packages/db/migrations/*.sql` is what D1 applies
- `docs/drizzle-migrations.md` - Expand/contract rules, `Database.batch` and guarded writes

### Contract and API

- `packages/domain/src/api.ts` - `AppApi`: every `HttpApiGroup` (health, auth, posts, settings, admin)
- `packages/domain/src/<group>/{api,models}.ts` - Endpoints and `Schema` models per group
- `packages/domain/src/security.ts` - `Session`, `SessionOrKey(scope)`; `roles.ts` - `AdminOnly`, `WorkspaceRole`; `middleware.ts` - `RateLimit`, `EndpointBoundary`
- `packages/api/src/layer.ts` - `ApiLive`: services + handler groups
- `packages/api/src/handler.ts` - `makeWebHandler` (`HttpRouter.toWebHandler`)
- `packages/api/src/<group>/{service,handlers}.ts` - Effect service and `HttpApiBuilder.group` per group
- `packages/api/src/testing.ts` - `makeTestApi` for in-process API tests
- `docs/API_AUTH.md` - Generated credential matrix (`pnpm -F @gmacko/domain docs:api-auth`)

### Client

- `packages/api-client/src/client.ts` - `makeApiClient` (HttpApiClient transport)
- `packages/api-client/src/queries/` - `makeQueries`, `makeMutations`, `queryKeys`, `invalidation`, `makeQueryClient`
- `apps/web/src/lib/api.ts` - Isomorphic client: in-process on the server, `fetch` in the browser; exports `queries`, `mutations`
- `apps/expo/src/utils/api.ts` - Expo client over the better-auth Expo cookie

### Authentication

- `packages/auth/src/index.ts` - `makeAuth` (magic link, generic OAuth for GitHub/Google, Apple, Expo, OAuth proxy)
- `packages/auth/src/middleware.ts` - Implements the contract's security middleware
- `packages/auth/src/api-keys.ts` - `gmk_` keys hashed with WebCrypto, scopes `read|write|delete|admin`
- `apps/web/src/server/auth.ts` - The app's auth layer (`tanstackStartCookies`)
- `apps/expo/src/utils/auth.ts` - Expo auth client

### Worker

- `apps/web/src/server/worker.ts` - `fetch` + `scheduled`, wrapped in Sentry's `withSentry`
- `apps/web/src/server/runtime.ts` - The only importer of `cloudflare:workers`; builds the `ManagedRuntime`
- `apps/web/src/server/headers.ts` - Security headers and CSP nonce middleware
- `apps/web/src/server/actions.ts` - The only `createServerFn` file (cookies and redirects)
- `apps/web/src/routes/` - TanStack Start file routes; `api.$.ts` mounts the `HttpApi`, `api.webhooks.stripe.ts` the Stripe webhook

### Providers (Conditional)

- `apps/web/src/providers.tsx` - Web provider wiring
- `apps/expo/src/providers.tsx` - Native provider wiring

## Integration Toggle Pattern

All integrations follow this pattern:

1. Check `integrations.<name>` from `@gmacko/config`
2. If disabled: no initialization, no env vars required, no runtime code
3. If enabled: wrap with provider, require env vars

Example:

```typescript
import { integrations } from "@gmacko/config";

if (integrations.posthog) {
  // Initialize PostHog
}
```

## Common Tasks

### Adding a new feature

1. Check if it belongs in an existing package or needs a new one
2. If integration-specific, follow the toggle pattern
3. Add bindings to `AppConfig.fromBindings` (server) or `src/env.ts` (browser); never read `process.env` in the Worker bundle
4. Run `pnpm check:fast` to verify

### Modifying database schema

1. Edit `packages/db/src/schema.ts`
2. Run `pnpm db:generate` to generate the migration, then review the SQL (expand/contract only, no `__new_` tables; see `docs/drizzle-migrations.md`)
3. Run `pnpm db:migrate:local` to apply it to the local D1, then `pnpm -F @gmacko/db test:workers`

### Adding a new API endpoint

1. Declare it in `packages/domain/src/<group>/api.ts` with exactly one credential (`Session`, `SessionOrKey(scope)`, or public)
2. Implement it in `packages/api/src/<group>/` (service + handler) and register in `layer.ts`
3. Add `queryOptions`/`mutationOptions` and invalidation in `packages/api-client/src/queries/`
4. Regenerate `docs/API_AUTH.md`; use it in the apps via `queries`/`mutations`

### Running things

- `pnpm dev` (emulate + web at `https://gmacko.localhost`), `pnpm dev:mobile`
- `pnpm test`, `pnpm test:workers` (Miniflare D1), `pnpm e2e:web` (Playwright)
- `pnpm deploy:staging` (migrate, then `wrangler deploy`); see `docs/DEPLOYMENT.md`
