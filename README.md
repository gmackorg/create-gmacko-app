# create-gmacko-app

A fork of [create-t3-turbo](https://github.com/t3-oss/create-t3-turbo) rebuilt around one Cloudflare Worker:

- the web app (`apps/web`) is TanStack Start (React 19, Vite) plus an Effect `HttpApi` serving `/api/*`, deployed as a single Worker per stage
- the database is Cloudflare D1 (SQLite) through Drizzle's Effect API; migrations are checked in and applied before every deploy
- one API contract (`packages/domain`) shared by the browser, the SSR loader, Expo, the operator CLI/MCP server, and the generated SDKs
- better-auth for magic-link, GitHub/Google/Apple sign-in, the Expo client, and scoped API keys
- ForgeGraph as the deployment control plane (Workers + D1 per stage, secrets pushed from ForgeGraph)
- `jj`-first repository setup with colocated Git compatibility
- a baseline standards stack of `oxlint`, `biome`, `lefthook`, `commitlint`, `knip`, and `pnpm check:standards`
- conditional integration system (Sentry, PostHog, Stripe, Email, Realtime, Storage)
- modular SaaS scaffold layers for collaboration, billing, metering, support, launch controls, referrals, operator APIs, and shared platform primitives
- shared agent workflow support for Codex, Claude Code, and OpenCode via `AGENTS.md`, `CLAUDE.md`, `opencode.json`, and `.mcp.json`
- optional Claude-first SaaS bootstrap guidance after local setup, including `/office-hours`, optional user-level `/autoplan`, `/design-consultation`, and local follow-up skills
- optional operator surfaces where both the CLI and MCP server are wrappers over the same HTTP API
- Storybook in `packages/ui` for isolated UI development

The decision record for the stack is [`docs/adr/0001-tanstack-effect-d1.md`](./docs/adr/0001-tanstack-effect-d1.md); the architecture is in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Installation

> [!NOTE]
>
> Make sure to follow the system requirements specified in [`package.json#engines`](./package.json#L4) before proceeding.

Scaffold a new app:

```bash
npx create-gmacko-app my-app
```

Or clone this repository to work on the template itself:

```bash
git clone https://github.com/gmackorg/create-gmacko-app.git my-app
cd my-app
pnpm run setup
```

## About

It uses [Turborepo](https://turborepo.com) and contains:

```text
.github
  └─ workflows
        └─ CI, previews, CLI E2E, releases
apps
  ├─ expo
  │   ├─ Expo SDK 56, React Native 0.85, React 19
  │   ├─ Navigation using Expo Router
  │   ├─ Tailwind CSS v4 using NativeWind v5
  │   └─ Typed API calls through @gmacko/api-client
  └─ web
      ├─ TanStack Start (React 19, Vite) on Cloudflare Workers
      ├─ Effect HttpApi mounted at /api/* in the same Worker
      ├─ better-auth at /api/auth/*
      ├─ Tailwind CSS v4
      └─ Playwright E2E against a local D1
packages
  ├─ domain        HttpApi contract: groups, Schema models, security middleware declarations
  ├─ api           Effect services and HttpApiBuilder handlers behind the contract
  ├─ api-client    Typed client (HttpApiClient transport) + TanStack Query queries/mutations
  ├─ db            Drizzle Effect API over @effect/sql-d1; migrations in packages/db/migrations
  ├─ auth          better-auth (magic link, GitHub/Google/Apple, Expo plugin, scoped API keys)
  ├─ config        Integration flags (single source of truth)
  ├─ ui            UI components (shadcn) and Storybook
  ├─ operator-core Shared operator logic over @gmacko/api-client (operator lane)
  ├─ api-cli       Operator CLI (operator lane)
  ├─ mcp-server    Operator MCP server (operator lane)
  ├─ logging       Effect logger over JSON console output
  ├─ telemetry     OTLP export of traces, logs, and metrics
  ├─ analytics     PostHog wrapper (optional)
  ├─ monitoring    Sentry wrapper (optional)
  ├─ payments      Stripe wrapper (optional)
  ├─ billing       Plans, limits, and metering primitives
  ├─ purchases     RevenueCat wrapper (optional)
  ├─ email         Email service wrapper (optional)
  ├─ notifications Expo push notifications (optional)
  ├─ realtime      ioredis + BullMQ wrapper (Node-only; not for the Worker)
  ├─ storage       File storage wrapper (optional)
  ├─ flags         Feature flag system
  ├─ i18n          Internationalization
  └─ settings      Settings schemas
sdks
  └─ openapi       OpenAPI spec generated from the contract; SDKs under sdks/generated
tooling
  ├─ github        Shared GitHub Actions setup
  ├─ openapi-generator
  ├─ tailwind      Shared tailwind theme and configuration
  ├─ typescript    Shared tsconfig you can extend from
  └─ vitest        Shared Vitest config
```

> In this template, we use `@gmacko` as a placeholder for package names. You can replace it with your own organization or project name using find-and-replace.

> Linting and formatting are standardized on `oxlint` and `biome` across the generated repo, with `lefthook`, `commitlint`, and `knip` wired in at the root.

## Integrations

This template uses a conditional integration system. Edit `packages/config/src/integrations.ts` to enable/disable integrations:

```typescript
export const integrations = {
  sentry: true, // Monitoring (default ON)
  posthog: true, // Analytics (default ON)
  stripe: false, // Payments (default OFF)
  email: { enabled: false, provider: "none" },
  realtime: { enabled: false, provider: "none" },
  storage: { enabled: false, provider: "none" },
} as const;
```

Disabled integrations require no env vars and have no runtime code paths. Realtime is Node-only (ioredis + BullMQ) and is not part of the Worker; enable it only for separately deployed Node services.

## SaaS Scaffold

The template can scaffold a real SaaS baseline instead of only a framework shell. The default runtime stays simple, but the wizard and CLI flags can add:

- first-run app bootstrap with the initial platform admin, first user, and first workspace
- workspace-centric SaaS primitives with future-friendly memberships
- optional collaboration, billing, metering, support, launch, referrals, and operator API layers
- shared platform primitives for feature flags, jobs, rate limits, bot protection, and compliance hooks

Current maturity:

- stable: workspace bootstrap, collaboration, billing/limits/metering primitives, support and launch controls, shared platform primitives
- stable: operator CLI + MCP wrapper lane over the same HTTP API
- guided but intentionally thin: email delivery, compliance hooks, and background jobs
- later-phase work: multi-workspace UX, audit logs, webhooks, richer support tooling, and deeper billing automation

## Maintaining The CLI

For `create-gmacko-app` release validation, use the scoped CLI publish check instead of a full workspace build:

```bash
pnpm check:release

# Run the full generated-app E2E suite locally when you want the slow path
pnpm e2e:cli:full
```

`pnpm check:release` keeps validation scoped to the publishable CLI surface. `pnpm e2e:cli:full` runs the slower generated-app Vitest suite locally with `RUN_E2E=true`. Generated-app coverage also lives in [`.github/workflows/cli-e2e.yml`](./.github/workflows/cli-e2e.yml), which scaffolds and checks a matrix of profiles nightly and on demand: default (web + mobile), operators (`--operator-lane`), minimal (web only), custom-scope, full (all integrations), and mobile-only. Each job runs the doctor, ForgeGraph metadata checks, auth/db bootstrap checks, health-route assertions, and Expo dev-client/config smoke checks where the profile includes them. The same workflow also exposes a manual full-suite job that runs `src/__tests__/e2e.test.ts` with `RUN_E2E=true`.

## Quick Start

> **Note**
> The web app runs on Cloudflare Workers with a D1 database in every stage, including locally (a Miniflare D1 under `apps/web/.wrangler/state`). There is no `DATABASE_URL` and no local database server to run.

<!-- SCAFFOLD_PROFILE_START -->
> Generated repos replace this block with a scaffold-specific profile summary.
<!-- SCAFFOLD_PROFILE_END -->

To get it running, follow the steps below:

### 1. Setup dependencies

```bash
# Install dependencies
pnpm i

# Run the guided local bootstrap path (writes .env for emulate)
pnpm bootstrap:local

# Verify linting, types, and app standards before you start iterating
pnpm check:fast

# Local D1 (once), then the dev loop: emulate + apps/web at https://gmacko.localhost
pnpm db:migrate:local && pnpm db:seed
pnpm dev
```

`pnpm dev` starts [`@gmacko/emulate`](https://www.npmjs.com/package/@gmacko/emulate) (GitHub/Google/Apple/Stripe/Resend emulators) and the web app under `portless`. Sign in with the emulated GitHub; the first signed-in user completes the bootstrap screen and becomes the admin. `AGENTS.md` ("Local Development") explains how the Worker reads `.env` and why `apps/web/.dev.vars` must never exist.

If you enable the optional SaaS bootstrap pack during scaffolding, the next Claude Code pass should be:

1. `/office-hours`
2. `/autoplan` if your user-level gstack install provides it
3. `/design-consultation`
4. the local follow-up skills documented in `docs/ai/BOOTSTRAP_PLAYBOOK.md`

If you enable the optional operator lane (`--operator-lane`), generated repos also expose:

```bash
pnpm api:ops -- --help
pnpm mcp:app
```

Both are wrappers over the same HTTP API and authenticate with an API key that holds the `admin` scope.

### 2. Generate Better Auth Schema

This project uses [Better Auth](https://www.better-auth.com) for authentication. The auth schema is generated with the Better Auth CLI; regenerate it after changing the auth configuration.

```bash
# Generate the Better Auth schema
pnpm auth:generate
```

This command runs the Better Auth CLI with the following configuration:

- **Config file**: `packages/auth/script/auth-cli.ts` - A CLI-only configuration file (isolated from src to prevent imports)
- **Output**: `packages/db/.cache/auth-schema.generated.ts` - the CLI's Drizzle (SQLite) schema for the authentication tables. The committed `packages/db/src/auth-schema.ts` is hand-maintained and never overwritten.

Reconcile the generated file into `packages/db/src/auth-schema.ts` (its header lists the deliberate differences, such as the NOT NULL `role` column), then `pnpm db:generate` and review the migration (expand/contract only; see `docs/drizzle-migrations.md`).

> **Note**: The `auth-cli.ts` file is placed in the `script/` directory (instead of `src/`) to prevent accidental imports from other parts of the codebase. This file is exclusively for CLI schema generation and should **not** be used directly in your application. For runtime authentication, use `packages/auth/src/index.ts` (`makeAuth`).

For more information about the Better Auth CLI, see the [official documentation](https://www.better-auth.com/docs/concepts/cli#generate).

### 3. Configure Expo `dev`-script

Expo development should prefer development builds plus Expo Orbit over long-term Expo Go usage.

```bash
pnpm --filter @gmacko/expo build:device:ios
pnpm --filter @gmacko/expo dev:client
pnpm --filter @gmacko/expo check:app-store
```

Orbit gives you a cleaner device/simulator install loop once the development build exists. `check:app-store` fails fast if the scaffold still contains placeholder App Store metadata, Expo project IDs, or associated-domain values.

#### Use iOS Simulator

1. Make sure you have XCode and XCommand Line Tools installed [as shown on expo docs](https://docs.expo.dev/workflow/ios-simulator).

   > **NOTE:** If you just installed XCode, or if you have updated it, you need to open the simulator manually once. Run `npx expo start` from `apps/expo`, and then enter `I` to launch Expo Go. After the manual launch, you can run `pnpm dev:mobile` in the root directory.

   ```diff
   +  "dev": "expo start --ios",
   ```

2. Run `pnpm dev:mobile` at the project root folder.

#### Use Android Emulator

1. Install Android Studio tools [as shown on expo docs](https://docs.expo.dev/workflow/android-studio-emulator).

2. Change the `dev` script at `apps/expo/package.json` to open the Android emulator.

   ```diff
   +  "dev": "expo start --android",
   ```

3. Run `pnpm dev:mobile` at the project root folder.

### 4. Configuring Better-Auth to work with Expo

The Expo app talks to the Worker's API (`/api/*`, including `/api/auth/*`) over `@gmacko/api-client` with the better-auth Expo client's cookie. In order to get OAuth working from Expo, you must either:

#### Deploy the Auth Proxy (RECOMMENDED)

Better-auth comes with an [auth proxy plugin](https://www.better-auth.com/docs/plugins/oauth-proxy). By deploying the web app, you can get OAuth working in preview deployments and development for Expo apps.

With the proxy plugin, the web app forwards auth requests to the proxy server, which handles the OAuth flow and then redirects back to the web app. This gives you a stable, publicly reachable URL that does not change per deployment or depend on the port the app is running on, so the OAuth provider needs one callback URL.

For iOS releases, if you keep third-party sign-in enabled, also configure Sign in with Apple and verify the in-app account deletion flow before submission.

#### Add your local IP to your OAuth provider

You can alternatively add your local IP (e.g. `192.168.x.y:$PORT`) to your OAuth provider. This may not be as reliable as your local IP may change when you change networks. Some OAuth providers may also only support a single callback URL for each app making this approach unviable for some providers (e.g. GitHub).

### 5a. When it's time to add a new UI component

Run the `ui-add` script to add a new UI component using the interactive `shadcn/ui` CLI:

```bash
pnpm ui-add
```

When the component(s) has been installed, you should be good to go and start using it in your app.

### 5b. When it's time to add a new package

To add a new package, simply run `pnpm turbo gen init` in the monorepo root. This will prompt you for a package name as well as if you want to install any dependencies to the new package (of course you can also do this yourself later).

The generator sets up the `package.json`, `tsconfig.json` and a `index.ts`, as well as configures all the necessary configurations for tooling around your package such as formatting, linting and typechecking. When the package is created, you're ready to go build out the package.

Packages that `apps/web` depends on ship inside the Worker bundle: they must not read `process.env` (take values as options or from `AppConfig`) and must not import Node-only modules. `pnpm check:standards --graph` lists that set.

### 5c. Work on shared UI in Storybook

Run Storybook from the UI package:

```bash
pnpm --filter @gmacko/ui storybook
```

Shared component stories live in `packages/ui/src/**/*.stories.tsx`.

## Developer Experience

Generated apps are set up for current agent-native and platform-native workflows:

- `AGENTS.md` is the shared repo instruction file for Codex, Claude Code, and OpenCode; its "App Invariants" section lists the rules `pnpm check:standards` enforces.
- `CLAUDE.md` is a thin Claude-specific shim that points back to `AGENTS.md` and the vendored gstack commands.
- `.claude/settings.json` ships project-level Claude permissions, including `../ForgeGraph` as an additional working directory.
- `opencode.json` loads the repo's shared instructions and planning docs into OpenCode.
- `.mcp.json` ships empty; the operator lane adds the app's own MCP server (`packages/mcp-server`) to it.
- Expo development should move toward development builds and Expo Orbit rather than long-term reliance on Expo Go.
- The web lane is Cloudflare-native end to end: TanStack Start and the Effect `HttpApi` run on workerd in development (`vite dev` through `@cloudflare/vite-plugin`), in tests (`@cloudflare/vitest-pool-workers`), and in every deployed stage.
- Generated repos include `.forgegraph.yaml` aligned to the live `forge` repo contract (`cloudflare-workers` targets, D1 resources, the migrate command) and stronger Expo development-build defaults out of the box.
- The scaffold can override the ForgeGraph server and domain placeholders directly from the CLI (`--forgegraph-server`, `--forgegraph-preview-domain`, `--forgegraph-production-domain`).
- `pnpm run doctor` warns when `.forgegraph.yaml` still contains scaffold placeholders and checks grouped core, ForgeGraph, and Cloudflare env values in `.env`.

See [docs/ai/DEVELOPER_EXPERIENCE.md](./docs/ai/DEVELOPER_EXPERIENCE.md) for the current support matrix and recommendations.

## AI Planning Workflow

This template keeps a shared planning flow for Codex, Claude Code, and OpenCode, and vendors [gstack](https://github.com/garrytan/gstack) for Claude-specific slash command workflows.

1. Use `superpowers:brainstorming` to turn the app idea into `docs/ai/INITIAL_PROPOSAL.md`.
2. Run `/plan-ceo-review` to refine the problem framing and scope.
3. Run `/plan-eng-review` to turn the approved proposal into `docs/ai/IMPLEMENTATION_PLAN.md`.
4. Run `/design-consultation` to define the design philosophy and generate `DESIGN.md`.
5. If gstack commands are unavailable, run `cd .claude/skills/gstack && ./setup`.
6. Keep `AGENTS.md`, `docs/ai/IMPLEMENTATION_PLAN.md`, and `DESIGN.md` aligned as the project changes.

## FAQ

### Does the starter include Solito?

No. Solito will not be included in this repo. It is a great tool if you want to share code between your web and Expo app. However, the main purpose of this repo is the code splitting of an app into a monorepo with one API contract. The Expo app is a bonus example of how you can utilize the monorepo with multiple apps but can just as well be any app such as Vite, Electron, etc.

Integrating Solito into this repo isn't hard, and there are a few [official templates](https://github.com/nandorojo/solito/tree/master/example-monorepos) by the creators of Solito that you can use as a reference.

### Does this pattern leak backend code to my client applications?

No, it does not. `@gmacko/api` (services and handlers) is a dependency of `apps/web` only, where it is served. The Expo app, the operator tools, and any other client depend on `@gmacko/api-client` and `@gmacko/domain`: the contract (paths, schemas, security declarations) and a client over it, with no database, auth, or handler code. Runtime code that both sides need (validation schemas, error types) lives in `@gmacko/domain` for the same reason.

## Deployment

### Web (Cloudflare Workers + D1)

#### Prerequisites

> **Note**
> The web app must be deployed for the Expo app to reach the API in a production environment; the Expo app's `API_URL` (`EXPO_PUBLIC_STAGING_API_URL` / `EXPO_PUBLIC_PRODUCTION_API_URL` per build profile) points at the stage's Worker.

#### Deploy with ForgeGraph

The web app deploys as one Cloudflare Worker per stage with one D1 database per stage; ForgeGraph orchestrates the deploys and holds the stage secrets. The full guide is [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

1. Create the D1 databases once and record their ids in `apps/web/wrangler.jsonc`:
   `pnpm -F @gmacko/web exec wrangler d1 create <app>-web-staging` (and `<app>-web`, `<app>-web-preview`).
2. Install `@forgegraph/cli` or use `forge` from [`../ForgeGraph`](../ForgeGraph) to log in, sync `.forgegraph.yaml` (`pnpm forge:diff`, `pnpm forge:apply`), and manage secrets (`forge secret set KEY --stage <stage>`).
3. Push the stage secrets into the Worker: `pnpm secrets:push --stage staging`.
4. Deploy: `pnpm forge:deploy:staging` / `pnpm forge:deploy:production` (or directly `pnpm deploy:staging` / `pnpm deploy:production`). Both run `scripts/deploy-stage.mjs`: apply the pending D1 migrations, and only if that succeeds, build and `wrangler deploy`.
5. Point your production domain at the Worker so the Expo app can use a stable backend URL.
6. Every pull request gets a preview Worker on a shared preview D1 (`.github/workflows/preview.yml`).

Migrations are forward-only and expand/contract (`docs/drizzle-migrations.md`); rollback is a Worker version rollback or a D1 Time Travel restore (`docs/RUNBOOK.md`).

### Auth Proxy

The auth proxy comes as a better-auth plugin. It lets the web app authenticate users in preview deployments; it is not used for OAuth requests in production deployments. The recommended place to run it is the staging Worker.

### Expo

Deploying your Expo application works differently from the web app. Instead of "deploying" your app online, you need to submit production builds of your app to app stores, like [Apple App Store](https://www.apple.com/app-store) and [Google Play](https://play.google.com/store/apps). You can read the full [guide to distributing your app](https://docs.expo.dev/distribution/introduction), including best practices, in the Expo docs.

1. Make sure `apps/expo/src/config/env.ts` resolves your backend's production URL (`API_URL` in `app.config.ts` extra, or `EXPO_PUBLIC_PRODUCTION_API_URL` / `EXPO_PUBLIC_STAGING_API_URL` per build profile); a preview or production build refuses to boot with a placeholder.

2. Let's start by setting up [EAS Build](https://docs.expo.dev/build/introduction), which is short for Expo Application Services. The build service helps you create builds of your app, without requiring a full native development setup. The commands below are a summary of [Creating your first build](https://docs.expo.dev/build/setup).

   ```bash
   # Install the EAS CLI
   pnpm add -g eas-cli

   # Log in with your Expo account
   eas login

   # Configure your Expo app
   cd apps/expo
   eas build:configure
   ```

3. After the initial setup, you can create your first build. You can build for Android and iOS platforms and use different [`eas.json` build profiles](https://docs.expo.dev/build-reference/eas-json) to create production builds or development, or test builds. Let's make a production build for iOS.

   ```bash
   eas build --platform ios --profile production
   ```

   > If you don't specify the `--profile` flag, EAS uses the `production` profile by default.

4. Now that you have your first production build, you can submit this to the stores. [EAS Submit](https://docs.expo.dev/submit/introduction) can help you send the build to the stores.

   ```bash
   eas submit --platform ios --latest
   ```

   > You can also combine build and submit in a single command, using `eas build ... --auto-submit`.

5. Before you can get your app in the hands of your users, you'll have to provide additional information to the app stores. This includes screenshots, app information, privacy policies, etc. _While still in preview_, [EAS Metadata](https://docs.expo.dev/eas/metadata) can help you with most of this information.

6. Once everything is approved, your users can finally enjoy your app. Let's say you spotted a small typo; you'll have to create a new build, submit it to the stores, and wait for approval before you can resolve this issue. In these cases, you can use EAS Update to quickly send a small bugfix to your users without going through this long process. Let's start by setting up EAS Update.

   The steps below summarize the [Getting started with EAS Update](https://docs.expo.dev/eas-update/getting-started/#configure-your-project) guide.

   ```bash
   # Add the `expo-updates` library to your Expo app
   cd apps/expo
   pnpm expo install expo-updates

   # Configure EAS Update
   eas update:configure
   ```

7. Before we can send out updates to your app, you have to create a new build and submit it to the app stores. For every change that includes native APIs, you have to rebuild the app and submit the update to the app stores. See steps 2 and 3.

8. Now that everything is ready for updates, let's create a new update for `production` builds. With the `--auto` flag, EAS Update uses your current git branch name and commit message for this update. See [How EAS Update works](https://docs.expo.dev/eas-update/how-eas-update-works/#publishing-an-update) for more information.

   ```bash
   cd apps/expo
   eas update --auto
   ```

   > Your OTA (Over The Air) updates must always follow the app store's rules. You can't change your app's primary functionality without getting app store approval. But this is a fast way to update your app for minor changes and bug fixes.

9. Done! Now that you have created your production build, submitted it to the stores, and installed EAS Update, you are ready for anything!

## References

The stack originates from [create-t3-app](https://github.com/t3-oss/create-t3-app).

A [blog post](https://jumr.dev/blog/t3-turbo) where I wrote how to migrate a T3 app into this.
