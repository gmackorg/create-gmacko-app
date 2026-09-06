# Finish the queued review fixes (Phase 7 remainder + Phase 8 review items)

Worktree: ~/.config/superpowers/worktrees/create-gmacko-app/migrate-tanstack-effect-d1, branch migrate/tanstack-effect-d1, HEAD 4558ed1.
`NODE_OPTIONS=--max-old-space-size=4096` on every node/pnpm command.

Two earlier agents were cut off by rate limits and left ~44 modified files plus 4 untracked paths UNCOMMITTED and intermingled. Start with `git status` and `git diff` (and read the untracked files) to see what already exists; keep what is correct, finish the rest, commit it in coherent per-area commits. Do not stash or revert another agent's work without saying so in the report.

Already committed (do not redo): commits 929489e..4558ed1 = logging redaction/deep paths/core keys, telemetry base merge + 5s flush timeout, required provider secrets per stage, dev:portless links .env, turbo globalEnv, secrets-push --config, standards peer/optional deps in the web-bundle graph, i18n instance caching.

Reference briefs in the repo: docs/plans/briefs/brief-phase-7-fixes.md (items and the three decisions) and the Phase 8 review checklist reproduced below.

## A. Phase 7 remainder (partially started; untracked files exist)

1. **Monitoring wiring (decision: wire it).** apps/web uses `@gmacko/monitoring`: `initSentryWeb` + `SentryErrorBoundary` on the client, `sentryWorkerOptions`/`withSentry` from `@gmacko/monitoring/web/server` in the Worker entry. Remove the duplicated option objects and the direct `@sentry/*` deps from apps/web if nothing else needs them. Prove the client bundle never pulls `@sentry/cloudflare` (a test over the client import graph or a build-output grep).
2. **`scheduled` flushes telemetry** under the controller's `waitUntil`; close the `TODO(Phase 7)` in worker.ts with pool-workers tests for the withSentry-wrapped `fetch` and `scheduled`. The started approach (`src/server/make-worker.ts`, `vitest.workers.config.ts`, `src/server/__tests__/worker.workers.test.ts`) looks like the thin-factory route — finish it and say so in the report if Start's entry cannot load under pool-workers.
3. **Preview lane (decision: Workers Versions).** `.github/workflows/preview.yml` uploads a version of the single `gmacko-web-preview` Worker (`wrangler versions upload --env preview`) after `migrate:remote` in its own non-cancellable step; post the preview URL on the PR; no `--name`, no per-PR Worker, no close-job Worker deletion. Header comment: Phase 9's per-PR D1 task must revisit this. Update only the scaffolder string assertions that pin `wrangler deploy --env preview` / `gmacko-web-preview`.
4. **Single migrate owner (decision).** `.forgegraph.yaml` keeps `db.migrate`; stage `deploy` becomes `pnpm -F @gmacko/web deploy:<stage>` (plain `wrangler deploy --env <stage>`, no second migrate); `deploy/forgegraph/deploy.yml` runs `scripts/deploy-stage.mjs` once; fix the "single source" comment to name deploy-stage.mjs.
5. Drop `cancel-in-progress` (or scope it) so a migrate step is never cancelled.

## B. Phase 8 review items (partially started)

6. **Scaffolder scope-rename ordering**: run `updatePackageScope` after every generator that writes `@gmacko/...` (operator scripts, `.mcp.json`, next-steps/profile/operator blocks, `.forgegraph.yaml`, `provision.sh`) or template the scope into them. Extend `updatePackageScope` to the `TEXT_EXTENSIONS` set (`.yml/.yaml/.sh/.jsonc/.md`), keeping the `@gmacko/emulate` exclusion. Tests: custom scope + `--operator-lane` asserts `api:ops`, `mcp:app`, `.mcp.json`, and the generated `preview.yml`/`e2e.yml`/`sdk.yml` use the scope; add that cell to the vitest e2e and `cli-e2e.yml`.
7. **Prune with Expo kept**: `pruneIntegrations` must rewrite `apps/expo/src/providers.tsx` and `apps/expo/src/components/error-boundary.tsx` so no dangling `@gmacko/analytics/native` / `@gmacko/monitoring/native` imports remain; add a `--no-web --prune --integrations ""` cell (vitest + cli-e2e.yml) asserting the scaffold typechecks. Also delete the `db:migrate:*`/`db:seed` root scripts in `removeWebApp`.
8. **Ports**: `localhost:3000` → `3001` in apps/expo (`src/config/env.ts`, `app.config.ts`, `eas.json`, `.maestro/*`), `packages/api-cli` (+README), `packages/mcp-server/src/{index,core}.ts`, `packages/operator-core/src/index.ts`; grep for stragglers outside apps/web and docs/legacy.
9. **Docs**: `docs/ai/BOOTSTRAP_PLAYBOOK.md` paths → `packages/api/src/settings/{service,handlers,billing}.ts`; `packages/auth/script/auth-cli.ts` comment; AGENTS.md — mark the three unchecked bullets as convention / checked by `check:observability`, not `check:standards`.
10. **`pnpm run doctor` / `pnpm run setup`** (the bare forms hit pnpm's built-ins) in `scripts/bootstrap-local.sh`, `scripts/setup.sh`, README, BOOTSTRAP_PLAYBOOK, CLI README, and any scaffolder next-steps text.
11. **knip**: re-enable `duplicates` and `exports` (and `types` if cheap) with targeted ignores; fix genuine dead exports (unused `provision*` functions, duplicate default/named exports in `apps/expo/src/components/error-boundary.tsx` and `tooling/vitest/src/{base,react}.ts`); replace `optionalPeerDependencies: off` with per-workspace `ignoreDependencies` for expo / react-native / @vitejs/plugin-react; record what stays off and why in CONTRIBUTING.
12. **Changeset**: add `delete` to the API-key scope list; align the migrate command wording with what the CLI prints.
13. Cheap cleanups: leftover Next entries in `.gitignore`, `biome.json`, `.oxlintrc.json`, `.vscode/settings.json`; the stale comment in `apps/web/src/components/auth-showcase.tsx`.

## Gates (all must pass before the final commit)

`pnpm install` (only if a package.json dep changed; revert unrelated lockfile churn), `pnpm lint:ox`, `pnpm format:check`, `pnpm typecheck`, `pnpm check:standards`, `pnpm test:standards`, `pnpm test`, `pnpm test:workers`, `pnpm build`, `pnpm knip`, `pnpm -F @gmacko/web build`, `pnpm -F @gmacko/web deploy:staging:dry-run`, `pnpm --dir packages/create-gmacko-app test`, `pnpm e2e:web`, and `RUN_E2E=true pnpm e2e:cli:full` once at the end (slow; includes the two new cells).

Commit per area with conventional messages; `-c core.hooksPath=/dev/null` only when a hook trips on files you did not touch. Do not push, do not merge, do not deploy (dry runs only). Kill anything you start.

Report: every item A1–A5 and B6–B13 as done/skipped with evidence, all gate results, and anything left.
