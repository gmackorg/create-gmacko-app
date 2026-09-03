# ADR 0001: Web lane on TanStack Start + Effect 4 + Cloudflare D1

- Status: Accepted (Phase 0 spikes complete, 2026-09-03)
- Plan: `docs/plans/2026-09-02-tanstack-effect-d1-migration.html` (https://ao98zs9lxlq2.postplan.dev)
- Branch: `migrate/tanstack-effect-d1`

## Decision

The web app moves from Next.js + tRPC + Postgres to a single Cloudflare Worker: TanStack Start
for rendering and routing, Effect 4 for the service and API layer (`HttpApi` as the one contract),
and D1 as the database accessed through Drizzle's native Effect API over `@effect/sql-d1`.
The legacy stack lives under `packages/legacy-*` and `apps/nextjs` until the cutover merge
(plan Phase 8), then is deleted.

Why D1 rather than Postgres via Hyperdrive, and the Postgres floor if D1 fails, are recorded in the
plan's Overview. Every Phase 0 kill criterion passed, so no fallback is in use.

## Pinned versions (pnpm catalog)

| Package | Version | Note |
| --- | --- | --- |
| `effect` | 4.0.0-rc.112 | `Context.Service`, `effect/unstable/{httpapi,http,sql,schema,observability}` |
| `@effect/sql-d1`, `@effect/sql-sqlite-node` | 4.0.0-rc.112 | D1 driver; sqlite-node only for the in-memory test layer |
| `drizzle-orm` | 1.0.0-rc.5-169397b (dist-tag `rc5`) | rc.4 fails at import against effect rc.112 (`Schema.TaggedErrorClass`) |
| `drizzle-kit` | 1.0.0-rc.5-ab785fc | writes `<out>/<ts>_<slug>/migration.sql`; flattened for wrangler |
| `@cloudflare/vite-plugin` | 1.54.3 | honours a custom `main` with TanStack Start |
| `wrangler` | 4.128.0 | loads `.env` natively; `nodejs_compat` default-on for compat date >= 2026-08-04 |
| `@cloudflare/vitest-pool-workers` | 0.22.0 | `cloudflareTest` Vite plugin; pins miniflare 5.20260815.0-alpha |
| `@tanstack/react-start` / `react-router` / `react-router-ssr-query` | 1.168.49 / 1.170.32 / 1.167.2 | ssr-query requires `@tanstack/react-query` >= 5.102 |
| `better-auth`, `@better-auth/expo` | 1.7.2 | published release; both `pkg.pr.new` overrides removed |
| `@sentry/cloudflare` | 10.73.0 | `withSentry((env) => options, handler)` |

## Kill criteria and outcomes

| Criterion | Outcome | Evidence |
| --- | --- | --- |
| Effect 4 RC `HttpApi` serves on workerd; in-process transport works | PASS | `GET /api/health/live` 200 from `wrangler dev`; loader-side `HttpApiClient` over `HttpClient.make` hits the handler with no network hop, cookie forwarded (vitest `local-transport.test.ts`) |
| Drizzle Effect D1 driver: `.returning()`, batch, relational queries, `DatabaseError` wrapper keeps inferred types | PASS | `@gmacko/db` shared suite: 13 tests on sqlite-node, 11 on Miniflare D1; `db.transaction` removed at type level and dies at runtime |
| D1 itself: sign-in round trip, guarded writes, batch atomicity on local D1 | PASS | magic link + GitHub (genericOAuth via emulate) sessions on workerd; `updateWhere` returns 1 then 0; failing second statement rolls back the first on D1 |
| better-auth from a published version with Expo, magic link, TanStack cookie plugins | PASS | 1.7.2 loads and serves on workerd; `account.issuer` column added by migration `20260903035551_auth_1_7_issuer` |
| Custom Worker entry honoured by the Vite plugin | PASS | `src/server/worker.ts` exports `fetch` + `scheduled`, wrapped in `withSentry`; `GET /cdn-cgi/handler/scheduled` logs `cron tick` through the shared `ManagedRuntime` |
| `waitUntil` reachable from a handler | PASS | `Background.run` from `cloudflare:workers` `waitUntil`; OTLP flush completes after the response |
| OTLP export from a Worker | PASS | spans `http.server GET /api/health/ready`, `sql.execute` received by a local collector; `effect/unstable/observability` `Otlp.layerJson`, flushed via `OtlpExporter.Flusher` |
| Bundle size | RECORDED | 1,010,731 B gzipped at Spike A with the legacy tRPC/better-auth/postgres chain still bundled; expected to fall through Phases 2 to 6 |

## Deviations from the plan discovered in Phase 0

- Drizzle's Effect flavour has no `db.batch`; `Database.batch` converts builders via `toSQL()` into statements for `D1Client.batch`, and results are raw D1 rows. `Database.updateWhere` (guarded writes) counts `RETURNING` rows so it behaves identically on D1 and sqlite-node.
- `Model` lives at `effect/unstable/schema`, not `effect/unstable/sql`; the web handler is `HttpRouter.toWebHandler` (there is no `HttpApiBuilder.toWebHandler`) with `Etag.layer`, `HttpPlatform.layer`, `FileSystem.layerNoop`, `Path.layer`.
- `Database.layerTest` is exported from `@gmacko/db/testing` rather than as a static, because `node:sqlite`/`node:fs` cannot enter the Worker bundle.
- The old better-auth pin was the tip of an open upstream PR (#8814, OAuth endpoint overrides), not a released fix. The published path is the `genericOAuth` plugin for GitHub and Google with env-overridable URLs and real defaults; Apple keeps the built-in provider with only `authorizationEndpoint` overridable, so emulate cannot drive the Apple web flow. In 1.7.2 generic providers register as first-class social providers, so clients still call `signIn.social`.
- `@effect/opentelemetry` is not needed; the OTLP layers in `effect/unstable/observability` are fetch-based and Workers-safe. `Otlp.layer` takes `baseUrl`.
- Wrangler reads `.env` only from the app directory; until `apps/web/src/env.ts` stops reading `process.env` (Phase 5) the `dev` script bridges with `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` on top of `dotenv -e ../../.env`.
- `pool-workers` 0.22 caps the compatibility date below `wrangler.jsonc`'s, so the Workers vitest config carries an inline D1 binding and must track `wrangler.jsonc` by hand.
- The Effect D1 driver ignores `casing`; every column carries an explicit snake_case name. `@effect/sql-d1` does not classify errors, so `DatabaseError.reason` on D1 is derived from the SQLite message.
- `Model.Class` adoption and the remaining hardening moved to Phase 9 (plan decision D1).

## D1 migration constraint (found 2026-09-03)

D1 runs each migration file as one batch and does **not** honour `PRAGMA foreign_keys=OFF`
inside it (`PRAGMA foreign_keys` still reads 1). drizzle-kit's table rebuild pattern
(`CREATE TABLE __new_x; INSERT … SELECT; DROP TABLE x; ALTER TABLE __new_x RENAME TO x`)
therefore runs `DROP TABLE` with foreign keys on and cascade-deletes every referencing row.
Pinned by `packages/db/src/__tests__/migrations.workers.test.ts`. Rules from now on:

- Expand/contract only: add nullable or defaulted columns, backfill, tighten later; new table plus
  copy instead of drop-and-recreate; never rebuild a table that is the target of `ON DELETE CASCADE`.
- Review every drizzle-kit output for `__new_` tables before committing it.
- `20260903035551_auth_1_7_issuer.sql` was safe only because no database had rows; it must not
  be used as a template.

## Consequences

- No interactive transactions anywhere in app code; a standards rule forbids `db.transaction` and `withTransaction`.
- Two Drizzle majors coexist in the workspace (legacy 0.45, rc5) until Phase 8; `apps/web` excludes `drizzle-orm` from the SSR dep optimizer to keep the right one.
- `apps/web` and every new package depend on `@gmacko/domain` (Phase 1) for the contract; nothing depends on `packages/legacy-*` except `apps/nextjs` and, transiently, the tRPC routes still mounted in `apps/web`.
