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
- generated `.forgegraph.yaml` repo metadata with the app slug, flake ref, service hints, colocated Postgres note, and preview/production route placeholders already scaffolded
- optional CLI overrides for ForgeGraph server, stage node, and route placeholders
- `fg:init`, `fg:doctor`, `fg:status`, `fg:stages`, `fg:deploy:staging`, and `fg:deploy:production` as the default repo-level ForgeGraph command surface
- `--vinext` scaffolding that now emits:
  - `apps/nextjs/vite.config.ts`
  - `apps/nextjs/wrangler.jsonc`
  - `apps/nextjs/worker/index.ts`
  - `apps/nextjs/src/cloudflare-env.ts`
  - `prebuild:vinext`, `build:vinext`, `deploy:cloudflare:staging`, and `deploy:cloudflare:production`
- Expo development-build scripts and an app-local mobile README geared around Expo Orbit
- hosted Postgres only after the product has enough customers to justify the added operational split
- `jj` as the default repo shape, with colocated Git compatibility for GitHub and other tooling
- a modern baseline of `oxlint`, `biome`, `lefthook`, `commitlint`, and `knip`

For Cloudflare-specific commands and operating notes after scaffolding, see [../../deploy/cloudflare/README.md](/Volumes/dev/create-gmacko-app/deploy/cloudflare/README.md).

## First-Run Checklist

After scaffolding a new repo:

```bash
cd my-app
pnpm doctor
cp .env.example .env
docker compose up -d postgres
pnpm db:push
pnpm --filter @gmacko/auth generate
pnpm check:fast
```

`pnpm doctor` checks the local baseline for Node, pnpm, Docker Compose, `jj`, `fg`, `.env`, and `.forgegraph.yaml`. It also warns when ForgeGraph metadata still contains scaffold placeholders and, for `--vinext` apps, checks for Wrangler plus `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

## Maintaining The CLI

When changing the scaffolder itself, use:

```bash
pnpm check:release
```

That keeps validation scoped to `packages/create-gmacko-app` and the publish tarball. Full generated-app smoke coverage is handled in [../../.github/workflows/cli-e2e.yml](/Volumes/dev/create-gmacko-app/.github/workflows/cli-e2e.yml), including ForgeGraph script smoke checks, Expo dev-client/config smoke checks, and the `vinext` lane's Cloudflare doctor assertions. The workflow also exposes a manual `RUN_E2E=true` job for the full `src/__tests__/e2e.test.ts` suite.

## License

MIT
