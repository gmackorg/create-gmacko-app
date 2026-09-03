---
"create-gmacko-app": minor
---

Breaking: the web lane is now TanStack Start + Effect on Cloudflare Workers with D1.

- `--web` scaffolds `apps/web`: one Cloudflare Worker running TanStack Start (React 19, Vite 8) and an Effect 4 `HttpApi` (`packages/domain` is the contract, `packages/api` the services) on Cloudflare D1 through Drizzle's Effect driver (`packages/db`). Local development is `pnpm dev` (`@gmacko/emulate` + the Worker under `portless`) against a local D1; there is no `DATABASE_URL`.
- Removed: the Next.js app (`apps/nextjs`), tRPC (`packages/legacy-api`), Postgres and drizzle-pg (`packages/legacy-db`), `packages/legacy-auth`, docker-compose/Dockerfile, the `vinext` lane, the `--tanstack-start` / `--vinext` flags, and the Next devtools MCP entry. `PlatformConfig` is `{ web, mobile }`.
- Renamed: `--trpc-operators` is `--operator-lane`; the generated root script `trpc:ops` is `api:ops`. The operator CLI and MCP server are wrappers over the app's HTTP API (`@gmacko/api-client`) and need an API key holding the `admin` scope; API keys are now scoped (`read`, `write`, `admin`).
- `.forgegraph.yaml` declares the D1 database and the migrate-then-deploy stages (`scripts/deploy-stage.mjs`); generated next steps cover `wrangler d1 create`, `pnpm db:migrate:local` and `pnpm deploy:staging`.
- Realtime (Redis + BullMQ) is Node-only: it stays off by default and the scaffolder warns when it is enabled, since the web app runs on Workers.
