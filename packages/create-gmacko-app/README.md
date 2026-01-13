# create-gmacko-app

[![npm version](https://img.shields.io/npm/v/create-gmacko-app.svg)](https://www.npmjs.com/package/create-gmacko-app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Create a new Gmacko app with Next.js, Expo, tRPC, and more.

## Quick Start

```bash
npx create-gmacko-app my-app
```

## Description

create-gmacko-app is a CLI tool designed to bootstrap production-ready, full-stack applications with a modern tech stack. It sets up a monorepo using Turborepo and pnpm workspaces, integrating web and mobile platforms with a shared backend and seamless AI workflows.

## CLI Options

| Option                           | Description                                                                                                         |
| :------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| `<app-name>`                     | Name of the app to create                                                                                           |
| `--yes, -y`                      | Accept all defaults without prompting                                                                               |
| `--prune`                        | Remove unused integration packages                                                                                  |
| `--no-install`                   | Skip pnpm install                                                                                                   |
| `--no-git`                       | Skip git init                                                                                                       |
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
- **Web Framework**: Next.js 15
- **Mobile Framework**: Expo SDK 54 / React Native 0.81
- **Optional Framework**: TanStack Start
- **Type-safe API**: tRPC v11 with OpenAPI support
- **Database Layer**: Drizzle ORM + Neon Postgres
- **Authentication**: Better-auth
- **Design System**: Tailwind CSS v4 + shadcn/ui components

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

## License

MIT
