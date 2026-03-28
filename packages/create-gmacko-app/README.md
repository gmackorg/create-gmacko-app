# create-gmacko-app

[![npm version](https://img.shields.io/npm/v/create-gmacko-app.svg)](https://www.npmjs.com/package/create-gmacko-app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Create a new Gmacko app with Next.js, Expo, Storybook, tRPC, ForgeGraph-first deployment guidance, and shared agent-native workflows.

## Quick Start

```bash
pnpm dlx create-gmacko-app@latest my-app
```

## Description

create-gmacko-app is a CLI tool designed to bootstrap production-ready, full-stack applications with a modern tech stack. It sets up a monorepo using Turborepo and pnpm workspaces, integrating web and mobile platforms with a shared backend, colocated-Postgres-first deployment guidance, and shared agent workflows.

## CLI Options

| Option                           | Description                                                                                                         |
| :------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| `<app-name>`                     | Name of the app to create                                                                                           |
| `--yes, -y`                      | Accept all defaults without prompting                                                                               |
| `--prune`                        | Remove unused integration packages                                                                                  |
| `--no-install`                   | Skip pnpm install                                                                                                   |
| `--no-git`                       | Skip repository init (`jj`/`git`)                                                                                   |
| `--no-ai`                        | Exclude AI workflow system                                                                                          |
| `--no-provision`                 | Exclude provisioning script                                                                                         |
| `--web`                          | Include Next.js web app (default: true)                                                                             |
| `--no-web`                       | Exclude Next.js web app                                                                                             |
| `--mobile`                       | Include Expo mobile app (default: true)                                                                             |
| `--no-mobile`                    | Exclude Expo mobile app                                                                                             |
| `--tanstack-start`               | Include TanStack Start app                                                                                          |
| `--no-tanstack-start`            | Exclude TanStack Start app (default)                                                                                |
| `--vinext`                       | Add experimental `vinext` support to the Next.js app for a Cloudflare Workers lane                                 |
| `--saas-collaboration`          | Add workspace invites and team-management scaffolding                                                                |
| `--saas-billing`                | Add plans, billing-state, and limits scaffolding                                                                     |
| `--saas-metering`               | Add usage meters and rollup scaffolding                                                                              |
| `--saas-support`                | Add contact/support/public help surfaces                                                                             |
| `--saas-launch`                 | Add maintenance mode, signup controls, waitlist, and allowlist scaffolding                                           |
| `--saas-referrals`              | Add referral and launch-growth scaffolding                                                                           |
| `--saas-operator-apis`          | Mark the app runtime as exposing operator API capability layers                                                      |
| `--saas-bootstrap`               | Add the optional Claude SaaS bootstrap pack (`/office-hours` -> optional `/autoplan` -> `/design-consultation` + local follow-up skills) |
| `--trpc-operators`               | Add the optional operator lane with CLI + MCP wrappers over the same tRPC API                                      |
| `--forgegraph-server <url>`      | Write a ForgeGraph server URL into `.forgegraph.yaml`                                                               |
| `--forgegraph-staging-node <id>` | Write the staging node placeholder into `.forgegraph.yaml`                                                          |
| `--forgegraph-production-node <id>` | Write the production node placeholder into `.forgegraph.yaml`                                                   |
| `--forgegraph-preview-domain <domain>` | Write the preview domain placeholder into `.forgegraph.yaml`                                               |
| `--forgegraph-production-domain <domain>` | Write the production domain placeholder into `.forgegraph.yaml`                                         |
| `--integrations <list>`          | Comma-separated list of integrations (sentry, posthog, stripe, revenuecat, notifications, email, realtime, storage) |
| `--email-provider <provider>`    | Email provider (resend, sendgrid)                                                                                   |
| `--realtime-provider <provider>` | Realtime provider (pusher, ably)                                                                                    |
| `--storage-provider <provider>`  | Storage provider (uploadthing)                                                                                      |
| `--package-scope <scope>`        | Package scope (default: @gmacko)                                                                                    |

## Example Usage

### Recommended Setup (Default)

Includes Next.js, Expo, Sentry, and PostHog.

```bash
pnpm dlx create-gmacko-app@latest my-app
```

### Core Minimal Setup

Only the bare essentials without additional integrations.

```bash
pnpm dlx create-gmacko-app@latest my-app --integrations ""
```

### Full Featured Setup

Enable all integrations and extra apps.

```bash
pnpm dlx create-gmacko-app@latest my-app --tanstack-start --integrations sentry,posthog,stripe,revenuecat,notifications,email,realtime,storage
```

### Web Only Setup

Skip the mobile app and AI features.

```bash
pnpm dlx create-gmacko-app@latest my-app --no-mobile --no-ai
```

### Experimental Cloudflare Setup

Add the `vinext` Workers lane to the generated Next app.

```bash
pnpm dlx create-gmacko-app@latest my-app --no-mobile --no-ai --vinext
```

### Claude Bootstrap Setup

Add the post-setup SaaS bootstrap pack for Claude Code.

```bash
pnpm dlx create-gmacko-app@latest my-app --saas-bootstrap
```

### Operator Setup

Add the optional tRPC-backed operator lane.

```bash
pnpm dlx create-gmacko-app@latest my-app --trpc-operators
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
- **Web Framework**: Next.js 16
- **Component Development**: Storybook 10
- **Mobile Framework**: Expo SDK 55 / React Native 0.84
- **Optional Framework**: TanStack Start
- **Experimental Workers Lane**: `vinext` for Next-style apps on Cloudflare Workers
- **Type-safe API**: tRPC v11 with OpenAPI support
- **Database Layer**: Drizzle ORM + Postgres, with the recommended default being a colocated database before moving to hosted infrastructure
- **Authentication**: Better-auth
- **Design System**: Tailwind CSS v4 + shadcn/ui components
- **DX Baseline**: `jj`, `oxlint`, `biome`, `lefthook`, `commitlint`, `knip`
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

If you scaffold with `--trpc-operators`, generated apps also expose:

```bash
pnpm trpc:ops -- --help
pnpm trpc:ops -- auth_help
pnpm trpc:ops -- get_workspace_context
pnpm trpc:ops -- list_api_keys
pnpm trpc:ops -- get_billing_overview
pnpm mcp:app
```

Both surfaces call into the same underlying tRPC API contract.

## SaaS Scaffold Maturity

- Stable: first-run bootstrap, workspace-centric onboarding, collaboration, billing/limits/metering primitives, support, launch controls, referrals, and the operator wrapper lane.
- Stable: shared platform primitives for feature flags, jobs, rate limits, bot protection, and compliance hooks.
- Thin-by-design: email delivery, compliance workflows, and background jobs are scaffolded as extension points rather than full products.
- Later-phase: multi-workspace UX, audit logs, ownership transfer, deeper billing automation, webhooks, and richer support tooling.

See [../../docs/ai/DEVELOPER_EXPERIENCE.md](/Volumes/dev/create-gmacko-app/docs/ai/DEVELOPER_EXPERIENCE.md) for the current recommendations around Codex, Claude Code, OpenCode, Expo Orbit, Cloudflare Workers, ForgeGraph, and Nix.

## Storybook

The generated Next.js app includes Storybook for isolated UI work.

```bash
pnpm --filter @gmacko/nextjs storybook
```

## Optional Integrations

- **Monitoring**: Sentry
- **Analytics**: PostHog
- **Payments**: Stripe (web)
- **Mobile Subscriptions**: RevenueCat (mobile)
- **Communication**: Push notifications (Expo) and Email (Resend/SendGrid)
- **Realtime Data**: Pusher or Ably
- **File Storage**: UploadThing

## Repository

The source code is available on GitHub: [https://github.com/gmackorg/create-gmacko-app](https://github.com/gmackorg/create-gmacko-app)

## Deployment Guidance

Generated apps should be guided toward:

- ForgeGraph-managed deployments as the default operating model
- Hetzner VPS hosting with Postgres deployed alongside the app in the early stage
- Nix-based build and runtime definitions as the repo evolves into a ForgeGraph-native deployment target
- generated `.forgegraph.yaml` aligned to the live `forge` repo contract with `app`, `server`, `stages`, and operator notes as comments
- optional CLI overrides for ForgeGraph server, stage node, and route placeholders
- `forge:init`, `forge:doctor`, `forge:status`, `forge:diff`, `forge:apply`, `forge:pull`, `forge:stages`, `forge:deploy:staging`, and `forge:deploy:production` as the default repo-level ForgeGraph command surface
- `--vinext` scaffolding that now emits:
  - `apps/nextjs/vite.config.ts`
  - `apps/nextjs/wrangler.jsonc`
  - `apps/nextjs/worker/index.ts`
  - `apps/nextjs/src/cloudflare-env.ts`
  - `apps/nextjs/README.cloudflare.md`
  - `prebuild:vinext`, `build:vinext`, `deploy:cloudflare:staging`, and `deploy:cloudflare:production`
- Expo development-build scripts and an app-local mobile README geared around Expo Orbit
- Expo Sign in with Apple scaffolding, in-app account deletion, and `check:app-store` placeholder validation for App Store readiness
- hosted Postgres only after the product has enough customers to justify the added operational split
- `jj` as the default repo shape, with colocated Git compatibility for GitHub and other tooling
- a modern baseline of `oxlint`, `biome`, `lefthook`, `commitlint`, and `knip`

For Cloudflare-specific commands and operating notes after scaffolding, see [../../deploy/cloudflare/README.md](/Volumes/dev/create-gmacko-app/deploy/cloudflare/README.md).

## First-Run Checklist

After scaffolding a new repo:

```bash
cd my-app
pnpm bootstrap:local
pnpm check:fast
```

`pnpm doctor` checks the local baseline for Node, pnpm, Docker Compose, `jj`, `forge`, `.env`, and `.forgegraph.yaml`. It also warns when ForgeGraph config still contains scaffold placeholders, verifies grouped core/ForgeGraph env values, and, for `--vinext` apps, checks Wrangler plus grouped Cloudflare env values.

## Maintaining The CLI

When changing the scaffolder itself, use:

```bash
pnpm check:release
pnpm e2e:cli:full
```

`pnpm check:release` keeps validation scoped to `packages/create-gmacko-app` and the publish tarball. `pnpm e2e:cli:full` runs the slower generated-app suite locally with `RUN_E2E=true`. Full generated-app smoke coverage is handled in [../../.github/workflows/cli-e2e.yml](/Volumes/dev/create-gmacko-app/.github/workflows/cli-e2e.yml), including ForgeGraph script smoke checks, auth/db bootstrap checks, health-route assertions, Expo dev-client/config smoke checks, and the `vinext` lane's Cloudflare doctor assertions. The workflow also exposes a manual `RUN_E2E=true` job for the full `src/__tests__/e2e.test.ts` suite.

## License

MIT
