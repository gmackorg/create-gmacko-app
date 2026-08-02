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

## Local Development (emulate + portless)

The local dev stack replaces Docker Compose with [`@gmacko/emulate`](https://www.npmjs.com/package/@gmacko/emulate) (Postgres via PGlite, Redis via redis-memory-server, plus GitHub/Google/Apple/Stripe/Resend service emulators) and `portless` for HTTPS `.localhost` URLs. Run `npx @gmacko/emulate init` to generate an `emulate.config.yaml` matching your production OAuth/service config. Use `--slug <name>` to namespace services so multiple projects can run concurrently.

**How SDK wiring works:**
- OAuth providers: `initAuth` uses better-auth's `genericOAuth` plugin with configurable provider URLs (defaults to real GitHub/Google/Apple URLs when env vars are unset). Set `AUTH_GITHUB_URL` etc. to point at emulate for local dev.
- Resend: the SDK natively reads `RESEND_BASE_URL` from the environment.
- Stripe: the `@gmacko/payments` package accepts `host`/`protocol`/`port` in `StripeConfig` for base URL override.
- Seed data (test users, OAuth apps, Stripe products) lives in `emulate.config.yaml`.

**Key env vars for local dev:**
| Variable | Purpose |
| --- | --- |
| `PORTLESS_URL` | App base URL (`https://gmacko.localhost`) |
| `AUTH_GITHUB_URL` | GitHub OAuth base URL (default: `https://github.com`) |
| `AUTH_GITHUB_API_URL` | GitHub API base URL (default: `https://api.github.com`) |
| `AUTH_GOOGLE_URL` | Google OAuth issuer URL (default: `https://accounts.google.com`) |
| `AUTH_GOOGLE_TOKEN_URL` | Google token endpoint (default: `https://oauth2.googleapis.com/token`) |
| `AUTH_APPLE_URL` | Apple OAuth issuer URL (default: `https://appleid.apple.com`) |
| `RESEND_BASE_URL` | Resend API base URL |
| `BYPASS_MAGIC_LINK` | Log magic links to console |
| `DATABASE_URL` | PGlite wire protocol (`postgresql://localhost:5432/gmacko_dev`) |
| `REDIS_URL` | redis-memory-server (`redis://localhost:6379`) |

## App Invariants (enforced by `pnpm check:standards`)

These are non-negotiable patterns that scaffolded apps must keep. Each maps to a
real bug that shipped into a generated app. `pnpm check:standards`
(`scripts/check-app-standards.mjs`, run in CI + `pnpm check:fast`) fails a PR
that breaks one. When a violation is a justified exception, silence that single
line with `// gmacko-standards-disable-next-line <rule>` and a reason.

- **Read validated env, not `process.env`** (`no-raw-process-env`). In app
  `src/**`, import the typed `env` (`~/env`, `@gmacko/*/env`) instead of reading
  `process.env.*` directly; add the var to the env schema if missing. `NODE_ENV`
  and `PORT` are the only conventional exceptions.
- **Validate env at boot** — the Expo entry (`apps/expo/index.ts`) imports the
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
- **Observability is part of boot validation** — the Expo boot check above treats
  a missing Sentry DSN / PostHog key as a hard error in preview/production, so a
  store build with no telemetry fails fast rather than shipping blind. This is
  enforced twice: at build time by `pnpm --filter @gmacko/expo check:observability`
  (gates `build:preview`/`build:prod` and the `mobile-production` workflow, failing
  before a cloud build starts), and at runtime by `src/config/env-validation.ts`.
- **Health endpoints never leak internals in production** — `api/health`,
  `api/health/ready`, and `.well-known/forge-health` return a generic message when
  `NODE_ENV === "production"`; raw error detail is dev-only.

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
