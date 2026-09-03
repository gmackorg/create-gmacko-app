# Common brief for migration subagents

Worktree (work ONLY here): ~/.config/superpowers/worktrees/create-gmacko-app/migrate-tanstack-effect-d1
Branch: migrate/tanstack-effect-d1 (long-lived; commit your work with conventional-commit messages; do not push)
Plan extract (read first): docs/plans/briefs/plan-extract.md
Full plan (HTML, read specific phase tables if needed): docs/plans/2026-09-02-tanstack-effect-d1-migration.html

Repo conventions:
- pnpm 10 monorepo with turbo; versions for shared deps live in pnpm-workspace.yaml `catalog:`; add new shared deps to the catalog and reference them as "catalog:". After changing package.json files run `pnpm install` (NOT --frozen-lockfile).
- Lint: `pnpm lint:ox`, format: `pnpm format:check` (biome), typecheck: `pnpm typecheck` (turbo), tests: vitest (`pnpm -F <pkg> test`). Pre-commit hook runs biome + oxlint; make them pass.
- Read AGENTS.md for app invariants (no raw process.env in app src, health endpoints never leak internals in production, etc.).
- TypeScript strict; ESM ("type": "module").
- Do NOT touch apps/nextjs or packages/api's tRPC code unless the task says so; the two apps coexist until Phase 8.

Resolved versions (2026-09-02):
- effect 4.0.0-rc.112 (tag rc). Effect 4 idioms: `Context.Service` (not Context.Tag), `effect/unstable/httpapi` (HttpApi, HttpApiGroup, HttpApiEndpoint, HttpApiBuilder, HttpApiSchema, HttpApiSecurity, HttpApiMiddleware, HttpApiScalar), `effect/unstable/http` (HttpApp, HttpClient, HttpServerRequest...), `effect/unstable/sql` (SqlClient, Model, SqlError). Verify exact exports by reading node_modules/effect/dist or the .d.ts files; do not guess.
- @effect/sql-d1 4.0.0-rc.112, @effect/sql-sqlite-node 4.0.0-rc.112, @effect/opentelemetry 4.0.0-rc.112
- drizzle-orm 1.0.0-rc.4, drizzle-kit 1.0.0-rc.4 (rc.4 added @effect/sql-d1 driver support; find the exact subpath, e.g. drizzle-orm/effect-d1 or similar, by listing node_modules/drizzle-orm)
- @cloudflare/vite-plugin 1.54.3, wrangler 4.128.0, @cloudflare/workers-types 5.20260903.1, @cloudflare/vitest-pool-workers 0.22.0
- @tanstack/react-start 1.168.49, @tanstack/react-router 1.170.32, @tanstack/react-router-ssr-query 1.167.2, vite 8.2.2
- better-auth 1.7.2 (published; replaces the pkg.pr.new pin), @better-auth/expo 1.7.2
- @sentry/cloudflare 10.73.0, @sentry/react 10.73.0

Reporting: at the end, report (1) what you built, (2) exact commands you ran and their results, (3) files changed, (4) for each kill criterion in your task: PASS/FAIL with the evidence line, (5) anything you could not verify. Be precise; no claims without a command output backing them.
