# create-gmacko-app

[![npm version](https://img.shields.io/npm/v/create-gmacko-app.svg)](https://www.npmjs.com/package/create-gmacko-app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Create a new Gmacko app: TanStack Start + Effect on Cloudflare Workers with D1, Expo, Storybook, ForgeGraph deployment guidance, and shared agent-native workflows.

## Quick Start

```bash
pnpm dlx create-gmacko-app@latest my-app
```

## Description

create-gmacko-app is a CLI tool that bootstraps a production-ready, full-stack application as a Turborepo + pnpm monorepo. The web app is one Cloudflare Worker: TanStack Start for rendering and routing plus an Effect `HttpApi` serving `/api/*`, backed by Cloudflare D1. The Expo app, the operator CLI and the MCP server all consume that same API through the typed `@gmacko/api-client`.

## CLI Options

| Option                                   | Description                                                                                                         |
| :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| `<app-name>`                             | Name of the app to create                                                                                           |
| `--yes, -y`                              | Accept all defaults without prompting                                                                               |
| `--prune`                                | Remove unused integration packages                                                                                  |
| `--no-install`                           | Skip pnpm install                                                                                                   |
| `--no-git`                               | Skip repository init (`jj`/`git`)                                                                                   |
| `--no-ai`                                | Exclude AI workflow system                                                                                          |
| `--no-provision`                         | Exclude provisioning script                                                                                         |
| `--web`                                  | Include the web app: TanStack Start + Effect on Cloudflare Workers with D1 (default: true)                          |
| `--no-web`                               | Exclude the web app (mobile-only scaffold; the Expo app targets a separately hosted API)                            |
| `--mobile`                               | Include Expo mobile app (default: true)                                                                             |
| `--no-mobile`                            | Exclude Expo mobile app                                                                                             |
| `--saas-collaboration`                   | Add workspace invites and team-management scaffolding                                                               |
| `--saas-billing`                         | Add plans, billing-state, and limits scaffolding                                                                    |
| `--saas-metering`                        | Add usage meters and rollup scaffolding                                                                             |
| `--saas-support`                         | Add contact/support/public help surfaces                                                                            |
| `--saas-launch`                          | Add maintenance mode, signup controls, waitlist, and allowlist scaffolding                                          |
| `--saas-referrals`                       | Add referral and launch-growth scaffolding                                                                          |
| `--saas-operator-apis`                   | Mark the app runtime as exposing operator API capability layers (implies `--operator-lane`)                         |
| `--saas-bootstrap`                       | Add the optional Claude SaaS bootstrap pack (`/office-hours` -> optional `/autoplan` -> `/design-consultation` + local follow-up skills) |
| `--operator-lane`                        | Add the optional operator lane: CLI + MCP wrappers over the app's HTTP API (admin-scoped API keys)                  |
| `--forgegraph`                           | Enable ForgeGraph integrations (health, logging, OTEL)                                                               |
| `--forgegraph-server <url>`              | Write a ForgeGraph server URL into `.forgegraph.yaml`                                                               |
| `--forgegraph-preview-domain <domain>`   | Write the preview domain placeholder into `.forgegraph.yaml`                                                        |
| `--forgegraph-production-domain <domain>`| Write the production domain placeholder into `.forgegraph.yaml`                                                     |
| `--integrations <list>`                  | Comma-separated list of integrations (sentry, posthog, stripe, revenuecat, notifications, email, realtime, storage) |
| `--email-provider <provider>`            | Email provider (resend, sendgrid)                                                                                   |
| `--storage-provider <provider>`          | Storage provider (uploadthing)                                                                                      |
| `--package-scope <scope>`                | Package scope (default: @gmacko)                                                                                    |

`realtime` (Redis + BullMQ) is Node-only and cannot run on the Workers web app; it is off in every preset except "everything", and the scaffolder warns when it is enabled.

## Example Usage

### Recommended Setup (Default)

Includes the web app, Expo, Sentry, and PostHog.

```bash
pnpm dlx create-gmacko-app@latest my-app
```

### Core Minimal Setup

Only the bare essentials without additional integrations.

```bash
pnpm dlx create-gmacko-app@latest my-app --integrations ""
```

### Full Featured Setup

Enable all Workers-compatible integrations.

```bash
pnpm dlx create-gmacko-app@latest my-app --integrations sentry,posthog,stripe,revenuecat,notifications,email,storage
```

### Web Only Setup

Skip the mobile app and AI features.

```bash
pnpm dlx create-gmacko-app@latest my-app --no-mobile --no-ai
```

### Mobile Only Setup

No Worker; the Expo app points `EXPO_PUBLIC_API_URL` at a hosted API.

```bash
pnpm dlx create-gmacko-app@latest my-app --no-web
```

### Claude Bootstrap Setup

Add the post-setup SaaS bootstrap pack for Claude Code.

```bash
pnpm dlx create-gmacko-app@latest my-app --saas-bootstrap
```

### Operator Setup

Add the optional operator lane (CLI + MCP server over the HTTP API).

```bash
pnpm dlx create-gmacko-app@latest my-app --operator-lane
```

### SaaS Layer Setup

Add only the SaaS business layers you actually need.

```bash
pnpm dlx create-gmacko-app@latest my-app \
  --saas-collaboration \
  --saas-billing \
  --saas-metering \
  --saas-support \
  --saas-launch \
  --saas-referrals
```

## Tech Stack

- **Monorepo Management**: Turborepo + pnpm workspaces
- **Web App**: TanStack Start (React 19, Vite 8) on Cloudflare Workers via `@cloudflare/vite-plugin`
- **API**: Effect 4 `HttpApi` — the contract in `packages/domain`, the services in `packages/api`, the typed client in `packages/api-client` (browser, SSR loader, Expo, operator tools)
- **Database**: Cloudflare D1 through Drizzle's Effect driver (`@effect/sql-d1`), forward-only expand/contract migrations applied with `wrangler d1 migrations apply`
- **Authentication**: better-auth (magic link, GitHub/Google/Apple, Expo, scoped API keys)
- **Component Development**: Storybook 10 in `packages/ui`
- **Mobile Framework**: Expo SDK 56 / React Native 0.85
- **Design System**: Tailwind CSS v4 + shadcn/ui components
- **Local Development**: `@gmacko/emulate` (GitHub/Google/Apple/Stripe/Resend emulators) + `portless` + a local D1
- **DX Baseline**: `jj`, `oxlint`, `biome`, `lefthook`, `commitlint`, `knip`, `pnpm check:standards`
- **Agent Workflow**: `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json`, `opencode.json`, `.mcp.json`, and vendored Claude Code gstack skills

## AI Planning Workflow

Generated apps include `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json`, `opencode.json`, `.mcp.json`, `docs/ai/INITIAL_PROPOSAL.md`, and a vendored `.claude/skills/gstack` install.

1. Use `superpowers:brainstorming` to write the initial proposal to `docs/ai/INITIAL_PROPOSAL.md`.
2. Run `/plan-ceo-review` and `/plan-eng-review` to refine the proposal and implementation plan.
3. Run `/design-consultation` to define the design philosophy and write `DESIGN.md`.
4. If the gstack commands are unavailable, run `cd .claude/skills/gstack && ./setup`.

If you scaffold with `--saas-bootstrap`, generated apps also include:

- `docs/ai/BOOTSTRAP_PLAYBOOK.md`
- `.claude/skills/bootstrap-saas`
- `.claude/skills/launch-landing-page`
- `.claude/skills/setup-stripe-billing`
- `.claude/skills/bootstrap-expo-app`
- `.claude/skills/test-mobile-with-maestro`

That pack is designed to run after `pnpm bootstrap:local`, with `/office-hours` first, optional user-level `/autoplan` second, and `/design-consultation` before deeper implementation work.

If you scaffold with `--operator-lane`, generated apps also expose:

```bash
pnpm api:ops -- --help
pnpm api:ops -- auth_help
pnpm api:ops -- get_workspace_context
pnpm api:ops -- list_api_keys
pnpm api:ops -- get_billing_overview
pnpm mcp:app
```

Both surfaces call the same HTTP API through `@gmacko/api-client`; protected tools need `GMACKO_API_KEY` set to a key holding the `admin` scope. With AI files kept, `.mcp.json` also registers the app's MCP server as `gmacko-app`.

## SaaS Scaffold Maturity

- Stable: first-run bootstrap, workspace-centric onboarding, collaboration, billing/limits/metering primitives, support, launch controls, referrals, and the operator wrapper lane.
- Stable: shared platform primitives for feature flags, jobs, rate limits, bot protection, and compliance hooks.
- Thin-by-design: email delivery, compliance workflows, and background jobs are scaffolded as extension points rather than full products.
- Later-phase: multi-workspace UX, audit logs, ownership transfer, deeper billing automation, webhooks, and richer support tooling.

See [../../docs/ai/DEVELOPER_EXPERIENCE.md](../../docs/ai/DEVELOPER_EXPERIENCE.md) for the current recommendations around Codex, Claude Code, OpenCode, Expo Orbit, Cloudflare Workers, and ForgeGraph.

## Storybook

Shared UI lives in `packages/ui`, which ships Storybook for isolated component work.

```bash
pnpm --filter @gmacko/ui storybook
```

## Optional Integrations

- **Monitoring**: Sentry (`@sentry/cloudflare` in the Worker, `@sentry/react` in the browser, `@sentry/react-native` in Expo)
- **Analytics**: PostHog
- **Payments**: Stripe (web; webhook route `POST /api/webhooks/stripe`)
- **Mobile Subscriptions**: RevenueCat (mobile)
- **Communication**: Push notifications (Expo) and Email (Resend/SendGrid)
- **Realtime Data**: Redis + BullMQ, Node services only
- **File Storage**: UploadThing

## Repository

The source code is available on GitHub: [https://github.com/gmackorg/create-gmacko-app](https://github.com/gmackorg/create-gmacko-app)

## Deployment Guidance

Generated apps are guided toward:

- ForgeGraph as the deployment control plane: one Cloudflare Worker and one D1 database per stage (`<app>-web-staging`, `<app>-web`; PR previews share `<app>-web-preview`)
- a generated `.forgegraph.yaml` with the `d1` database contract, `cloudflare-workers` stage targets, the health URL, and operator notes as comments
- `scripts/deploy-stage.mjs` as the single migrate-then-deploy sequence (`pnpm deploy:staging`, `pnpm deploy:production`); ForgeGraph runs the same script
- stage secrets in ForgeGraph, pushed to the Worker with `pnpm secrets:push --stage <stage>`
- `forge:init`, `forge:doctor`, `forge:status`, `forge:diff`, `forge:apply`, `forge:pull`, `forge:stages`, `forge:deploy:staging`, and `forge:deploy:production` as the repo-level ForgeGraph command surface
- Expo development-build scripts and an app-local mobile README geared around Expo Orbit
- Expo Sign in with Apple scaffolding, in-app account deletion, and `check:app-store` placeholder validation for App Store readiness
- `jj` as the default repo shape, with colocated Git compatibility for GitHub and other tooling
- a modern baseline of `oxlint`, `biome`, `lefthook`, `commitlint`, and `knip`

Deployment details live in the generated `docs/DEPLOYMENT.md` and `docs/RUNBOOK.md`.

## First-Run Checklist

After scaffolding a new repo:

```bash
cd my-app
pnpm bootstrap:local   # doctor, .env, auth + db generate, local D1 migrate + seed, check:fast
pnpm dev               # emulate + apps/web at https://gmacko.localhost
```

`pnpm doctor` checks the local baseline for Node, pnpm, `jj`, `forge`, `.env`, `.forgegraph.yaml`, and the absence of `apps/web/.dev.vars`. It also warns when ForgeGraph config still contains scaffold placeholders, verifies grouped core/ForgeGraph env values, and, when the web app is present, checks Wrangler plus the Cloudflare env values needed for deploys.

## Maintaining The CLI

When changing the scaffolder itself, use:

```bash
pnpm check:release
pnpm e2e:cli:full
```

`pnpm check:release` keeps validation scoped to `packages/create-gmacko-app` and the publish tarball. `pnpm e2e:cli:full` runs the slower generated-app suite locally with `RUN_E2E=true`. Full generated-app smoke coverage is handled in [../../.github/workflows/cli-e2e.yml](../../.github/workflows/cli-e2e.yml): default (web + mobile), operator lane, minimal (web only), custom scope, full, and mobile-only scaffolds, including ForgeGraph script smoke checks, auth/db bootstrap checks, a local D1 migrate + seed + Workers test run, a fake-wrangler migrate-then-deploy smoke, and Expo dev-client/config smoke checks. The workflow also exposes a manual `RUN_E2E=true` job for the full `src/__tests__/e2e.test.ts` suite.

## License

MIT
