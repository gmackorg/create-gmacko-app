# Operational Runbook

This document provides procedures for common operational tasks, incident
response, and troubleshooting for products built from create-gmacko-app.

## Quick Reference

| Scenario | Action |
|----------|--------|
| Site is down | `curl /api/health/ready`, check Sentry, `wrangler tail --env <stage>`, Cloudflare status |
| Slow API responses | Filter OTLP traces by `http.server.duration` per `group.endpoint`; check D1 Insights (`rows_read`) and rate-limit 429s |
| Database issues | `wrangler d1 info DB --remote`, D1 dashboard Insights, `pnpm -F @gmacko/db migrate:list` |
| Auth failures | Check session cookies (`__Secure-` over https), verify OAuth credentials and `ALLOWED_ORIGINS`, review `auth` logs |
| Deploy rollback | `wrangler rollback --env <stage>` or redeploy the previous commit with `pnpm deploy:<stage>` |
| Enable maintenance | Admin launch controls (`PATCH /api/admin/launch-controls`, `pnpm api:ops` in the operator lane) |

## Health Checks

```bash
# Main health check (includes the D1 ping)
curl https://yourapp.com/api/health

# Liveness probe (is the Worker serving?)
curl https://yourapp.com/api/health/live

# Readiness probe (can it reach D1?)
curl https://yourapp.com/api/health/ready

# ForgeGraph health
curl https://yourapp.com/.well-known/forge-health
```

Outside development the responses are generic (status and version only); raw
check detail is dev-only. `api/health/ready` answers 503 `Unhealthy` when the
D1 ping fails.

## Incident Response

### Severity Levels

| Level | Description | Response Time | Example |
|-------|-------------|---------------|---------|
| SEV-1 | Service outage, data loss risk | Immediate | Site down, D1 unreachable |
| SEV-2 | Major feature broken | <1 hour | Auth not working, payments failing |
| SEV-3 | Minor feature degraded | <4 hours | Slow queries, non-critical errors |
| SEV-4 | Cosmetic / minor | Next business day | UI glitch, typo |

### Response Procedure

1. **Acknowledge** — Confirm the issue, assign an owner
2. **Assess** — Determine severity, check Sentry, Workers Logs, and traces
3. **Communicate** — Update status page, notify stakeholders
4. **Mitigate** — Apply immediate fix (rollback, launch controls, feature flag)
5. **Resolve** — Deploy permanent fix
6. **Postmortem** — Document root cause, timeline, prevention measures

### Rollback Procedure

**Worker version (primary):**
```bash
# Workers keep previous versions; roll the stage back in place
pnpm -F @gmacko/web exec wrangler rollback --env staging
```

**Git-based rollback:**
```bash
# Revert the problematic commit, then deploy the stage (migrate, then wrangler deploy)
git revert <commit-sha>
git push origin main
pnpm deploy:staging
```

Because releases only expand the schema, the previous Worker version keeps
working against the newer schema; a code rollback alone is usually enough.
Never roll a migration back; see "D1 operations" for Time Travel.

**Emergency: maintenance / launch controls:**
Use the admin launch controls (`/admin`, or `PATCH /api/admin/launch-controls`
with an `admin`-scoped key) to close sign-ups or put up the waitlist without a
deploy.

## Database Operations

The app's database is Cloudflare D1 (`apps/web/wrangler.jsonc`, binding `DB`).
Full guide: `docs/drizzle-migrations.md`. Procedures: "D1 operations" below.

### Slow Queries
- Every query runs under the D1 client's span (`db.system.name = sqlite`,
  statement as an attribute); filter traces by duration.
- Add indexes for frequently filtered columns via a migration (`CREATE INDEX`
  is expand-only and safe).
- `wrangler d1 execute DB --remote --command "EXPLAIN QUERY PLAN <sql>"` shows
  the plan; D1 also reports `rows_read`/`rows_written` per query in the
  dashboard's Insights.

### Migrations
```bash
# Generate from schema changes (drizzle-kit + flatten), then REVIEW the SQL:
# expand/contract only, no `__new_` tables (D1 cascade-deletes on rebuild)
pnpm db:generate

# Apply to the local D1 and run the D1 suite
pnpm db:migrate:local
pnpm -F @gmacko/db test:workers

# Rehearse the --remote path with no Cloudflare account: starts the local D1
# emulator and runs the real `wrangler d1 migrations apply DB --remote`
pnpm db:rehearse:remote

# Apply to the stage's database — before `wrangler deploy`, in the same stage
pnpm db:migrate:remote --env staging
# ...or the whole stage sequence (migrate, abort on failure, deploy):
pnpm deploy:staging
```

`pnpm db:rehearse:remote` is the dry run for a migration you are nervous
about. It exercises the same command a deploy runs, against Miniflare/workerd
SQLite (the engine D1 runs on), and asserts that `d1_migrations` records every
file, that no `__new_<table>` survived, and that re-applying is a no-op.
`CLOUDFLARE_API_BASE_URL` must end in `/client/v4`; the recipe and the gaps
(`seed:remote`/`reset:remote` cannot be rehearsed — they use the four-phase
import protocol the emulator does not implement) are in
`docs/drizzle-migrations.md` → "Rehearsing a remote migration".

The deploy lane (migrate-then-deploy, expand/contract, preview databases,
secrets) is documented in `docs/DEPLOYMENT.md`; the D1 procedures below are
what it links to.

There is no `push` and no down migration. To undo, ship a forward migration or
use Time Travel (below).

## D1 operations

All commands run from `packages/db` with `--config ../../apps/web/wrangler.jsonc`
(shortened below as `$CFG`); `DB` is the binding name. Use `--env <stage>` when
the stage has its own wrangler environment.

```bash
cd packages/db && CFG=../../apps/web/wrangler.jsonc
```

### Export (backup)

Take one before any restore, any backfill, and any migration that deletes.

```bash
mkdir -p ../../.artifacts
pnpm exec wrangler d1 export DB --remote --config $CFG \
  --output ../../.artifacts/d1-$(date +%Y%m%dT%H%M%S).sql

# schema only / data only / selected tables
pnpm exec wrangler d1 export DB --remote --config $CFG --no-data   --output schema.sql
pnpm exec wrangler d1 export DB --remote --config $CFG --no-schema --table user --table workspace --output users.sql
```

Exports are plain SQL. Keep them outside the repo (`.artifacts/` is ignored) and
treat them as production data.

### Restore with Time Travel (point in time, in place)

D1 keeps 30 days of history (7 on the Free plan). Restoring rewrites the live
database; nothing is deleted from history, and the pre-restore state gets its
own bookmark.

1. Freeze writes if you can (maintenance mode via the admin launch controls).
2. Export the current state (above).
3. Find the point to return to and note its bookmark:
   ```bash
   pnpm exec wrangler d1 time-travel info DB --config $CFG --timestamp 2026-09-03T08:00:00Z
   ```
4. Restore:
   ```bash
   pnpm exec wrangler d1 time-travel restore DB --config $CFG --timestamp 2026-09-03T08:00:00Z
   # or: --bookmark <bookmark from step 3>
   ```
   The command prints the bookmark of the state it replaced; keep it. To undo
   the restore, run `restore` again with that bookmark.
5. `d1_migrations` is restored too. If a migration was applied after the chosen
   point, `pnpm db:migrate:remote` will apply it again; confirm it is safe to
   re-run (expand/contract migrations are) or roll the deploy back to the
   matching version first.
6. Run `curl https://<app>/api/health/ready` and spot-check the restored rows.

### Restore from an export (into a fresh or local database)

```bash
# into the local D1 (e.g. to reproduce an incident with real data)
pnpm exec wrangler d1 execute DB --local --config $CFG --file ../../.artifacts/d1-<stamp>.sql

# into a new remote database: create it, point a wrangler env at its id, then
pnpm exec wrangler d1 execute DB --remote --env <stage> --config $CFG --file ../../.artifacts/d1-<stamp>.sql
```

`execute --file --local` runs the file as one batch, so a failing statement
rolls back the whole file. For `--remote`, take an export first and treat the
file as re-runnable: D1's import path is not documented as all-or-nothing, so a
partial apply must be recoverable by restoring the export or by running the
file again.

### Copy production to staging

```bash
pnpm exec wrangler d1 export DB --remote --env production --config $CFG --output ../../.artifacts/prod.sql
pnpm exec wrangler d1 execute DB --remote --env staging --config $CFG --file ../../.artifacts/prod.sql
```

Scrub personal data before loading it anywhere less protected than production.

### Reseed defaults

`pnpm db:seed` (local) or `pnpm exec wrangler d1 execute DB --remote --config $CFG --file seed/seed.sql`
restores the default plans, limits, and meters without touching user data or an
existing `application_settings` row; it is idempotent.

**Warning:** reseeding is an upsert keyed on `key`, so it overwrites operator
edits to the seeded plans' `amount_in_cents`, `is_default`, `active`, and
`updated_at` (plus `name`, `description`, `interval`, `currency`, and the seeded
limits' `value` and `period`). That is intended — the seed is
the source of truth for defaults — but if a stage has hand-edited pricing, take
an export first or change the seed instead of the row.

### Size

`pnpm exec wrangler d1 info DB --remote --config $CFG` reports the size. The cap
is 10 GB per database (500 MB on Free); plan a split (per-tenant databases or
moving cold tables out) well before that — D1 has no online resize.

## Monitoring & Alerting

### Logging
- **Where**: one JSON line per event via `@gmacko/logging` (Effect logger) on the console, ingested by Workers Logs (`observability.enabled` in `wrangler.jsonc`); `wrangler tail --env <stage>` streams them
- **Context**: request id, trace id, user id, and workspace id from the request's Effect context
- **Levels**: `debug` (development only), `info` (request lifecycle), `warn`, `error` (failures)

### Traces and metrics (OTLP)
- `@gmacko/telemetry` exports traces, logs, and metrics over OTLP/HTTP when `OTEL_EXPORTER_OTLP_ENDPOINT` (+ `_HEADERS`) is set, flushed on `waitUntil` after each request
- One span per API call named `group.endpoint`; `http.server.duration` histogram per endpoint; `sql.execute` spans under the D1 client
- `x-trace-id` on every API response (health probes excepted) links a user report to its trace

### Error Tracking (Sentry)
- **Worker**: `@sentry/cloudflare` (`SENTRY_DSN`); **browser**: `@sentry/react` (`VITE_SENTRY_DSN`)
- **Alerts**: Configure in Sentry → Alerts → Create Rule
- **Recommended alerts**:
  - New issue spike (>10 events in 5 minutes)
  - Error rate threshold (>1% of requests)
  - Performance regression (p95 latency >2x baseline)

### Analytics (PostHog)
- **Dashboard**: https://app.posthog.com
- Track feature adoption, funnel conversion, user retention
- Feature flags integration for gradual rollouts

### Uptime Monitoring
- Health endpoint: `/api/health/ready`; ForgeGraph polls `/.well-known/forge-health` (`.forgegraph.yaml`)
- Recommended: Configure external uptime monitor (e.g., BetterUptime, Pingdom)
- Alert if health check fails for >2 consecutive minutes

## Common Troubleshooting

### "AppConfig: missing X" at Worker start
- The Worker reads bindings once at module load and fails fast; check `wrangler.jsonc` vars for the stage and `pnpm secrets:push --stage <stage> --dry-run`
- Locally: `apps/web/.env` must link to the repo-root `.env` (`predev` creates it), and `apps/web/.dev.vars` must not exist (its presence disables `.env` loading)

### 401 `Unauthorized` / 403 `Forbidden`
- 401: no or expired session, or an invalid, expired, or revoked API key; sign out and back in, or mint a new key
- 403 `origin`: a non-GET request with a session cookie from an origin not in `ALLOWED_ORIGINS`
- 403 `scope`: the API key lacks the scope the endpoint declares (`docs/API_AUTH.md`), or an `Authorization` header reached a `Session`-only endpoint
- Check that `AUTH_SECRET` matches between deploys; rotating it invalidates sessions

### 503 `Unhealthy` from `/api/health/ready`
- The D1 ping failed: check the Cloudflare status page and `wrangler d1 info DB --remote --env <stage>`
- Verify `env.<stage>.d1_databases[0].database_id` in `wrangler.jsonc` is the stage's database

### Migration failed during deploy
- `scripts/deploy-stage.mjs` stops before `wrangler deploy`; the previous Worker keeps serving
- `pnpm -F @gmacko/db migrate:list --env <stage>` shows what applied; fix forward with a new migration (never edit an applied file)

### Build Failures
```bash
# Clean all caches and rebuild
pnpm clean && pnpm clean:workspaces
pnpm install
pnpm build
```

### "Module not found" or Node built-ins in the Worker bundle
- A package reachable from `apps/web`'s `dependencies` ships in the Worker: it must not import `node:*` modules or read `process.env` (`pnpm check:standards --graph` lists the set)
- Ensure the package has the correct `exports` field in its `package.json`
- Run `pnpm install` to update workspace links

## Maintenance Windows

### Pre-maintenance Checklist
- [ ] Notify users via email/banner at least 24h in advance
- [ ] Take a D1 export (`D1 operations` → Export)
- [ ] Close sign-ups or enable the waitlist through the admin launch controls
- [ ] Perform maintenance tasks
- [ ] Run health checks
- [ ] Reopen through the launch controls
- [ ] Verify all services are operational
- [ ] Send "all clear" notification

### Dependency Updates
- Renovate creates PRs automatically for dependency updates
- Review and merge weekly for non-breaking updates
- For major version bumps: test in a preview deployment first
- Run `pnpm audit` monthly for vulnerability check
