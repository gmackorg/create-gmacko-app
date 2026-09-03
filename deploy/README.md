# Deployment Guidance

The web lane of this template — `apps/web`, TanStack Start + Effect — deploys
as a Cloudflare Worker with a D1 database, one of each per stage, orchestrated
by ForgeGraph. That is the only production path for the web app: Workers is
the standing rule for Next.js/web apps, and the VPS nodes (`hetzner-*`) are
for non-web services (Go services, bots, queue workers).

The full guide is [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md). In short:

1. `.forgegraph.yaml` registers the app, its `staging` and `production`
   stages as `cloudflare-workers` targets, the D1 resources and the health URL.
2. A stage deploy is `pnpm deploy:<stage>` (`scripts/deploy-stage.mjs`):
   apply the pending D1 migrations, and only if that succeeds, build and
   `wrangler deploy` the Worker. ForgeGraph runs the same script
   ([`forgegraph/deploy.yml`](./forgegraph/deploy.yml)).
3. Migrations are checked in, forward-only and expand/contract
   (`docs/drizzle-migrations.md`); rollback is a new migration or a D1 Time
   Travel restore (`docs/RUNBOOK.md`).
4. Stage secrets live in ForgeGraph and reach the Worker with
   `pnpm secrets:push --stage <stage>` (`wrangler secret put` under the hood).
5. Previews are one Worker per pull request on a shared preview D1
   (`.github/workflows/preview.yml`); per-PR databases are Phase 9.

D1 is created with `wrangler d1 create`, never with `forge db create` (which
provisions Postgres + Hyperdrive for VPS-hosted apps).

## Directory

- [`cloudflare/README.md`](./cloudflare/README.md) — the Workers side: wrangler
  environments, D1 per stage, `wrangler` commands, the generated deploy config.
- [`forgegraph/README.md`](./forgegraph/README.md) — the ForgeGraph side: the
  repo contract, the deploy workflow, secrets, health.
- [`forgegraph/deploy.yml`](./forgegraph/deploy.yml) — the deploy workflow to
  install in the ForgeGraph-managed repo.

## Health Check

Every stage serves `/api/health`, `/api/health/live`, `/api/health/ready` and
`/.well-known/forge-health` from the Worker (packages/api's Health service).
Outside development the responses are generic: status and version, no
internals.

## Legacy

`apps/nextjs` and `packages/legacy-*` (Postgres on a VPS node, ForgeGraph +
Nix) are deleted in Phase 8. Their deployment notes moved to `docs/legacy/`;
nothing in this directory applies to them.
