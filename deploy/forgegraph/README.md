# ForgeGraph Deployment Handoff

Use this directory as the handoff point between the generated app repo and the ForgeGraph deployment repo or control plane.

## Expected Direction

1. Keep the application flake-based at the repo root with [`flake.nix`](../../flake.nix).
2. Define the app service and colocated Postgres service in ForgeGraph.
3. Store runtime secrets in ForgeGraph rather than embedding deployment-specific config in GitHub Actions.
4. Promote hosted Postgres only when real customer load or operational constraints justify the split.

## `forge` Workflow

If you are working from the sibling [`../ForgeGraph`](../../ForgeGraph) repo, use `forge` as the operator interface. If you want the published CLI, install `@forgegraph/cli`.

```bash
forge login --server <forgegraph-url> --token <token>
forge diff
forge apply
forge stage list
forge deploy create staging --wait
forge deploy create production --wait
```

Use `forge logs <app> <stage> --follow` to follow a stage after it starts deploying.

The generated repo now also includes:

- `.forgegraph.yaml` aligned to the current live `forge` repo contract: `app`, `server`, and `stages`, plus operator notes as comments
- `pnpm forge:diff`, `pnpm forge:apply`, and `pnpm forge:pull` wrappers for repo-local config sync
- `pnpm forge:deploy:staging` and `pnpm forge:deploy:production` wrappers around `forge deploy create <stage> --wait`
- `pnpm forge:stages` as a quick repo-local view of configured ForgeGraph stages

## Preview Environments

For preview environments in ForgeGraph, pass through:

- preview ref such as `pr-123`
- preview domain such as `pr-123.preview.gmacko.io`
- `DATABASE_URL`
- `AUTH_SECRET`
- any enabled integration env vars

Keep preview database isolation simple by default:

- start with schema isolation or a shared preview database
- only move to a dedicated preview database when isolation requirements become real

## Production Environments

For production on the Hetzner VPS:

- run the app under the repo's `flake.nix`
- run Postgres alongside the app first
- point your stable domain at the ForgeGraph-managed deployment
- drive deploys and secret changes through `forge`
- keep backups and migration steps explicit before moving to hosted Postgres
