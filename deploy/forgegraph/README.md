# ForgeGraph Deployment Handoff

ForgeGraph is the control plane for the web lane: it registers the app and
its stages, holds the stage secrets, triggers deploys and watches health. The
Worker itself lives on Cloudflare; ForgeGraph never hosts it. This is the
ForgeGraph side of [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md).

## The repo contract: `.forgegraph.yaml`

```yaml
app: gmacko
server: https://forgegraf.com
db: { type: d1, name: gmacko-web, migrate: node scripts/deploy-stage.mjs --migrate-only, migrateType: wrangler }
stages:
  - name: staging     # target: cloudflare-workers, worker gmacko-web-staging
  - name: production  # target: cloudflare-workers, worker gmacko-web
resources: { d1: [gmacko-web-staging, gmacko-web, gmacko-web-preview] }
health: { url: /.well-known/forge-health }
```

`pnpm forge:diff` / `pnpm forge:apply` sync it; `pnpm forge:stages` lists the
stages; `pnpm forge:deploy:staging` and `pnpm forge:deploy:production` wrap
`forge deploy create <stage> --wait`.

## The deploy workflow

A `cloudflare-workers` deploy runs the repo's deploy workflow. `forge init`
scaffolds a generic one (`pnpm build && npx wrangler deploy` from the wrangler
config directory); replace it with [`deploy.yml`](./deploy.yml) from this
directory, which runs `node scripts/deploy-stage.mjs --stage $FG_STAGE`:

1. `pnpm -F @gmacko/db migrate:remote --env <stage>` — the stage's pending D1
   migrations. **A failure aborts the deploy.**
2. `pnpm -F @gmacko/web deploy:<stage>` — build for that environment and
   `wrangler deploy`.

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are provisioned into the
repo by ForgeGraph from the workspace's Cloudflare integration; `FG_STAGE`
selects the stage.

## Databases

D1 is not `forge db create`. That command provisions Postgres on a node plus
a Cloudflare Tunnel and a Hyperdrive config for VPS-hosted apps; the web
lane's databases are created once with `wrangler d1 create` (see
`deploy/cloudflare/README.md`) and their ids recorded in
`apps/web/wrangler.jsonc`. Backups are D1 Time Travel and `wrangler d1
export` (`docs/RUNBOOK.md`, "D1 operations").

## Secrets

```bash
forge secret set AUTH_SECRET --stage staging --stdin
forge secret list --stage staging
pnpm secrets:push --stage staging          # → wrangler secret put, one key at a time, values on stdin
```

The Worker's expected keys are the `Bindings` schema in
`apps/web/src/server/config.ts`. `pnpm secrets:push` skips the keys that are
not Worker bindings (`DATABASE_URL`, `REDIS_URL`, `FG_*`, the Cloudflare
credentials).

## Health

`/.well-known/forge-health` is served by the Worker's Health service (the
same code behind `/api/health`): `ok` + version in production, the component
checks (D1 ping latency) in development and staging. Point the stage's health
URL at the Worker's public origin.

## Previews

GitHub Actions deploys one Worker per pull request on the shared preview
database (`.github/workflows/preview.yml`); ForgeGraph is not involved until
Phase 9 gives previews their own databases and a ForgeGraph stage.
