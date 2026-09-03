# `create-gmacko-app` Scaffold Spec

**Purpose:** Deterministically scaffold a new monorepo app from the Gmacko fork of `create-t3-turbo`, with a single-source-of-truth integration toggle model (Option A), smart defaults, and optional pruning (`--prune`). The web lane is `apps/web`: TanStack Start + Effect `HttpApi` on Cloudflare Workers with a D1 database. Version 0.2.0 is a breaking release: there is no web framework choice and no database choice.

**Non-goals:**
- No "integration branches".
- No interactive "choose-your-own-architecture" beyond a small prompt set.
- No runtime dynamic import hacks; wiring is compile-time predictable.

---

## 1) Prompt Flow (Exact Questions + Defaults)

### 1.1 CLI Invocation Modes

`create-gmacko-app` supports three deterministic modes:

1. **Interactive (default)**: prompt flow below.
2. **Non-interactive defaults**: `--yes` uses all defaults.
3. **Fully specified**: all choices provided via flags; prompts skipped.

**Required positional argument**
- `create-gmacko-app <app-name>`

**Supported flags**
- `--yes` / `-y` (accept defaults, no prompts)
- `--prune` (remove unused integration packages + references)
- `--no-install` (skip `pnpm install`)
- `--no-git` (skip repository init)
- `--no-ai` (do not include AI skill system + docs)
- `--no-provision` (do not include `scripts/provision.sh`)
- `--web / --no-web` (default: `--web`; `apps/web`)
- `--mobile / --no-mobile` (default: `--mobile`; `apps/expo`)
- `--saas-collaboration`, `--saas-billing`, `--saas-metering`, `--saas-support`, `--saas-launch`, `--saas-referrals`, `--saas-operator-apis` (SaaS layers)
- `--saas-bootstrap` (add the optional Claude SaaS bootstrap pack)
- `--operator-lane` (keep the CLI + MCP operator lane over the HTTP API: `packages/operator-core`, `packages/api-cli`, `packages/mcp-server`; adds root scripts `api:ops` and `mcp:app`)
- `--integrations <comma-list>` overrides integration toggles entirely
  - accepted keys: `sentry,posthog,stripe,revenuecat,notifications,email,realtime,storage`
- `--email-provider <resend|none>` (default: `none`)
- `--storage-provider <uploadthing|none>` (default: `none`)
- `--forgegraph` (emit `.forgegraph.yaml` and the ForgeGraph scripts; default on)
- `--forgegraph-server <url>`, `--forgegraph-preview-domain <host>`, `--forgegraph-production-domain <host>` (replace the ForgeGraph placeholders)
- `--package-scope <@your-scope>` (default: `@gmacko`)

There is no `--db`, no `--auth`, and no `--tanstack-start` (the pre-migration Cloudflare-lane flag is gone too): the database is D1 and the auth is better-auth in every generated repo.

**Determinism rule:** if a flag explicitly sets a choice, it wins over prompt defaults.

---

### 1.2 Prompt Sequence (Interactive)

> All prompts are asked in this order. Each prompt lists **default** and **validation** rules.

#### Prompt 1 — App display name
- **Question:** "What is your app display name?"
- **Default:** Title-case of `<app-name>` (e.g., `my-saas` → `My SaaS`)
- **Validation:** 1–50 chars, no newlines

#### Prompt 2 — Platforms
- **Question:** "Which platforms?"
- **Choices (multi-select):**
  - Web (`apps/web`, TanStack Start + Effect on Workers) **[default ON]**
  - Mobile (`apps/expo`) **[default ON]**
- **Validation:** at least one selected

#### Prompt 3 — Package scope
- **Question:** "Package scope for workspace packages?"
- **Default:** `@gmacko`
- **Validation:** must start with `@` and contain no spaces

#### Prompt 4 — Integration presets
- **Question:** "Choose an integration preset"
- **Choices:**
  - "Core only" (all optional OFF)
  - "Recommended" **[default]**: Sentry + PostHog ON, others OFF
  - "Everything" (all optional ON, providers required)
  - "Custom" (go to Prompt 5)
- **Validation:** one selection

#### Prompt 5 — Integrations (only if preset = Custom)
- **Question:** "Enable integrations"
- **Toggles:**
  - Sentry (monitoring) **[default ON]**
  - PostHog (analytics) **[default ON]**
  - Stripe (payments) **[default OFF]**
  - RevenueCat (purchases) **[default OFF]**
  - Notifications (Expo push) **[default OFF]**
  - Email **[default OFF]**
  - Realtime **[default OFF]** — enabling prints a warning: `@gmacko/realtime` is Node-only (ioredis + BullMQ) and does not run on the Worker
  - Storage **[default OFF]**

#### Prompt 6 — Email provider (only if Email enabled)
- **Question:** "Email provider?"
- **Choices:** Resend
- **Default:** Resend

#### Prompt 7 — Storage provider (only if Storage enabled)
- **Question:** "Storage provider?"
- **Choices:** UploadThing
- **Default:** UploadThing

#### Prompt 8 — ForgeGraph
- **Question:** "Emit ForgeGraph repo metadata (.forgegraph.yaml + forge scripts)?"
- **Default:** Yes
- **Validation:** boolean

#### Prompt 9 — SaaS layers
- **Question:** "Which SaaS layers?"
- **Choices (multi-select):** collaboration, billing, metering, support, launch controls, referrals, operator APIs
- **Default:** none

#### Prompt 10 — Include AI workflow system?
- **Question:** "Include Gmacko AI workflow system (shared AGENTS docs + agent configs + planning docs)?"
- **Default:** Yes
- **Validation:** boolean

#### Prompt 11 — Add Claude SaaS bootstrap pack? (only if AI enabled)
- **Question:** "Add the optional Claude SaaS bootstrap pack (office-hours -> autoplan -> design-consultation + local follow-up skills)?"
- **Default:** No
- **Validation:** boolean

#### Prompt 12 — Include provisioning script?
- **Question:** "Include interactive provisioning script (scripts/provision.sh)?"
- **Default:** Yes
- **Validation:** boolean

#### Prompt 13 — Prune unused integrations?
- **Question:** "Prune unused integrations from the repo? (recommended for public apps)"
- **Default:** No
- **Validation:** boolean

#### Prompt 14 — Install dependencies?
- **Question:** "Run pnpm install?"
- **Default:** Yes

#### Prompt 15 — Initialize git?
- **Question:** "Initialize a git repository?"
- **Default:** Yes

The operator lane (`--operator-lane`) has no prompt of its own; it is a flag, and `--saas-operator-apis` enables the operator API group in the contract.

---

## 2) File Outputs (Generated/Modified by Answers)

### 2.1 Always-written outputs (all runs)

#### A) Root metadata
- Modify: `package.json`
  - Set `name` to `<app-name>`
  - Ensure package manager is `pnpm`
  - Update scripts (see below)
- Modify: `pnpm-workspace.yaml`
  - Ensure `apps/*`, `packages/*`, `tooling/*`, and `sdks/*` included (unchanged if already)
- Modify: `README.md`
  - Replace template branding + quick start
  - Replace the `SCAFFOLD_PROFILE` block with the scaffold profile summary
- Create: `.env.example`
  - Includes only required sections for enabled integrations (even without prune)
  - Always includes the auth variables and the emulate provider URLs; never a `DATABASE_URL` (the database is the `DB` D1 binding)
- Create: `.gitignore` (if missing)
- Create: `gmacko.integrations.json`
  - Captures the choices used at scaffold-time (not used at runtime)
  - Example:
    ```json
    {
      "preset": "recommended",
      "integrations": {
        "sentry": true,
        "posthog": true,
        "stripe": false,
        "email": { "enabled": false, "provider": "none" },
        "realtime": { "enabled": false, "provider": "none" },
        "storage": { "enabled": false, "provider": "none" }
      }
    }
    ```

#### B) Runtime integration config (single source of truth for code)
- Keep: `packages/config/src/integrations.ts`, written from the answers

**`packages/config/src/integrations.ts` must be deterministic**
```ts
export const integrations = {
  sentry: true,
  posthog: true,
  stripe: false,
  email: { enabled: false, provider: "none" },
  realtime: { enabled: false, provider: "none" },
  storage: { enabled: false, provider: "none" },
} as const;

export type Integrations = typeof integrations;
```

#### C) ForgeGraph (unless `--no-forgegraph`)
- Create: `.forgegraph.yaml` with `db: { type: d1, migrate: node scripts/deploy-stage.mjs --migrate-only }`, stages `staging` and `production` as `cloudflare-workers` targets (`workerName`, `configPath: apps/web/wrangler.jsonc`, `environment`, `deploy: pnpm -F @gmacko/web deploy:<stage>` — ForgeGraph runs `db.migrate` before it, so the stage target deploys only), `resources.d1` for `<app>-web-staging`, `<app>-web`, `<app>-web-preview`, and the `/.well-known/forge-health` health URL.
- Keep: `scripts/deploy-stage.mjs`, `scripts/secrets-push.mjs`, `deploy/forgegraph/deploy.yml`, and the root `forge:*`, `deploy:*`, `secrets:push` scripts.

---

### 2.2 Platform-dependent outputs

#### Web selected (`apps/web`)
- Modify: `apps/web/package.json` (deps for enabled integrations; always present if not pruning)
- Modify: `apps/web/wrangler.jsonc` — Worker names `<app>-web`, `<app>-web-staging`, `<app>-web-preview`; D1 binding `DB` per environment with placeholder ids
- Modify: `apps/web/src/env.ts` — browser `VITE_*` validation (`@t3-oss/env-core`) requires vars only for enabled integrations
- Modify: `apps/web/src/server/config.ts` — `AppConfig.fromBindings` reads the bindings for enabled integrations only
- Modify: `apps/web/src/providers.tsx` / `src/client.tsx` — conditional PostHog / Sentry wiring
- Keep: `apps/web/src/routes/api.webhooks.stripe.ts` only if Stripe is enabled
- Keep: `packages/ui/src/**/*.stories.tsx` and the `packages/ui` Storybook config

#### Mobile selected (Expo)
- Modify: `apps/expo/package.json`
- Modify: `apps/expo/app.config.ts`
  - Ensure `scheme` is set deterministically:
    - default: `<app-name>` (kebab-case) truncated to safe length
- Modify: `apps/expo/src/config/env.ts` (boot validation of the API URL, Sentry, PostHog)
- Modify: `apps/expo/src/providers.tsx`
  - Conditional provider wiring based on `integrations`
- Modify: `apps/expo/src/utils/auth.ts` (better-auth Expo client; base URL from `src/utils/base-url.ts`)

---

### 2.3 AI system outputs (only if AI enabled)
- Copy/Create: `docs/ai/**`
- Create: `docs/ai/INITIAL_PROPOSAL.md`
- Create: `docs/ai/DEVELOPER_EXPERIENCE.md`
- Create: `AGENTS.md`
- Create: `CLAUDE.md`
- Create: `.mcp.json` (empty `mcpServers`)
- Copy/Create: `.claude/skills/gstack/**`
- Copy/Create: `.opencode/skill/**`
- Copy/Create: `.opencode/agent/**` (if used)
- Copy/Create: `opencode.json`
- Create: `DESIGN.md` as the target file for `/design-consultation`

**Recommended behavior**
- Keep `AGENTS.md` as the canonical repo instruction file and make `CLAUDE.md` a thin Claude-specific shim.
- Ship `.mcp.json` empty; only the operator lane adds a server to it.
- Prefer `opencode.json` for loading supplemental instruction docs instead of duplicating them into `AGENTS.md`.
- The default planning path is:
  1. `superpowers:brainstorming` writes the initial proposal to `docs/ai/INITIAL_PROPOSAL.md`
  2. `/plan-ceo-review` and `/plan-eng-review` refine the proposal and implementation plan
  3. `/design-consultation` writes `DESIGN.md`

**If SaaS bootstrap pack enabled**
- Create: `docs/ai/BOOTSTRAP_PLAYBOOK.md`
- Copy/Create:
  - `.claude/skills/bootstrap-saas/**`
  - `.claude/skills/launch-landing-page/**`
  - `.claude/skills/setup-stripe-billing/**`
  - `.claude/skills/bootstrap-expo-app/**`
  - `.claude/skills/test-mobile-with-maestro/**`
- Append Claude guidance that the post-setup order is `/office-hours`, optional user-level `/autoplan`, then `/design-consultation`

**If operator lane enabled (`--operator-lane`)**
- Keep: `packages/operator-core/**`, `packages/api-cli/**`, `packages/mcp-server/**`
- Modify: root `package.json` with `api:ops` and `mcp:app`
- Modify: `.mcp.json` to include a local `gmacko-app` server entry when AI files are present
- Without the flag, the three packages are removed.

---

### 2.4 Provisioning outputs (only if provision enabled)
- Copy/Create: `scripts/provision.sh`
  - Must provision only enabled services
- Modify: `package.json`
  - Add `provision` script: `./scripts/provision.sh`

### 2.5 Next steps printed after scaffolding

```bash
cd <app-name>
pnpm bootstrap:local
pnpm db:generate && pnpm -F @gmacko/db migrate:local
pnpm dev
# when ready to deploy:
pnpm -F @gmacko/web exec wrangler d1 create <app>-web-staging   # and <app>-web, <app>-web-preview
```

---

## 3) Integration Wiring (Toggle → Codebase Effects)

### 3.1 Global wiring rules (apply to all integrations)
Each integration must follow these invariants:

1. **No side effects when disabled**
   - No initialization at import time.
   - No provider mounted.
   - No env vars required.
2. **Explicit enable check in a single place**
   - Providers are assembled in one root file per app (`apps/web/src/providers.tsx`, `apps/expo/src/providers.tsx`).
3. **Typed config**
   - All code branches off `integrations` from `@<scope>/config`.
4. **Deterministic env validation**
   - The browser `VITE_*` schema and `AppConfig.fromBindings` require values only when the integration is enabled.
5. **Worker-safe**
   - A package `apps/web` depends on ships in the Worker bundle: no `process.env`, no `node:` imports.

---

### 3.2 Monitoring — Sentry (`integrations.sentry`)
**When ON**
- Web:
  - `@sentry/cloudflare` `withSentry` around the Worker export (`apps/web/src/server/worker.ts`); binding `SENTRY_DSN`
  - `@sentry/react` in `apps/web/src/client.tsx`; `VITE_SENTRY_DSN`
  - Build-time `SENTRY_AUTH_TOKEN` (+ `SENTRY_ORG`, `SENTRY_PROJECT`) uploads source maps
- Mobile:
  - Initialize Sentry in the Expo entrypoint; `EXPO_PUBLIC_SENTRY_DSN` (boot validation fails a preview/production build without it)

**When OFF**
- `withSentry` is a no-op without a DSN; the browser SDK is not imported
- Env schema does not mention Sentry vars

---

### 3.3 Analytics — PostHog (`integrations.posthog`)
**When ON**
- Web:
  - Mount the PostHog provider in `apps/web/src/providers.tsx`
  - `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` (optional)
- Mobile:
  - Initialize the PostHog native wrapper/provider
  - `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` (optional)

**When OFF**
- No provider mounted
- No analytics package imported by entrypoints
- Env not required

---

### 3.4 Payments — Stripe (`integrations.stripe`)
**When ON**
- Web:
  - `packages/payments` (Stripe client with a fetch HTTP client and SubtleCrypto signature verification)
  - Webhook route: `apps/web/src/routes/api.webhooks.stripe.ts` → `src/server/stripe-webhook.ts`
  - Bindings: the Stripe secret key and `STRIPE_WEBHOOK_SECRET` (see `.env.example`); a publishable key on the browser side only if the app renders Stripe elements
- Billing tables are part of the base schema (`packages/db/src/schema.ts`); Stripe only fills them

**When OFF**
- No webhook route generated
- No Stripe env keys required
- No payments package referenced

---

### 3.5 Email (`integrations.email.enabled`)
Email is two-dimensional: enabled + provider.

**When ON**
- `packages/email` with Resend
- Bindings: `RESEND_API_KEY`, `EMAIL_FROM`; `RESEND_BASE_URL` points the SDK at emulate locally
- Magic links are sent through it; `BYPASS_MAGIC_LINK=true` logs them instead (development only)

**When OFF**
- No email package referenced
- No email env keys required
- Magic links are logged (development) or the flow is unavailable

---

### 3.6 Realtime (`integrations.realtime.enabled`)

**When ON**
- `packages/realtime` (ioredis + BullMQ). Node-only: it is not a dependency of `apps/web` and must not become one. The scaffolder prints a warning.
- Env: `REDIS_URL` for the Node service that uses it

**When OFF**
- No realtime package referenced
- Env not required

---

### 3.7 Storage (`integrations.storage.enabled`)

**When ON**
- `packages/storage`
- UploadThing: the provider token (see `.env.example`)
- Wiring into the Worker is left to the app (experimental on the web lane)

**When OFF**
- No storage package referenced
- Env not required

---

## 4) Prune Mode (`--prune`) — Exact Removal Rules

`--prune` transforms "disabled means not wired" into "disabled means physically removed".

### 4.1 High-level pruning behavior
When `--prune` is enabled:
- Remove packages for disabled integrations
- Remove integration-specific routes, configs, and docs
- Remove dependency entries from `apps/*/package.json` and root `package.json`
- Remove env example sections for disabled integrations
- Remove any "integration wiring" code branches that only exist for the disabled integration (simplify to straight-line code)

**Important:** Prune must not remove shared infrastructure (`packages/config`, `domain`, `db`, `auth`, `api`, `api-client`, `ui`, `logging`, `telemetry`) even if it contains flags for integrations.

---

### 4.2 Prune matrix (deterministic)

#### If `integrations.sentry === false`
Remove:
- `packages/monitoring/**`
- The Sentry Vite plugin wiring in `apps/web/vite.config.ts`
- Sentry env keys from `.env.example`

Modify:
- `apps/web/src/server/worker.ts`: export the handler without `withSentry`
- `apps/web/src/client.tsx`: remove the browser init

#### If `integrations.posthog === false`
Remove:
- `packages/analytics/**`
- PostHog env keys from `.env.example`

Modify:
- app providers: remove provider branches

#### If `integrations.stripe === false`
Remove:
- `packages/payments/**`
- `apps/web/src/routes/api.webhooks.stripe.ts`, `apps/web/src/server/stripe-webhook.ts`
- Stripe env keys from `.env.example`

#### If `integrations.email.enabled === false`
Remove:
- `packages/email/**`
- Email env keys from `.env.example`

#### If `integrations.realtime.enabled === false`
Remove:
- `packages/realtime/**`
- Realtime env keys from `.env.example`

#### If `integrations.storage.enabled === false`
Remove:
- `packages/storage/**`
- Storage env keys from `.env.example`

#### If the operator lane is not enabled
Remove:
- `packages/operator-core/**`, `packages/api-cli/**`, `packages/mcp-server/**`
- root scripts `api:ops`, `mcp:app`

---

### 4.3 Dependency pruning rules
For each removed package:
- Remove any `@<scope>/<package>` dependency from:
  - `apps/web/package.json`
  - `apps/expo/package.json`
  - `packages/api/package.json` (if any)
  - root `package.json` (if any)

---

### 4.4 Code pruning rules (avoid dangling imports)
After file deletions:
- Remove imports referencing deleted packages/files.
- Remove unused exports and re-exports.
- Remove dead env validation branches.

**Determinism requirement:** the prune step must end with a repo that typechecks with no conditional compilation, and `pnpm check:standards` passes.

---

## 5) Output Summary (What the generator guarantees)

After scaffolding:
- There is exactly one runtime "integration truth" source (`@<scope>/config` → `integrations`).
- Disabled integrations:
  - Without prune: present but not wired, no required env vars.
  - With prune: removed entirely, no references remain.
- Defaults produce a working app with:
  - TanStack Start + Effect `HttpApi` on Workers, D1, better-auth, shadcn UI
  - Sentry + PostHog enabled but not blocking local dev when their values are unset (both are no-ops without a DSN/key in development; the Expo boot check enforces them for preview/production builds)
- `pnpm check:fast` passes on the generated repo.

---

## 6) Consistency Decisions (locked)

1. **Database**: the `DB` D1 binding; no `DATABASE_URL` anywhere in the web lane.
2. **Env**: the Worker reads bindings once (`AppConfig.fromBindings`); locally they come from the repo-root `.env` through the `apps/web/.env` link; never `.dev.vars`.
3. **Expo scheme rule**: `scheme = <app-name>` (kebab-case) and stable.
4. **Integration behavior in dev**: enabled integrations are optional in development (no-op without values) and required in preview/production builds of the Expo app.

---

## Appendix: Reference Implementation Skeleton

### Provider Assembly — Web (`apps/web/src/providers.tsx`)

```tsx
import { integrations } from "@gmacko/config";
import { QueryClientProvider } from "@tanstack/react-query";

import { PostHogProvider } from "@gmacko/analytics/web";

export function Providers({ children, queryClient }) {
  const app = <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return integrations.posthog ? <PostHogProvider>{app}</PostHogProvider> : app;
}
```

### Provider Assembly — Expo (`apps/expo/src/providers.tsx`)

```tsx
import { integrations } from "@gmacko/config";

export function Providers({ children }) {
  useEffect(() => {
    if (integrations.sentry) initSentry();
    if (integrations.posthog) initPostHog();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

### Env Validation Pattern — browser (`apps/web/src/env.ts`)

```ts
import { createEnv } from "@t3-oss/env-core";
import { integrations } from "@gmacko/config";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    ...(integrations.posthog && { VITE_POSTHOG_KEY: z.string() }),
    ...(integrations.sentry && { VITE_SENTRY_DSN: z.string().url().optional() }),
  },
  runtimeEnv: import.meta.env,
});
```

### Env Validation Pattern — Worker (`apps/web/src/server/config.ts`)

```ts
// The only reader of bindings. Fails at module load on a bad STAGE.
export const fromBindings = (env: Bindings, { version }): AppConfigShape => ({
  stage: parseStage(env.STAGE),
  baseUrl: env.PORTLESS_URL ?? env.APP_URL ?? "http://localhost:3001",
  auth: { secret: required(env, "AUTH_SECRET"), github: oauth(env, "GITHUB"), ... },
  otlp: { endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT },
  version,
});
```
