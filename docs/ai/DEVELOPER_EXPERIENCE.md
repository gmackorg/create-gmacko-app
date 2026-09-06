# Developer Experience

This repo is designed around a few stable assumptions:

- The web app is one Cloudflare Worker per stage (TanStack Start + Effect `HttpApi`) with a D1 database per stage; ForgeGraph is the deployment control plane.
- There is no database server to run: development uses a local D1 under `apps/web/.wrangler/state`, and the service emulators come from `@gmacko/emulate`.
- `jj` is the default local VCS, with Git compatibility kept for GitHub and external tooling.
- Shared repo instructions belong in `AGENTS.md`, not split across tool-specific files.

## Agent Workflow

Use this layout for agent-native development:

- `AGENTS.md`: canonical repo instructions for Codex, Claude Code, and OpenCode, including the "App Invariants" that `pnpm check:standards` enforces.
- `CLAUDE.md`: Claude-specific entrypoint for gstack and slash-command workflows.
- `.claude/settings.json`: Claude project permissions, including `../ForgeGraph` as an additional working directory for deployment workflows.
- `opencode.json`: loads shared repo docs into OpenCode without duplicating them in `AGENTS.md`.
- `.mcp.json`: project MCP declaration for agent-assisted tooling.

### Codex

- Keep high-signal repo conventions in `AGENTS.md`.
- Use MCP servers when they are configured and relevant before falling back to manual inspection.
- Prefer shared docs over Codex-only guidance so the repo stays portable across tools.
- Add the OpenAI developer docs MCP server in your Codex user config for API, Codex, and platform-doc lookups:
  - `codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp`

### Claude Code

- Keep project-level settings in `.claude/settings.json` when hooks, MCP permissions, or other Claude-specific settings are needed.
- Use project subagents in `.claude/agents/` only for narrow, reusable jobs.
- Keep gstack vendored for Claude slash-command workflows, but do not make the rest of the repo depend on Claude-only file conventions.
- Use `.claude/commands/` only for project-specific reusable workflows that genuinely need a slash command entrypoint.

### OpenCode

- OpenCode prefers `AGENTS.md` and falls back to `CLAUDE.md` only when `AGENTS.md` is absent.
- Keep shared supplemental docs in `opencode.json`.
- Use OpenCode agents for focused planning/review/build roles when that improves context hygiene.
- Use OpenCode `permission` settings to keep destructive or high-risk MCP tools on approval instead of overloading `AGENTS.md` with tool policy.

## MCP

`.mcp.json` ships empty (`{ "mcpServers": {} }`). The optional operator lane
(`--operator-lane`) adds a `gmacko-app` entry pointing at the app's own MCP
server (`packages/mcp-server`, `pnpm mcp:app`), which wraps the same `HttpApi`
the web app serves and authenticates with an API key holding the `admin`
scope. Debugging the running app goes through its own surfaces: Workers Logs
(`wrangler tail`), the OTLP trace per endpoint, and the health routes.

## Web Stack

The only web lane:

- `apps/web`: TanStack Start (React 19, Vite 8) rendered on workerd through `@cloudflare/vite-plugin`, with the Effect 4 `HttpApi` (`packages/domain` contract, `packages/api` handlers) mounted at `/api/*` in the same Worker.
- Database: Cloudflare D1 through Drizzle's Effect API (`packages/db`); migrations in `packages/db/migrations`, applied with `wrangler d1 migrations apply` before every deploy.
- Auth: better-auth 1.7 (`packages/auth`).
- Deploy: one Worker + one D1 per stage, `scripts/deploy-stage.mjs` (migrate, then `wrangler deploy`), orchestrated by ForgeGraph (`docs/DEPLOYMENT.md`).
- Local: `pnpm dev` = `@gmacko/emulate` + `apps/web` under `portless` at `https://gmacko.localhost`.
- UI isolation: Storybook in `packages/ui` (`pnpm --filter @gmacko/ui storybook`).
- Lint/format/check baseline: `oxlint`, `biome`, `tsc --noEmit`, `knip`, `pnpm check:standards`.

### Workers Integration Matrix

Use these labels literally when describing an integration on the web lane:

- `stable`: works on the Worker and is wired in the template; recommend without caveats
- `experimental`: plausible on the Worker, but the wiring is thin or unverified in a deployed stage
- `unsupported`: does not run on the Worker; do not position it as part of the web lane

| Integration | Web lane (TanStack Start + Effect on Workers) | How |
| --- | --- | --- |
| Sentry | stable | `@sentry/cloudflare` `withSentry` around the Worker (`SENTRY_DSN`); `@sentry/react` in the browser (`VITE_SENTRY_DSN`) |
| PostHog | stable | browser SDK via `@gmacko/analytics` (`VITE_POSTHOG_KEY`) |
| Stripe | stable | `POST /api/webhooks/stripe` through `@gmacko/payments` (SubtleCrypto signature check, fetch HTTP client) |
| Email | stable | Resend through `@gmacko/email` (`RESEND_BASE_URL` overridable for emulate) |
| OTLP telemetry | stable | `@gmacko/telemetry` over `effect/unstable/observability`, flushed on `waitUntil` |
| Storage | stable, off by default | Cloudflare R2 through an `r2_buckets` binding (`BUCKET`), mounted at `POST/GET /api/storage` (`apps/web/src/routes/api.storage.$.ts`). `@gmacko/storage` owns authorization, the content-type allow-list and the size ceiling, because a bucket enforces none of them; there is no virus scanning and no CDN URL per file — packages/storage/README.md |
| Realtime | unsupported | `@gmacko/realtime` is ioredis + BullMQ, Node-only; use it only from a separately deployed Node service |

If an integration is not clearly `stable`, call out the risk in docs and generated guidance instead of implying parity.

## SaaS Scaffold Maturity

Current SaaS direction:

- `stable`: guided first-run bootstrap, workspace-centric onboarding, collaboration, billing/limits/metering primitives, support/public shell, launch controls, referrals, operator wrapper lane
- `stable`: shared platform primitives for feature flags, jobs, rate limits, bot protection, and compliance hooks
- `guided`: Resend-backed email delivery and related product flows when email integration is enabled
- `later`: audit logs, multi-workspace UX, ownership transfer, webhooks, advanced support tooling, deeper billing automation

Keep generated guidance honest. If a capability is only scaffolded as a hook or placeholder, say that explicitly instead of presenting it as a complete subsystem.

## Mobile Stack

Current mobile DX recommendations:

- Expo SDK 56 / React Native 0.85 in the repo should be kept current with Expo's stable line.
- The Expo app talks to the Worker's API through `@gmacko/api-client` with the better-auth Expo client; `apps/expo/src/config/env.ts` refuses to boot a preview or production build without a real API URL, Sentry DSN, and PostHog key.
- Prefer development builds over long-term Expo Go usage for production-grade apps.
- Use Expo Orbit for one-click simulator/device launches and build installs.
- Keep React Native New Architecture assumptions in mind when evaluating third-party libraries.

## Repo Standards

- Use `jj` locally and keep Git interop intact.
- Use `forge` from `../ForgeGraph` for real deployment workflows.
- Keep `.forgegraph.yaml` checked in as the per-repo ForgeGraph metadata surface (`cloudflare-workers` targets, D1 resources, the migrate command).
- Expose the common ForgeGraph workflow through repo scripts such as `pnpm forge:init`, `pnpm forge:doctor`, `pnpm forge:status`, and `pnpm forge:deploy:<stage>`.
- Keep docs current when framework, deployment, or agent conventions change.
- Favor shared standards over vendor-specific sprawl.
