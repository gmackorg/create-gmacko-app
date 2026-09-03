# Contributing to create-gmacko-app

Thanks for your interest in contributing! This document covers the development workflow and conventions for the monorepo.

## Prerequisites

- [Node.js](https://nodejs.org/) 24 (`package.json#engines`)
- [pnpm](https://pnpm.io/) 10.32+
- No database server: the web app uses a local Cloudflare D1 (Miniflare) under `apps/web/.wrangler/state`

## Getting Started

```bash
# Clone the repo
git clone https://github.com/gmackie/create-gmacko-app.git
cd create-gmacko-app

# Install dependencies
pnpm install

# Write .env for the local emulators (or copy .env.example by hand)
pnpm bootstrap:local

# Apply the D1 migrations to the local database and seed the defaults
pnpm db:migrate:local
pnpm db:seed

# Start emulate (GitHub/Google/Apple/Stripe/Resend) + the web app at https://gmacko.localhost
pnpm dev
```

`AGENTS.md` ("Local Development") explains how the Worker reads `.env` through the `apps/web/.env` link and why `apps/web/.dev.vars` must never be created.

## Monorepo Structure

```
apps/
  web/             # TanStack Start + Effect HttpApi on Cloudflare Workers
  expo/            # React Native mobile app
packages/
  domain/          # HttpApi contract: groups, Schema models, security declarations
  api/             # Effect services + HttpApiBuilder handlers
  api-client/      # Typed client + TanStack Query queries/mutations
  db/              # Drizzle (Effect API) over D1; migrations/
  auth/            # better-auth configuration and security middleware
  ui/              # Shared UI components (shadcn) + Storybook
  config/          # Feature flags & integration config
  operator-core/   # Operator lane: shared logic over api-client
  api-cli/         # Operator lane: CLI
  mcp-server/      # Operator lane: MCP server
  email/           # Transactional email
  i18n/            # Internationalization
  logging/         # Structured logging (Effect logger, JSON)
  telemetry/       # OTLP traces, logs, metrics
  monitoring/      # Sentry integration
  analytics/       # PostHog analytics
  payments/        # Stripe
  billing/         # Plans, limits, metering
  purchases/       # RevenueCat
  notifications/   # Expo push
  realtime/        # ioredis + BullMQ (Node-only)
  storage/         # File storage
  flags/           # Feature flag system
  settings/        # Settings schemas
  create-gmacko-app/ # The scaffolder CLI
sdks/
  openapi/         # OpenAPI spec generated from the contract
tooling/
  github/          # Shared GitHub Actions setup
  openapi-generator/
  tailwind/        # Shared Tailwind config
  typescript/      # Shared tsconfig
  vitest/          # Shared Vitest config
```

## Development Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start emulate + the web app (portless) |
| `pnpm dev:app` | Start the web app only (`http://localhost:3001`, no portless) |
| `pnpm dev:mobile` | Start the Expo dev client |
| `pnpm build` | Build all packages |
| `pnpm lint` | Lint all packages |
| `pnpm lint:fix` | Lint and auto-fix |
| `pnpm format:check` | Check formatting (biome) |
| `pnpm format:fix` | Fix formatting |
| `pnpm typecheck` | Type-check all packages |
| `pnpm check:standards` | App invariants (`scripts/check-app-standards.mjs`) |
| `pnpm check:fast` | lint + typecheck + check:standards |
| `pnpm test` | Run unit tests |
| `pnpm test:workers` | Run the Workers (Miniflare D1) suites |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:coverage` | Run tests with coverage |
| `pnpm e2e:web` | Run Playwright E2E tests |
| `pnpm db:generate` | Generate a D1 migration from the schema (drizzle-kit + flatten) |
| `pnpm db:migrate:local` | Apply migrations to the local D1 (`wrangler d1 migrations apply --local`) |
| `pnpm db:migrate:remote` | Apply migrations to the stage's D1 (`--remote`) |
| `pnpm db:check` | Validate the migration snapshots (`drizzle-kit check`) |
| `pnpm db:seed` | Seed the local D1 with the default plans, meters, and settings |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm auth:generate` | Write better-auth's generated schema to `packages/db/.cache/auth-schema.generated.ts` for reconciliation into `packages/db/src/auth-schema.ts` |
| `pnpm cf-typegen` | Regenerate `apps/web/worker-configuration.d.ts` from `wrangler.jsonc` |

## Branching Strategy

- `main` — production-ready, protected
- `feature/*` — feature branches, PR into main
- `fix/*` — bug fix branches
- `claude/*` — AI-assisted development branches

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add user onboarding flow
fix: correct subscription sync on webhook retry
docs: update deployment guide
chore: bump dependencies
refactor: extract pagination utility
test: add unit tests for the settings service
```

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes with clear commits
3. Ensure `pnpm check:fast` and `pnpm test` pass
4. Open a PR with a description of what and why
5. CI runs lint, typecheck, standards, tests, and build; every PR also gets a preview Worker

## Adding a New Package

```bash
# Scaffold package.json, tsconfig.json and src/index.ts
pnpm turbo gen init
```

Reference `tooling/typescript` for the shared tsconfig. If `apps/web` will depend on the package, it ships inside the Worker bundle: no `process.env` reads (take options or `AppConfig`) and no Node-only imports; `pnpm check:standards --graph` lists the bundled set.

## Adding UI Components

```bash
# Uses shadcn to add components to @gmacko/ui
pnpm ui-add
```

Add or update stories in `packages/ui/src/**/*.stories.tsx`; run `pnpm --filter @gmacko/ui storybook`.

## Adding an API Endpoint

1. Declare it in the contract: `packages/domain/src/<group>/api.ts` (`HttpApiEndpoint`, Schema models in `models.ts`, and exactly one credential: nothing, `Session`, or `SessionOrKey(scope)`).
2. Implement it in `packages/api/src/<group>/` (service + `HttpApiBuilder.group` handler).
3. Add the `queryOptions`/`mutationOptions` and invalidation entry in `packages/api-client/src/queries/`.
4. Regenerate `docs/API_AUTH.md`: `pnpm -F @gmacko/domain docs:api-auth` (its test fails when stale).

## Database Changes

1. Modify `packages/db/src/schema.ts`
2. Generate the migration: `pnpm db:generate`, then review it (expand/contract
   only, no `__new_` tables; see `docs/drizzle-migrations.md`)
3. Apply it locally: `pnpm db:migrate:local`, then `pnpm -F @gmacko/db test:workers`
4. Update the seed if needed: `packages/db/src/seed.ts`, then `pnpm db:seed`

## Testing

- Unit tests use [Vitest](https://vitest.dev/) with shared config from `tooling/vitest`
- API tests run the `HttpApi` in-process against an in-memory SQLite (`makeTestApi` in `packages/api/src/testing.ts`); `*.workers.test.ts` suites run on Miniflare D1 (`pnpm test:workers`)
- E2E tests use [Playwright](https://playwright.dev/) for web (`apps/web/e2e`), [Maestro](https://maestro.mobile.dev/) for mobile (`apps/expo/.maestro`)
- Place test files next to source: `my-file.ts` → `my-file.test.ts`

## Code Style

- Formatting and import sorting are handled by biome (runs via the lefthook pre-commit hook)
- Linting uses oxlint
- TypeScript strict mode is enabled across all packages

### Dead code (`pnpm knip`)

`knip.json` runs with every rule on (unused files, dependencies, exports,
types, duplicate exports) plus `ignoreExportsUsedInFile`, so a helper that a
module uses itself may stay exported. What is switched off, and why:

- `ignoreDependencies: ["cloudflare"]` at the root — the `cloudflare` SDK is
  used through `wrangler`'s bundling, not imported.
- `ignoreBinaries: expo, eas, maestro, generate` — invoked from scripts via
  `npx`/`pnpx`, not installed as workspace bins.
- Per-workspace `ignoreDependencies` for optional peers that a package only
  references behind an integration flag: `expo` (`packages/notifications`),
  `react-native` (`packages/purchases`), `@vitejs/plugin-react`
  (`tooling/vitest`), plus `tsx` in the operator packages (run through
  `pnpm exec tsx`) and the tailwind/coverage tooling deps.
- `apps/expo` ignores `src/components/locale-switcher.tsx` (kept as a drop-in
  example) and a handful of Metro/i18n deps that Expo resolves at bundle time.

A generic rule is never turned off to silence one finding: add a targeted
per-workspace ignore next to the ones above, with the reason, or delete the
dead code.
