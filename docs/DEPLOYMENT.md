# Deployment

The web app (`apps/web`, TanStack Start + Effect) deploys as one Cloudflare
Worker per stage with a D1 database per stage. ForgeGraph orchestrates the
deploys and holds the stage secrets; the repo owns the sequence. This page is
the operating guide for that lane; the D1 procedures (export, Time Travel,
copy, size) are in [`RUNBOOK.md`](./RUNBOOK.md) and the migration rules in
[`drizzle-migrations.md`](./drizzle-migrations.md).

> The previous web lane (a Node app with Postgres on a VPS node) was removed
> in Phase 8 of the migration; its notes live in `docs/legacy/`.

## The shape

| Stage | Worker | wrangler env | D1 | Who deploys |
| --- | --- | --- | --- | --- |
| development | `vite dev` on workerd | (none) | local, `apps/web/.wrangler/state` | you: `pnpm dev` |
| preview | `gmacko-web-preview` (a version per PR) | `preview` | shared `gmacko-web-preview` | `.github/workflows/preview.yml`, per PR |
| staging | `gmacko-web-staging` | `staging` | `gmacko-web-staging` | ForgeGraph (`pnpm forge:deploy:staging`) or `pnpm deploy:staging` |
| production | `gmacko-web` | `production` | `gmacko-web` | ForgeGraph (`pnpm forge:deploy:production`) or `pnpm deploy:production` |

`apps/web/wrangler.jsonc` declares the four environments: `STAGE` is a
wrangler var per environment and drives cookie security, Scalar docs
exposure, health-response redaction and the log level (`AppConfig.stage`);
`env.<stage>.d1_databases[0].database_id` holds the database id.

## Migrate, then deploy

Every stage deploy is the same two steps, in this order, and the second never
runs if the first fails:

```bash
pnpm deploy:staging        # node scripts/deploy-stage.mjs --stage staging
pnpm deploy:production
```

1. `pnpm -F @gmacko/db migrate:remote --env <stage>` — `wrangler d1 migrations
   apply` on the stage's database. Migrations are checked in
   (`packages/db/migrations`), forward-only, and tracked by D1 in its
   `d1_migrations` table, so re-running is a no-op.
2. `pnpm -F @gmacko/web deploy:<stage>` — `CLOUDFLARE_ENV=<stage> vite build`
   then `wrangler deploy` on the config the Vite plugin generated for that
   environment (`dist/server/wrangler.json`).

The order is what makes the expand/contract rule safe: the new schema is in
place before the new code reads it, and the old code (still serving during
the deploy) only sees additions.

### Expand/contract

A release may **add** columns (nullable or defaulted), tables and indexes. It
may **drop or rename** something only one release after no deployed code
references it. D1 runs a migration file as one batch with foreign keys on and
ignores `PRAGMA foreign_keys=OFF`, so drizzle-kit's table-rebuild recipe
(`CREATE TABLE __new_x` … `DROP TABLE x`) cascade-deletes referencing rows;
`pnpm check:standards` (`no-d1-table-rebuild`) refuses such a migration. Undo
is a new forward migration or a Time Travel restore (RUNBOOK, "D1
operations"). The full rule set and a worked example: `drizzle-migrations.md`.

### Dry run (no Cloudflare auth for the deploy half)

```bash
node scripts/deploy-stage.mjs --stage staging --dry-run
# = wrangler d1 migrations list DB --remote --env staging  (needs auth: reads the remote table)
# + CLOUDFLARE_ENV=staging vite build && wrangler deploy --dry-run --outdir dist/dry-run
```

## ForgeGraph

`.forgegraph.yaml` at the repo root registers the app, its two stages as
`cloudflare-workers` targets, the D1 resources, the health URL and the
migration command (`db.migrate: node scripts/deploy-stage.mjs
--migrate-only`, with `FG_STAGE` selecting the stage). `forge diff` /
`forge apply` sync it; `pnpm forge:deploy:<stage>` creates a deployment,
which runs the repo's deploy workflow. `forge init` scaffolds a generic
"build then `wrangler deploy`" workflow; use
[`deploy/forgegraph/deploy.yml`](../deploy/forgegraph/deploy.yml) instead,
which runs `scripts/deploy-stage.mjs` once so the migrate-then-deploy rule
holds in ForgeGraph too.

The stage target's `deploy` is `pnpm -F @gmacko/web deploy:<stage>` — build
and `wrangler deploy`, nothing else. Migrating is `db.migrate`'s job, so
whichever path ForgeGraph takes (its own `db.migrate` + target `deploy`, or
`deploy/forgegraph/deploy.yml` running `deploy-stage.mjs`) a stage is
migrated exactly once. `scripts/deploy-stage.mjs` stays the one place the
ordering is written down. Health stays at `/.well-known/forge-health` (served by the
Worker, redacted outside development).

### D1 is not `forge db create`

`forge db create` provisions Postgres on a VPS node plus a Cloudflare Tunnel
and Hyperdrive; none of that applies to D1. Create each database once with
wrangler and record its id in `wrangler.jsonc`:

```bash
pnpm -F @gmacko/web exec wrangler d1 create gmacko-web-staging
pnpm -F @gmacko/web exec wrangler d1 create gmacko-web
pnpm -F @gmacko/web exec wrangler d1 create gmacko-web-preview
```

## Secrets

ForgeGraph holds the stage secrets (`forge secret set KEY --stage <stage>`,
`forge secret list --stage <stage>`); the Worker reads them as bindings
through `AppConfig.fromBindings` (`apps/web/src/server/config.ts`, the only
reader). Push them with:

```bash
pnpm secrets:push --stage staging            # forge secret list/get → wrangler secret put --env staging
pnpm secrets:push --stage production --dry-run
pnpm secrets:push --stage staging --only AUTH_SECRET,STRIPE_WEBHOOK_SECRET
```

`scripts/secrets-push.mjs` skips keys that are not Worker bindings
(`DATABASE_URL`, `REDIS_URL`, `FG_*`, the Cloudflare credentials themselves)
and pipes every value on stdin, so nothing lands in a shell history or a
file. The keys the Worker expects are the `Bindings` schema in `config.ts`
and `apps/web/src/server/bindings.d.ts`; `apps/web/README.md` lists them.

Non-secret per-stage values (`STAGE`, `APP_URL`, `ALLOWED_ORIGINS`) are
wrangler vars in `wrangler.jsonc`, not secrets. There is no `.dev.vars`
anywhere: locally the Worker reads the repo-root `.env` through the
`apps/web/.env` link, and a `.dev.vars` file would silently turn that off
(`pnpm check:standards`, `no-dev-vars`).

## Rate limiting

Two counters, chosen per scope in `apps/web/src/server/runtime.ts`:

| Scope | Counter | Where it is applied |
| --- | --- | --- |
| `auth` | `RATE_LIMIT_AUTH` binding | better-auth's own writes under `/api/auth/*` that are not sign-up or magic-link |
| `contact` | `RATE_LIMIT_CONTACT` binding | `POST /api/waitlist` |
| `api-keys` | `RATE_LIMIT_API_KEYS` binding | create/revoke API key |
| `operator-api` | `RATE_LIMIT_OPERATOR_API` binding | every `/api/admin/*` endpoint |
| `signup` | `rate_limit_window` in D1 | `POST /api/auth/sign-up/*` and `POST /api/auth/sign-in/magic-link` |

The bindings are declared in `wrangler.jsonc` (`ratelimits`, restated per
environment because environments do not inherit them). A binding counts **per
colo**, not globally, and costs no database round trip — the right trade for
the read-mostly API scopes. Sign-up and magic-link send create an account or
send mail, so they use the D1 table instead: one row per (scope, client,
window start), incremented by a single guarded upsert
(`ON CONFLICT … DO UPDATE SET count = count + 1 WHERE count < limit
RETURNING count`), which needs no transaction. The nightly Cron Trigger
deletes closed windows (`Jobs.pruneRateLimitWindows`).

Changing a binding's `namespace_id` resets its counters; `simple.period` must
be 10 or 60 and must agree with the scope's `windowMs` in `defaultRateLimits`
(`packages/api/src/rate-limit.ts`), because a binding reports no reset time
and the 429's `Retry-After` is derived from `period`. Both counters fail
**open**: a binding error or a D1 outage logs a warning and allows the call.

## Worker types

`apps/web/worker-configuration.d.ts` is generated from `wrangler.jsonc` by
`pnpm cf-typegen` (`wrangler types`, no Cloudflare auth needed) and committed.
CI's `pnpm check:cf-types` fails when it drifts, so a binding added to
`wrangler.jsonc` without regenerating the types cannot merge.

## Previews

`.github/workflows/preview.yml` uploads a *version* of the single
`gmacko-web-preview` Worker on every PR update (`pnpm -F @gmacko/web
preview:upload` = `CLOUDFLARE_ENV=preview vite build && wrangler versions
upload`), after applying pending migrations to the shared
`gmacko-web-preview` database in a step of its own. A version inherits the
Worker's bindings and secrets and gets its own
`https://<version-prefix>-gmacko-web-preview.<subdomain>.workers.dev` URL
without taking any traffic, so there is no per-PR Worker to create and
nothing to delete when the PR closes. `cancel-in-progress` is off: a run may
be inside `migrate:remote`.

The workflow needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
secrets and posts the URL wrangler prints; without the secrets it skips with a
warning rather than failing the PR.

### One preview database, not one per PR

All open PRs share the `gmacko-web-preview` database. Phase 9 reconsidered the
per-PR database the migration plan had called for and kept the shared one:

- A per-PR database has to be a binding on the version that uses it, so every
  PR would need its own Worker (or a generated per-PR config). **A Worker per
  PR starts with no secrets**, so the workflow would have to push the whole
  preview secret set to a fresh Worker on every PR — a CI token with
  secret-write, and N copies of the secrets, to review a diff.
- The isolation would be guarding against one PR's schema change breaking
  another PR's preview. Expand/contract already prevents that, and it is
  *enforced*: `pnpm check:standards` (`no-d1-table-rebuild`) refuses a
  migration that rebuilds a table, and an additive migration is compatible
  with older code by construction.
- Nothing automated depends on this database. The suites run against local
  Miniflare D1.

The cost is data drift: a half-finished flow or a leftover test workspace
stays until someone clears it. The **reset job** in the same workflow is the
answer — it runs weekly (Mondays 04:00 UTC) and on demand from the Actions tab
(*Run workflow* → tick *Empty and re-seed the shared preview database*), and
does migrate → empty → seed:

```bash
pnpm -F @gmacko/db migrate:remote --env preview
pnpm -F @gmacko/db reset:remote   --env preview   # seed/reset.sql: DESTRUCTIVE
pnpm -F @gmacko/db seed:remote    --env preview   # seed/seed.sql: idempotent
```

`seed/reset.sql` is generated from the schema by `pnpm -F @gmacko/db seed:sql`
(children before parents, so no foreign key is tripped; `delete from`, never a
drop). It empties **every** table — the workflow hard-codes `--env preview` in
all three steps and there is no equivalent script for another stage. Revisit
the shared database if previews ever need per-PR fixtures, or if two PRs' data
genuinely collide; the alternative then is a Workers dispatch namespace, not a
Worker per PR.

`pnpm -F @gmacko/web preview:upload:dry-run` runs the same build and
`wrangler versions upload --dry-run` locally, needing no Cloudflare
credentials — it prints the preview environment's bindings, which is how you
check that `env.preview` resolved before opening a PR.

## Observability

- **Logs**: one JSON line per event on the console (`@gmacko/logging` over
  Effect's logger), ingested by Workers Logs (`observability.enabled` in
  `wrangler.jsonc`) and Logpush.
- **Traces and metrics**: `@gmacko/telemetry`'s `Observability.layer` exports
  over OTLP/HTTP when `OTEL_EXPORTER_OTLP_ENDPOINT` (+ `_HEADERS`) is set,
  flushed on `waitUntil` after every request. Each API call is one span
  named `group.endpoint` with `http.server.duration` recorded per endpoint.
- **Errors**: `@sentry/cloudflare` wraps the Worker (`SENTRY_DSN`);
  `@sentry/react` in the browser (`VITE_SENTRY_DSN`, inlined at build).
  `SENTRY_AUTH_TOKEN` at build time uploads hidden source maps for the
  `__APP_VERSION__` release.
- **Health**: `/api/health`, `/api/health/{live,ready}`,
  `/.well-known/forge-health`; generic outside development.

## Rollback

- **Code**: `wrangler rollback --env <stage>` (Workers keep previous
  versions), or redeploy the previous commit with `pnpm deploy:<stage>`.
- **Schema**: never a down migration. Ship a forward migration, or restore
  with D1 Time Travel to a bookmark taken before the deploy (RUNBOOK, "Restore
  with Time Travel"). Because releases only expand, the previous Worker
  version keeps working against the newer schema, so a code rollback alone
  is usually enough.
