# Cloudflare Workers: the web lane

`apps/web` is a Cloudflare Worker (TanStack Start server-rendered on workerd,
the Effect HTTP API under `/api/*`) with a D1 database. This is the Workers
side of the deploy lane described in [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md).

## One Worker and one D1 per stage

`apps/web/wrangler.jsonc` defines the top-level (development) config and the
`preview`, `staging` and `production` environments. Each environment sets:

- `name` — `gmacko-web-staging`, `gmacko-web`; previews override it per PR
  with `--name gmacko-web-pr-<n>`.
- `vars.STAGE` — read by `AppConfig` (cookie security, docs exposure, health
  redaction, log level). `vars.APP_URL` / `ALLOWED_ORIGINS` are the stage's
  public origin and extra credentialed origins.
- `d1_databases[0]` — binding `DB`, the stage's database id, and
  `migrations_dir` pointing at `packages/db/migrations`.

Create the databases once and paste the ids in:

```bash
pnpm -F @gmacko/web exec wrangler d1 create gmacko-web-staging
pnpm -F @gmacko/web exec wrangler d1 create gmacko-web
pnpm -F @gmacko/web exec wrangler d1 create gmacko-web-preview
```

## Commands

From the repo root:

```bash
pnpm dev                       # emulate + apps/web on https://gmacko.localhost (local D1)
pnpm db:migrate:local          # apply migrations to the local D1
pnpm -F @gmacko/web build      # production build (dist/client + dist/server)
pnpm deploy:staging            # migrate the staging D1, then wrangler deploy --env staging
pnpm deploy:production         # same for production
pnpm secrets:push --stage staging   # ForgeGraph secrets → wrangler secret put --env staging
pnpm cf-typegen                # regenerate apps/web/worker-configuration.d.ts (CI checks the diff)
```

`pnpm -F @gmacko/web deploy:<stage>` is `CLOUDFLARE_ENV=<stage> vite build &&
wrangler deploy`: the Cloudflare Vite plugin writes the environment's
flattened config to `dist/server/wrangler.json` and a redirect in
`.wrangler/deploy/config.json`, so `wrangler deploy` in `apps/web` deploys
that build. `deploy:<stage>:dry-run` adds `--dry-run --outdir dist/dry-run`
(no credentials needed); `scripts/deploy-stage.mjs --dry-run` chains it after
`wrangler d1 migrations list`.

## Environment variables and secrets

- Development: the Worker reads `apps/web/.env`, a symlink to the repo-root
  `.env` (`predev` creates it). Never create `.dev.vars`; it disables that.
- Stages: non-secret values are `vars` in `wrangler.jsonc`; secrets are
  `wrangler secret put KEY --env <stage>`, fed from ForgeGraph by
  `pnpm secrets:push`.
- Build-time: `VITE_*` (PostHog key/host, Sentry DSN for the browser) are
  inlined by Vite; `SENTRY_AUTH_TOKEN` (+ `SENTRY_ORG`, `SENTRY_PROJECT`)
  turns on source-map upload.

## Compatibility

`compatibility_date` ≥ 2026-08-04 enables `nodejs_compat` by default; the
Worker needs it for `node:async_hooks` (TanStack Start's request context,
better-auth). No other Node API is used: logging, telemetry (OTLP over
fetch), Sentry (`@sentry/cloudflare`), Stripe (fetch client, SubtleCrypto)
and Resend are all Workers-native, which `pnpm check:standards --graph` and
the `no-raw-process-env` rule keep true for every package in the bundle.

## Not on this lane

`@gmacko/realtime` (ioredis + BullMQ) is Node-only and is not in the Worker's
dependency graph.

