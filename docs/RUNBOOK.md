# Operational Runbook

This document provides procedures for common operational tasks, incident
response, and troubleshooting for products built from create-gmacko-app.

## Quick Reference

| Scenario | Action |
|----------|--------|
| Site is down | Check health endpoint, review Sentry, check Vercel status |
| Slow API responses | Check tRPC timing logs, review DB query logs, check rate limits |
| Database issues | Check connection pool, review slow query log, check Neon dashboard |
| Auth failures | Check session cookies, verify OAuth credentials, review auth logs |
| Deploy rollback | Revert via Vercel dashboard or `git revert` + push |
| Enable maintenance | Set `MAINTENANCE_MODE=true` env var, redeploy |

## Health Checks

```bash
# Main health check (includes DB, memory)
curl https://yourapp.com/api/health

# Liveness probe (is the process running?)
curl https://yourapp.com/api/health/live

# Readiness probe (can it serve traffic?)
curl https://yourapp.com/api/health/ready
```

**Response format:**
```json
{
  "status": "healthy|degraded|unhealthy",
  "version": "1.0.0",
  "uptime": 3600,
  "checks": {
    "database": { "status": "pass", "responseTime": 12 },
    "memory": { "status": "pass", "heapUsed": "45MB", "percentage": 32 }
  }
}
```

**Thresholds:**
- Memory warning: >75% heap usage → `degraded`
- Memory critical: >90% heap usage → `unhealthy`
- DB timeout: >5s response → `unhealthy`

## Incident Response

### Severity Levels

| Level | Description | Response Time | Example |
|-------|-------------|---------------|---------|
| SEV-1 | Service outage, data loss risk | Immediate | Site down, DB unreachable |
| SEV-2 | Major feature broken | <1 hour | Auth not working, payments failing |
| SEV-3 | Minor feature degraded | <4 hours | Slow queries, non-critical errors |
| SEV-4 | Cosmetic / minor | Next business day | UI glitch, typo |

### Response Procedure

1. **Acknowledge** — Confirm the issue, assign an owner
2. **Assess** — Determine severity, check monitoring dashboards
3. **Communicate** — Update status page, notify stakeholders
4. **Mitigate** — Apply immediate fix (rollback, feature flag, maintenance mode)
5. **Resolve** — Deploy permanent fix
6. **Postmortem** — Document root cause, timeline, prevention measures

### Rollback Procedure

**Vercel (primary deployment):**
1. Go to Vercel Dashboard → Deployments
2. Find the last known good deployment
3. Click "..." → "Promote to Production"

**Git-based rollback:**
```bash
# Revert the problematic commit
git revert <commit-sha>
git push origin main
# Vercel will auto-deploy the revert
```

**Emergency: Enable maintenance mode:**
```bash
# In Vercel Environment Variables, set:
MAINTENANCE_MODE=true
# Trigger redeploy — all traffic redirected to /maintenance
```

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

# Apply to the stage's database — before `wrangler deploy`, in the same stage
pnpm db:migrate:remote
```

There is no `push` and no down migration. To undo, ship a forward migration or
use Time Travel (below).

### Legacy Postgres (apps/nextjs, until Phase 8)
```bash
psql $DATABASE_URL -c "SELECT 1"          # connection check
pnpm db:legacy:push                        # push the legacy schema
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

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
- **Where**: Structured JSON logs via `@gmacko/logging` (Pino)
- **Context**: Request ID, user ID, organization ID propagated via AsyncLocalStorage
- **Levels**: `debug` (dev only), `info` (request lifecycle), `warn` (slow queries >3s), `error` (failures)

### Error Tracking (Sentry)
- **Dashboard**: https://sentry.io → Your Org → Your Project
- **Alerts**: Configure in Sentry → Alerts → Create Rule
- **Recommended alerts**:
  - New issue spike (>10 events in 5 minutes)
  - Error rate threshold (>1% of transactions)
  - Performance regression (p95 latency >2x baseline)

### Analytics (PostHog)
- **Dashboard**: https://app.posthog.com
- Track feature adoption, funnel conversion, user retention
- Feature flags integration for gradual rollouts

### Uptime Monitoring
- Health endpoint: `/api/health`
- Recommended: Configure external uptime monitor (e.g., BetterUptime, Pingdom)
- Alert if health check fails for >2 consecutive minutes

## Common Troubleshooting

### "Error: Environment variable X is missing"
- Check `.env` file exists and has the variable
- For Vercel: check Environment Variables in project settings
- The `@t3-oss/env-nextjs` validation runs at build time

### "TRPCError: UNAUTHORIZED"
- Session cookie may have expired — try logging out and back in
- Check that `AUTH_SECRET` matches between environments
- Verify OAuth provider credentials haven't rotated

### "Database connection timeout"
- Check `DATABASE_URL` is correct
- Neon: check if the compute endpoint is scaled to zero (cold start)
- Docker: check if the postgres container is running

### Build Failures
```bash
# Clean all caches and rebuild
pnpm clean && pnpm clean:workspaces
pnpm install
pnpm build
```

### "Module not found" in monorepo
- Ensure the package is listed in `transpilePackages` in `next.config.js`
- Ensure the package has the correct `exports` field in its `package.json`
- Run `pnpm install` to update workspace links

## Maintenance Windows

### Pre-maintenance Checklist
- [ ] Notify users via email/banner at least 24h in advance
- [ ] Set `MAINTENANCE_MODE=true` at scheduled time
- [ ] Verify maintenance page is showing (check /maintenance)
- [ ] Perform maintenance tasks
- [ ] Run health checks
- [ ] Set `MAINTENANCE_MODE=false`
- [ ] Verify all services are operational
- [ ] Send "all clear" notification

### Dependency Updates
- Renovate creates PRs automatically for dependency updates
- Review and merge weekly for non-breaking updates
- For major version bumps: test in preview environment first
- Run `pnpm audit` monthly for vulnerability check
