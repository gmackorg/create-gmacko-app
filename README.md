# create-gmacko-app

A fork of [create-t3-turbo](https://github.com/t3-oss/create-t3-turbo) with:

- Postgres deployed alongside the app first, with hosted Postgres as a later migration once the product has real customer demand
- ForgeGraph as the preferred deployment path for app hosting, especially on the Hetzner VPS setup
- Nix-oriented deployment guidance so generated apps can move toward living as ForgeGraph repos
- `jj`-first repository setup with colocated Git compatibility
- a baseline standards stack of `oxlint`, `biome`, `lefthook`, `commitlint`, and `knip`
- Conditional integration system (Sentry, PostHog, Stripe, Email, Realtime, Storage)
- modular SaaS scaffold layers for collaboration, billing, metering, support, launch controls, referrals, operator APIs, and shared platform primitives
- shared agent workflow support for Codex, Claude Code, and OpenCode via `AGENTS.md`, `CLAUDE.md`, `opencode.json`, and `.mcp.json`
- optional Claude-first SaaS bootstrap guidance after local setup, including `/office-hours`, optional user-level `/autoplan`, `/design-consultation`, and local follow-up skills
- optional operator surfaces where both the CLI and MCP server are wrappers over the same tRPC API
- Storybook wired into the Next.js app for isolated UI development

## Installation

> [!NOTE]
>
> Make sure to follow the system requirements specified in [`package.json#engines`](./package.json#L4) before proceeding.

Clone this repository or use it as a template:

```bash
git clone https://github.com/gmackorg/create-gmacko-app.git my-app
cd my-app
pnpm setup
```

## About

Ever wondered how to migrate your T3 application into a monorepo? Stop right here! This is the perfect starter repo to get you running with the perfect stack!

It uses [Turborepo](https://turborepo.com) and contains:

```text
.github
  └─ workflows
        └─ CI with pnpm cache setup
.vscode
  └─ Recommended extensions and settings for VSCode users
apps
  ├─ expo
  │   ├─ Expo SDK 55
  │   ├─ React Native 0.84 using React 19
  │   ├─ Navigation using Expo Router
  │   ├─ Tailwind CSS v4 using NativeWind v5
  │   └─ Typesafe API calls using tRPC
  ├─ nextjs
  │   ├─ Next.js 16
  │   ├─ React 19
  │   ├─ Storybook 10
  │   ├─ Tailwind CSS v4
  │   └─ E2E Typesafe API Server & Client
  └─ tanstack-start
      ├─ Tanstack Start v1 (rc)
      ├─ React 19
      ├─ Tailwind CSS v4
      └─ E2E Typesafe API Server & Client
packages
  ├─ api
  │   └─ tRPC v11 router definition
  ├─ auth
  │   └─ Authentication using better-auth
  ├─ config
  │   └─ Integration flags (single source of truth)
  ├─ db
  │   └─ Typesafe db calls using Drizzle & Postgres
  ├─ ui
  │   └─ UI components using shadcn-ui
  ├─ analytics
  │   └─ PostHog analytics wrapper (optional)
  ├─ monitoring
  │   └─ Sentry monitoring wrapper (optional)
  ├─ payments
  │   └─ Stripe payments wrapper (optional)
  ├─ email
  │   └─ Email service wrapper (optional)
  ├─ realtime
  │   └─ Realtime service wrapper (optional)
  └─ storage
      └─ File storage wrapper (optional)
tooling
  ├─ tailwind
  │   └─ shared tailwind theme and configuration
  └─ typescript
      └─ shared tsconfig you can extend from
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

Disabled integrations require no env vars and have no runtime code paths.

## SaaS Scaffold

The template can now scaffold a real SaaS baseline instead of only a framework shell. The default runtime stays simple, but the wizard and CLI flags can add:

- first-run app bootstrap with the initial platform admin, first user, and first workspace
- workspace-centric SaaS primitives with future-friendly memberships
- optional collaboration, billing, metering, support, launch, referrals, and operator API layers
- shared platform primitives for feature flags, jobs, rate limits, bot protection, and compliance hooks

Current maturity:

- stable: workspace bootstrap, collaboration, billing/limits/metering primitives, support and launch controls, shared platform primitives
- stable: operator CLI + MCP wrapper lane over the same tRPC API
- guided but intentionally thin: email delivery, compliance hooks, and background jobs
- later-phase work: multi-workspace UX, audit logs, webhooks, richer support tooling, and deeper billing automation

## Maintaining The CLI

For `create-gmacko-app` release validation, use the scoped CLI publish check instead of a full workspace build:

```bash
pnpm check:release

# Run the full generated-app E2E suite locally when you want the slow path
pnpm e2e:cli:full
```

`pnpm check:release` keeps validation scoped to the publishable CLI surface. `pnpm e2e:cli:full` runs the slower generated-app Vitest suite locally with `RUN_E2E=true`. Generated-app coverage also lives in [`.github/workflows/cli-e2e.yml`](/Volumes/dev/create-gmacko-app/.github/workflows/cli-e2e.yml), which exercises default, minimal, custom-scope, full, and `vinext` scaffolds on a nightly and manual basis, including ForgeGraph script smoke checks, auth/db bootstrap checks, health-route assertions, Expo dev-client/config smoke checks, and `vinext` doctor assertions for Cloudflare credentials. The same workflow also exposes a manual full-suite job that runs `src/__tests__/e2e.test.ts` with `RUN_E2E=true`.

## Quick Start

> **Note**
> The recommended operating model is to run Postgres alongside the app during the early stages of the product. On the Hetzner VPS, use the sibling [`../ForgeGraph`](../ForgeGraph) deployment setup as the deployment reference, keep the database colocated with the app, and only move to a hosted Postgres provider once you have real customer and operational pressure to justify it.

<!-- SCAFFOLD_PROFILE_START -->
> Generated repos replace this block with a scaffold-specific profile summary.
<!-- SCAFFOLD_PROFILE_END -->

To get it running, follow the steps below:

### 1. Setup dependencies

> [!NOTE]
>
> While the repo does contain both a Next.js and Tanstack Start version of a web app, you can pick which one you like to use and delete the other folder before starting the setup.

```bash
# Install dependencies
pnpm i

# Run the guided local bootstrap path
pnpm bootstrap:local

# Verify linting and types before you start iterating
pnpm check:fast
```

If you enable the optional SaaS bootstrap pack during scaffolding, the next Claude Code pass should be:

1. `/office-hours`
2. `/autoplan` if your user-level gstack install provides it
3. `/design-consultation`
4. the local follow-up skills documented in `docs/ai/BOOTSTRAP_PLAYBOOK.md`

If you enable the optional operator lane, generated repos also expose:

```bash
pnpm trpc:ops -- --help
pnpm mcp:app
```

Both are wrappers over the same tRPC API surface.

### 2. Generate Better Auth Schema

This project uses [Better Auth](https://www.better-auth.com) for authentication. The auth schema needs to be generated using the Better Auth CLI before you can use the authentication features.

```bash
# Generate the Better Auth schema
pnpm --filter @gmacko/auth generate
```

This command runs the Better Auth CLI with the following configuration:

- **Config file**: `packages/auth/script/auth-cli.ts` - A CLI-only configuration file (isolated from src to prevent imports)
- **Output**: `packages/db/src/auth-schema.ts` - Generated Drizzle schema for authentication tables

The generation process:

1. Reads the Better Auth configuration from `packages/auth/script/auth-cli.ts`
2. Generates the appropriate database schema based on your auth setup
3. Outputs a Drizzle-compatible schema file to the `@gmacko/db` package

> **Note**: The `auth-cli.ts` file is placed in the `script/` directory (instead of `src/`) to prevent accidental imports from other parts of the codebase. This file is exclusively for CLI schema generation and should **not** be used directly in your application. For runtime authentication, use the configuration from `packages/auth/src/index.ts`.

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

   > **NOTE:** If you just installed XCode, or if you have updated it, you need to open the simulator manually once. Run `npx expo start` from `apps/expo`, and then enter `I` to launch Expo Go. After the manual launch, you can run `pnpm dev` in the root directory.

   ```diff
   +  "dev": "expo start --ios",
   ```

2. Run `pnpm dev` at the project root folder.

#### Use Android Emulator

1. Install Android Studio tools [as shown on expo docs](https://docs.expo.dev/workflow/android-studio-emulator).

2. Change the `dev` script at `apps/expo/package.json` to open the Android emulator.

   ```diff
   +  "dev": "expo start --android",
   ```

3. Run `pnpm dev` at the project root folder.

### 4. Configuring Better-Auth to work with Expo

In order to get Better-Auth to work with Expo, you must either:

#### Deploy the Auth Proxy (RECOMMENDED)

Better-auth comes with an [auth proxy plugin](https://www.better-auth.com/docs/plugins/oauth-proxy). By deploying the Next.js app, you can get OAuth working in preview deployments and development for Expo apps.

By using the proxy plugin, the Next.js apps will forward any auth requests to the proxy server, which will handle the OAuth flow and then redirect back to the Next.js app. This makes it easy to get OAuth working since you'll have a stable URL that is publicly accessible and doesn't change for every deployment and doesn't rely on what port the app is running on. So if port 3000 is taken and your Next.js app starts at port 3001 instead, your auth should still work without having to reconfigure the OAuth provider.

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

### 5c. Work on shared UI in Storybook

Run Storybook from the web app workspace:

```bash
pnpm --filter @gmacko/nextjs storybook
```

Shared component stories live in `packages/ui/src/**/*.stories.tsx`.

## Developer Experience

Generated apps are set up for current agent-native and platform-native workflows:

- `AGENTS.md` is the shared repo instruction file for Codex, Claude Code, and OpenCode.
- `CLAUDE.md` is a thin Claude-specific shim that points back to `AGENTS.md` and the vendored gstack commands.
- `.claude/settings.json` ships project-level Claude permissions, including `../ForgeGraph` as an additional working directory.
- `opencode.json` loads the repo's shared instructions and planning docs into OpenCode.
- `.mcp.json` configures the official Next.js MCP server for Next.js 16+ agent-assisted debugging.
- Expo development should move toward development builds and Expo Orbit rather than long-term reliance on Expo Go.
- Cloudflare support should be treated as a separate deployment lane:
  - `vinext` is the experimental Next.js-on-Workers path.
  - TanStack Start is the cleaner Workers-native path today.
  - ForgeGraph + Nix remains the stable owned-infrastructure path.
- Generated repos now also include `.forgegraph.yaml` aligned to the live `forge` repo contract and stronger Expo development-build defaults out of the box.
- The scaffold can now override ForgeGraph server/node placeholders directly from the CLI and emits a fuller Cloudflare lane when `--vinext` is enabled:
  - `apps/nextjs/vite.config.ts` with the Cloudflare Vite plugin wired for the RSC runtime
  - `apps/nextjs/wrangler.jsonc` with staging and production-ready Workers config
  - `apps/nextjs/worker/index.ts` as the generated Worker entry
  - `apps/nextjs/src/cloudflare-env.ts` plus Cloudflare env stubs in `.env.example`
  - `prebuild:vinext`, `build:vinext`, `deploy:cloudflare:staging`, and `deploy:cloudflare:production`
- `pnpm doctor` now warns when `.forgegraph.yaml` still contains scaffold placeholders, checks grouped core and ForgeGraph env values, and, when the `vinext` lane exists, checks Wrangler plus grouped Cloudflare env values in `.env`

See [docs/ai/DEVELOPER_EXPERIENCE.md](./docs/ai/DEVELOPER_EXPERIENCE.md) for the current support matrix and recommendations.

### Experimental Cloudflare Lane

If you scaffold with `--vinext`, the generated Next app gets an explicit Workers path alongside the default ForgeGraph/Nix path.

From the generated repo root:

```bash
pnpm --filter @gmacko/nextjs dev:vinext
CI=1 pnpm --filter @gmacko/nextjs build:vinext
pnpm --filter @gmacko/nextjs deploy:cloudflare:staging
pnpm --filter @gmacko/nextjs deploy:cloudflare:production
```

Notes:

- `build:vinext` prebuilds the Next app's workspace dependencies before invoking `vinext`.
- the generated Workers config assumes the normal default integration set; aggressively pruned integration layouts are still a separate cleanup path
- this is intentionally a separate deployment lane from ForgeGraph and should not be treated as the primary production path for the Hetzner VPS setup

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

No. Solito will not be included in this repo. It is a great tool if you want to share code between your Next.js and Expo app. However, the main purpose of this repo is not the integration between Next.js and Expo — it's the code splitting of your T3 App into a monorepo. The Expo app is just a bonus example of how you can utilize the monorepo with multiple apps but can just as well be any app such as Vite, Electron, etc.

Integrating Solito into this repo isn't hard, and there are a few [official templates](https://github.com/nandorojo/solito/tree/master/example-monorepos) by the creators of Solito that you can use as a reference.

### Does this pattern leak backend code to my client applications?

No, it does not. The `api` package should only be a production dependency in the Next.js application where it's served. The Expo app, and all other apps you may add in the future, should only add the `api` package as a dev dependency. This lets you have full typesafety in your client applications, while keeping your backend code safe.

If you need to share runtime code between the client and server, such as input validation schemas, you can create a separate `shared` package for this and import it on both sides.

## Deployment

### Next.js

#### Prerequisites

> **Note**
> Please note that the Next.js application with tRPC must be deployed in order for the Expo app to communicate with the server in a production environment.

#### Deploy with ForgeGraph

The recommended deployment path for this template is to keep the application inside a ForgeGraph-managed repo and deploy it to the Hetzner VPS from there. In this workspace, the reference deployment setup lives in [`../ForgeGraph`](../ForgeGraph).

1. Treat ForgeGraph as the deployment home for the app.
2. Run Postgres alongside the app on the VPS first, keeping application and database operations simple while the product is still early.
3. Configure `DATABASE_URL`, auth secrets, and any enabled integration env vars in the ForgeGraph deployment environment.
4. Install `@forgegraph/cli` or use `forge` from [`../ForgeGraph`](../ForgeGraph) to log in, create the app and stages if needed, manage secrets, and deploy the app.
5. Prefer the repo-local wrappers once the app is configured: `pnpm forge:diff`, `pnpm forge:apply`, `pnpm forge:stages`, `pnpm forge:deploy:staging`, and `pnpm forge:deploy:production`.
6. Point your production domain at the ForgeGraph-managed deployment so the Expo app can use a stable backend URL.
7. When you have real customers and concrete operational needs, migrate Postgres to a hosted provider instead of paying that complexity cost upfront.

### Auth Proxy

The auth proxy comes as a better-auth plugin. This is required for the Next.js app to be able to authenticate users in preview deployments. The auth proxy is not used for OAuth requests in production deployments. The recommended place to run it is alongside the web app in your ForgeGraph deployment.

### Expo

Deploying your Expo application works slightly differently compared to Next.js on the web. Instead of "deploying" your app online, you need to submit production builds of your app to app stores, like [Apple App Store](https://www.apple.com/app-store) and [Google Play](https://play.google.com/store/apps). You can read the full [guide to distributing your app](https://docs.expo.dev/distribution/introduction), including best practices, in the Expo docs.

1. Make sure to modify the `getBaseUrl` function to point to your backend's production URL:

   <https://github.com/t3-oss/create-t3-turbo/blob/656965aff7db271e5e080242c4a3ce4dad5d25f8/apps/expo/src/utils/api.tsx#L20-L37>

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
