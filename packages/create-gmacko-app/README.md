# create-gmacko-app

[![npm version](https://img.shields.io/npm/v/create-gmacko-app.svg)](https://www.npmjs.com/package/create-gmacko-app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Create a new Gmacko app with Next.js, Expo, Storybook, tRPC, ForgeGraph-first deployment guidance, and shared agent-native workflows.

## Quick Start

```bash
npx create-gmacko-app my-app
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
| `--integrations <list>`          | Comma-separated list of integrations (sentry, posthog, stripe, revenuecat, notifications, email, realtime, storage) |
| `--email-provider <provider>`    | Email provider (resend, sendgrid)                                                                                   |
| `--realtime-provider <provider>` | Realtime provider (pusher, ably)                                                                                    |
| `--storage-provider <provider>`  | Storage provider (uploadthing)                                                                                      |
| `--package-scope <scope>`        | Package scope (default: @gmacko)                                                                                    |

## Example Usage

### Recommended Setup (Default)

Includes Next.js, Expo, Sentry, and PostHog.

```bash
npx create-gmacko-app my-app
```

### Core Minimal Setup

Only the bare essentials without additional integrations.

```bash
npx create-gmacko-app my-app --integrations ""
```

### Full Featured Setup

Enable all integrations and extra apps.

```bash
npx create-gmacko-app my-app --tanstack-start --integrations sentry,posthog,stripe,revenuecat,notifications,email,realtime,storage
```

### Web Only Setup

Skip the mobile app and AI features.

```bash
npx create-gmacko-app my-app --no-mobile --no-ai
```

## Tech Stack

- **Monorepo Management**: Turborepo + pnpm workspaces
- **Web Framework**: Next.js 16
- **Component Development**: Storybook 10
- **Mobile Framework**: Expo SDK 55 / React Native 0.84
- **Optional Framework**: TanStack Start
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
- `fg:init`, `fg:doctor`, and `fg:status` as the default repo-level ForgeGraph command surface
- hosted Postgres only after the product has enough customers to justify the added operational split
- `jj` as the default repo shape, with colocated Git compatibility for GitHub and other tooling
- a modern baseline of `oxlint`, `biome`, `lefthook`, `commitlint`, and `knip`

## License

MIT
