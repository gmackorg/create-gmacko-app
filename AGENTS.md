# Agent Workflow

This repository is set up to work well with `Codex`, `Claude Code`, and `OpenCode`.

## Canonical Instructions

- Treat this file as the shared, repo-level instruction source.
- Keep `docs/ai/INITIAL_PROPOSAL.md`, `docs/ai/IMPLEMENTATION_PLAN.md`, and `DESIGN.md` aligned with major product and implementation changes.
- Prefer `jj` for local version control workflows. The repo is colocated with Git for interoperability.
- Use `pnpm`, `oxlint`, `biome`, and `turbo` as the default tooling surface.
- Use ForgeGraph for deployment workflows and `forge` from [`../ForgeGraph`](../ForgeGraph) when working against the real deployment control plane.
- Treat [docs/ai/DEVELOPER_EXPERIENCE.md](./docs/ai/DEVELOPER_EXPERIENCE.md) as the current support matrix for agent tooling, Cloudflare Workers, ForgeGraph, Nix, and mobile DX choices.
- When the optional SaaS bootstrap pack is scaffolded, keep the generated bootstrap playbook feature-aware across `Claude-only`, `Codex`, and `OpenCode` sections, and keep Claude-only slash commands labeled as such.

## Planning Flow

1. Turn the raw idea into a proposal in `docs/ai/INITIAL_PROPOSAL.md`.
2. Refine that proposal into `docs/ai/IMPLEMENTATION_PLAN.md`.
3. Write or update `DESIGN.md` when UI, product tone, or interaction patterns change materially.
4. Keep implementation work anchored to the current docs instead of stale conversation context.

## Local Development (emulate + portless + wrangler)

`pnpm dev` runs two things: [`@gmacko/emulate`](https://www.npmjs.com/package/@gmacko/emulate) (GitHub/Google/Apple/Stripe/Resend service emulators, no Postgres, no Redis) and the web app (`apps/web`, TanStack Start on workerd via the Cloudflare Vite plugin) under `portless`, at `https://gmacko.localhost`. The database is a local D1 in `apps/web/.wrangler/state`: `pnpm db:migrate:local && pnpm db:seed` once, then sign in with the emulated GitHub.

**How the Worker gets its variables:** Wrangler and the Vite plugin load `.env` from the directory of `wrangler.jsonc` and never from the repo root, and `process.env` is not copied into the Worker. So `apps/web/.env` is a symlink to the repo-root `.env` (created by the app's `predev`), `.env.example` documents the keys, and `AppConfig.fromBindings` (`apps/web/src/server/config.ts`) is the only reader. Under `pnpm dev`, `apps/web/scripts/dev-portless.mjs` also writes `PORTLESS_URL` into `apps/web/.env.local` so the Worker knows its public origin. **Never create `apps/web/.dev.vars`**: its presence disables `.env` loading; `pnpm check:standards` (`no-dev-vars`) fails on one.

**How SDK wiring works:**
- OAuth providers: better-auth's generic OAuth providers take their URLs from `AppConfig` (`AUTH_GITHUB_URL`, `AUTH_GOOGLE_URL`, ...; the real provider URLs when unset). Point them at emulate for local dev.
- Resend: the SDK natively reads `RESEND_BASE_URL`.
- Stripe: the `@gmacko/payments` package accepts `host`/`protocol`/`port` in `StripeConfig` for base URL override.
- Seed data (test users, OAuth apps, Stripe products) lives in `emulate.config.yaml`; emulate starts exactly the services that file lists.

**Key env vars for local dev:**
| Variable | Purpose |
| --- | --- |
| `STAGE` | `development` locally; `preview` / `staging` / `production` are wrangler vars per environment |
| `APP_URL` / `PORTLESS_URL` | Public origin (`https://gmacko.localhost` under portless, `http://localhost:3001` without) |
| `AUTH_SECRET`, `AUTH_GITHUB_ID` / `_SECRET`, `AUTH_GOOGLE_ID` / `_SECRET` | better-auth and the emulate OAuth seeds |
| `AUTH_GITHUB_URL`, `AUTH_GITHUB_API_URL` | GitHub OAuth/API base URLs (default: github.com / api.github.com) |
| `AUTH_GOOGLE_URL`, `AUTH_GOOGLE_TOKEN_URL` | Google issuer and token endpoint |
| `AUTH_APPLE_URL` | Apple OAuth issuer URL |
| `RESEND_BASE_URL` | Resend API base URL |
| `BYPASS_MAGIC_LINK` | Log magic links to the console (development only; other stages refuse to boot with it) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP export of traces/logs/metrics; unset → off |
| `VITE_POSTHOG_KEY`, `VITE_SENTRY_DSN`, `SENTRY_DSN` | Browser PostHog/Sentry and Worker Sentry; unset → off |

There is no `DATABASE_URL` for the web lane. Stage secrets are set in ForgeGraph and pushed to the Worker with `pnpm secrets:push --stage <stage>` (see `docs/DEPLOYMENT.md`).

## App Invariants (enforced by `pnpm check:standards`)

These are non-negotiable patterns that scaffolded apps must keep. Each maps to a
real bug that shipped into a generated app. `pnpm check:standards`
(`scripts/check-app-standards.mjs`, run in CI + `pnpm check:fast`) fails a PR
that breaks one. When a violation is a justified exception, silence that single
line with `// gmacko-standards-disable-next-line <rule>` and a reason.
Bullets that name a rule id are the ones `check:standards` enforces; the three
marked *convention* have no rule there — they are checked by
`pnpm --filter @gmacko/expo check:observability` (boot validation,
observability) and by the health tests (`packages/api/src/health/health.test.ts`).

- **Read validated env, not `process.env`** (`no-raw-process-env`). In app
  `src/**`, import the typed `env` (`~/env`, `@gmacko/*/env`) instead of reading
  `process.env.*` directly; add the var to the env schema if missing. `NODE_ENV`
  and `PORT` are the only conventional exceptions there. Inside the Worker
  bundle — every workspace package reachable from `apps/web`'s dependencies,
  listed by `pnpm check:standards --graph` — there is no process environment at
  all, so a package reads **no** `process.env`: it takes values as options or
  from `AppConfig` (`apps/web/src/server/config.ts` is the only reader of
  bindings). Node-only packages (`api-cli`, `mcp-server`, `realtime`) are not
  reachable from `apps/web` and keep their typed env modules.
- **Never create `.dev.vars`** (`no-dev-vars`). Its presence disables wrangler's
  `.env` loading, which is how emulate's values reach the Worker; stage secrets
  go in with `pnpm secrets:push --stage <stage>`.
- **Validate env at boot** (convention; checked by `check:observability`, not
  `check:standards`) — the Expo entry (`apps/expo/index.ts`) imports the
  `validate-boot` side-effect before `expo-router/entry`, and `config/env.ts`
  **throws** in preview/production for a missing/placeholder API URL or missing
  Sentry/PostHog config. Don't downgrade this to a silent fallback.
- **Exact-host checks, not substring** (`exact-host-check`). Validate an API host
  with `new URL(x).hostname === host`, never `url.includes(host)` (bypassable).
- **No committed credentials** (`no-committed-credentials`). Test/e2e configs and
  `.env.example` must require creds via env (throw/blank if unset) and only carry
  non-functional placeholders (`user@example.com`, `set-me-via-ci-secret`) — no
  working defaults, no `${VAR:-realsecret}` fallbacks.
- **Gate debug/verify routes** (`gate-debug-routes`). Any `dev`/`debug`/`verify`
  HTTP route must require a bearer secret (fail closed if unset in prod) or be
  restricted to non-production before it can capture events or leak env info.
- **True account deletion** (`no-partial-account-deletion`). Deletion must remove
  the auth `user` (which cascades sessions/accounts/apikeys via the schema), not
  just an app-specific table — App Store 5.1.1(v). Route deletion through
  `settings.deleteAccount`; don't hand-roll a partial delete.
- **No interactive transactions on D1** (`no-db-transaction`). In
  `packages/{db,auth,api,domain}/src` and `apps/web/src`, `db.transaction(...)`
  and `withTransaction` die at runtime on D1 (`@effect/sql-d1` has none). Use
  `Database.batch([...])` for atomic multi-statement writes and a guarded write
  (`Database.updateWhere`, precondition in the WHERE clause, 0 rows = Conflict)
  for read-check-write.
- **Only `runtime.ts` touches `cloudflare:workers`** (`no-cloudflare-env-outside-runtime`).
  `apps/web/src/server/runtime.ts` turns the Worker's ambient `env` and `waitUntil`
  into the Effect services (`AppConfig`, `Database`, `Background`); everything
  else takes those services, so it stays testable on the sqlite-node layer.
- **Data goes through the contract, not server functions** (`no-server-fn-for-data`).
  Reads and writes use `/api-client` (the `HttpApi` in `packages/domain`);
  `createServerFn` exists only for setting a cookie or redirecting and lives in
  `apps/web/src/server/actions.ts`.
- **Every endpoint names its credential** (`endpoint-declares-credential`). In
  `packages/domain/src/**/api.ts` a non-public endpoint declares exactly one of
  `Session` or `SessionOrKey(scope)`, after any role check (`AdminOnly`,
  `WorkspaceRole`) so the credential runs outermost (`docs/API_AUTH.md`, rule 6).
- **`Database.plain` is for better-auth only** (`no-plain-drizzle-in-api`). The
  promise-based drizzle bypasses the `DatabaseError` mapping and tracing; only
  `packages/auth` (the adapter) may use it. Everything else goes through
  `Database.db`.
- **D1 migrations are expand/contract only** (`no-d1-table-rebuild`). D1 ignores
  `PRAGMA foreign_keys=OFF` inside a migration batch, so drizzle-kit's `__new_`
  table rebuild cascade-deletes referencing rows. Any file under
  `packages/db/migrations` (after the two pre-provisioning ones) containing
  `__new_` or `PRAGMA foreign_keys=OFF` fails; see `docs/drizzle-migrations.md`.
- **Observability is part of boot validation** (convention; checked by
  `check:observability`, not `check:standards`) — the Expo boot check above treats
  a missing Sentry DSN / PostHog key as a hard error in preview/production, so a
  store build with no telemetry fails fast rather than shipping blind. This is
  enforced twice: at build time by `pnpm --filter @gmacko/expo check:observability`
  (gates `build:preview`/`build:prod` and the `mobile-production` workflow, failing
  before a cloud build starts), and at runtime by `src/config/env-validation.ts`.
- **Health endpoints never leak internals in production** (convention; covered
  by the health tests, not `check:standards`) — `api/health`,
  `api/health/ready`, and `.well-known/forge-health` return a generic message when
  `NODE_ENV === "production"`; raw error detail is dev-only.

## Runtime Invariants (checked by `pnpm test:fault`)

The invariants above are *static*: a grep-level rule says a pattern must not
appear. These are *behavioural*: a property that must hold while the app runs,
under perturbations the infrastructure is documented to produce. They are
checked by the CloudFault lane (`apps/web/fault/`, `docs/FAULT_TESTING.md`),
which perturbs a workload systematically and reduces any failure to the
smallest set of perturbations that reproduces it.

Checked today:

- **A Stripe webhook's side effect runs at most once per `event.id`**
  (`stripe-webhook-effect-at-most-once`). Stripe delivers at least once; the
  ledger in `@gmacko/api`'s `WebhookEvents` is what makes a redelivery a
  no-op. This is the invariant the lane was built to catch a violation of.
- **A 200 from the webhook endpoint means the effect ran**
  (`stripe-webhook-ack-implies-effect`). Stripe does not redeliver an
  acknowledged event, so acknowledging one you dropped loses it. This is why
  the ledger claim has two phases: a claim that commits while the Worker
  loses the result must not make the redelivery skip an effect that never ran.
- **A 200 implies a ledger row** (`stripe-webhook-ledger-records-every-acknowledged-event`).
- **The sign-up rate limiter fails open** (`signup-rate-limit-fails-open`): a
  D1 outage must let the call through rather than lock every caller out, and
  a working counter must still refuse past the allowance
  (`apps/web/fault/signup-rate-limit.fault.ts`).

Derived from the code and *not* yet checked here, with the reason:

- `completeBootstrap` and `reviewWaitlistEntry` — two concurrent callers yield
  exactly one success and one `Conflict`. Already covered as a logical race by
  `packages/api/src/admin/admin.workers.test.ts`; the infrastructure-fault
  version needs a mid-batch fault, which CloudFault cannot inject (see below).
- `acceptInvite` and `deleteAccount` — no partial membership/allowlist rows,
  and the cascade leaves no orphans. Same reason: both are `Database.batch`.
- API-key scopes (a `read` key cannot mutate) and the deleted-user session
  invariant — enforced before any write, so no infrastructure fault changes
  the answer; `packages/auth/src/__tests__/middleware.test.ts` covers them.
**The gap that bounds all of this**: `Database.batch([...])` is unperturbed.
`@effect/sql-d1` implements it with `db.batch()`, and CloudFault's D1 proxy
interposes on `prepare().bind().first/all/run/raw` only. Every guarded-write
service in `packages/api` is therefore out of reach of a mid-write fault.

## Evidence Rules (enforced by `pnpm lint:ox`)

Separate from the nine invariants above, `pnpm lint:ox` runs the vendored
[`anti-slop`](https://github.com/dmmulroy/anti-slop) oxlint plugin
(`tools/oxlint/anti-slop/`, registered in `oxlint.config.ts`). It rejects
**low-evidence TypeScript** — the class of code that passes `tsc` while
carrying no evidence: `unknown` parameters and returns,
`Record<string, unknown>` dictionaries, unjustified `as`, `x as unknown as T`,
ad hoc `typeof` narrowing instead of parsing at the boundary,
`...(cond ? { a } : {})`, and `vi.mock`/`jest.mock` instead of a real seam.
The Effect group also stops runtime code importing a `makeFoo` service
constructor instead of the owning `Layer`.

These rules ship to generated apps. Agents working in a generated app will hit
them. **Fix the code — do not suppress by default.** When a suppression is
genuinely correct it must carry a stated invariant:

- assertions: `// SAFETY: <what actually guarantees this type>` immediately
  above the `as` — name the schema, branch, or column type, never "cast needed";
- everything else: `// oxlint-disable-next-line anti-slop/<rule>` plus a
  sentence saying why the smell is not a smell here.

A bare disable is a review defect. `no-shape-in-symbol-names` is the one rule
turned off, with its reason in `oxlint.config.ts`. If another rule is
systematically wrong for the app, turn that one rule off there with a written
reason rather than scattering suppressions. Do not edit
`tools/oxlint/anti-slop/` — it is a verbatim vendored copy; see its README.

## Agent-Specific Notes

### Codex

- Codex reads `AGENTS.md` directly, so keep repo conventions here rather than scattering them across tool-specific files.
- If `.mcp.json` is present, use the configured MCP servers when available before falling back to manual inspection.
- Keep the repo portable across agents. Prefer shared docs and repo files over Codex-only conventions.

### Claude Code

- `CLAUDE.md` exists as the Claude-specific entrypoint for slash-command workflows and points back to this file for shared repo rules.
- Use the vendored `.claude/skills/gstack` commands when they match the task.
- Project hooks belong in `.claude/settings.json`, not in this file.
- Project subagents belong in `.claude/agents/` when they are narrow and reusable.
- This repo ships `.claude/settings.json` with `../ForgeGraph` available as an additional working directory.
- The generated SaaS bootstrap handoff should keep Claude-only slash commands separate from the repo-level guidance used by Codex and OpenCode.

### OpenCode

- OpenCode prefers `AGENTS.md` over `CLAUDE.md`, so keep duplicated guidance to a minimum.
- `opencode.json` should reference this file plus any high-signal planning docs that should always be loaded.
- Use OpenCode agents and rules for bounded task specialization, but keep repo conventions centralized here.
- Keep shared supplemental instructions in `opencode.json` instead of bloating `AGENTS.md`.
- The generated SaaS bootstrap handoff should point OpenCode at the same repo-level follow-ups as Codex, not at Claude-only slash commands.
