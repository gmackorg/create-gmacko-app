# `create-gmacko-app` Scaffold Spec

**Purpose:** Deterministically scaffold a new monorepo app from the Gmacko fork of `create-t3-turbo`, with a single-source-of-truth integration toggle model (Option A), smart defaults, and optional pruning (`--prune`).

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

**Supported flags (minimum spec)**
- `--yes` (accept defaults, no prompts)
- `--prune` (remove unused integration packages + references)
- `--no-install` (skip `pnpm install`)
- `--no-git` (skip `git init`)
- `--no-ai` (do not include AI skill system + docs)
- `--no-provision` (do not include `scripts/provision.sh`)
- `--web / --no-web` (default: `--web`)
- `--mobile / --no-mobile` (default: `--mobile`)
- `--tanstack-start / --no-tanstack-start` (default: `--no-tanstack-start`)
- `--integrations <comma-list>` overrides integration toggles entirely
  - accepted keys: `sentry,posthog,stripe,email,realtime,storage`
- `--email-provider <resend|sendgrid|none>` (default: `none`)
- `--realtime-provider <pusher|ably|none>` (default: `none`)
- `--storage-provider <uploadthing|none>` (default: `none`)
- `--package-scope <@your-scope>` (default: `@gmacko` for upstream parity OR `@repo` if you standardize; choose one and keep stable)
- `--db <neon>` (only `neon` supported; no prompt)
- `--auth <better-auth>` (only `better-auth` supported; no prompt)

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
  - Web (Next.js) **[default ON]**
  - Mobile (Expo) **[default ON]**
  - TanStack Start **[default OFF]**
- **Validation:** at least one selected

#### Prompt 3 — Package scope
- **Question:** "Package scope for workspace packages?"
- **Default:** `@gmacko` (upstream-compatible) OR `@repo` (gmacko standard)
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
  - Email **[default OFF]**
  - Realtime **[default OFF]**
  - Storage **[default OFF]**

#### Prompt 6 — Email provider (only if Email enabled)
- **Question:** "Email provider?"
- **Choices:** Resend, SendGrid
- **Default:** Resend
- **Validation:** must pick one

#### Prompt 7 — Realtime provider (only if Realtime enabled)
- **Question:** "Realtime provider?"
- **Choices:** Pusher, Ably
- **Default:** Pusher

#### Prompt 8 — Storage provider (only if Storage enabled)
- **Question:** "Storage provider?"
- **Choices:** UploadThing
- **Default:** UploadThing

#### Prompt 9 — Include AI workflow system?
- **Question:** "Include Gmacko AI workflow system (docs/ai + .opencode skills)?"
- **Default:** Yes
- **Validation:** boolean

#### Prompt 10 — Include provisioning script?
- **Question:** "Include interactive provisioning script (scripts/provision.sh)?"
- **Default:** Yes
- **Validation:** boolean

#### Prompt 11 — Prune unused integrations?
- **Question:** "Prune unused integrations from the repo? (recommended for public apps)"
- **Default:** No
- **Validation:** boolean

#### Prompt 12 — Install dependencies?
- **Question:** "Run pnpm install?"
- **Default:** Yes

#### Prompt 13 — Initialize git?
- **Question:** "Initialize a git repository?"
- **Default:** Yes

---

## 2) File Outputs (Generated/Modified by Answers)

### 2.1 Always-written outputs (all runs)

#### A) Root metadata
- Modify: `package.json`
  - Set `name` to `<app-name>`
  - Ensure package manager is `pnpm`
  - Update scripts (see below)
- Modify: `pnpm-workspace.yaml`
  - Ensure `apps/*` and `packages/*` included (unchanged if already)
- Modify: `README.md`
  - Replace template branding + quick start
  - Include "Integrations toggles" section (generated based on chosen integrations)
- Create: `.env.example`
  - Includes only required sections for enabled integrations (even without prune)
  - Always includes DB + auth required variables
- Create: `.gitignore` (if missing)
- Create: `gmacko.integrations.json` (optional but recommended for determinism)
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
- Create: `packages/config/package.json`
- Create: `packages/config/src/index.ts`
- Create: `packages/config/src/integrations.ts`
- Create: `packages/config/src/app.ts` (optional; recommended if you want displayName/appName centralized)

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

> Note: If you refuse to add `packages/config`, then instead write identical `integrations.ts` into `apps/nextjs/src/config/integrations.ts` and `apps/expo/src/config/integrations.ts`. The spec above assumes the shared package approach.

---

### 2.2 Platform-dependent outputs

#### Web selected (Next.js)
- Modify: `apps/nextjs/package.json`
  - Ensure deps for enabled integrations are present (or always present if not pruning)
- Modify: `apps/nextjs/src/env.ts`
  - Zod validation must only require env vars for enabled integrations
- Modify: `apps/nextjs/src/app/layout.tsx` (or the upstream equivalent)
  - Add conditional provider wiring based on `integrations`
- Modify: `apps/nextjs/src/instrumentation.ts` / `sentry.*` (only if Sentry enabled)
- Modify: `apps/nextjs/next.config.*` (only if Sentry enabled and you use Sentry plugin)

#### Mobile selected (Expo)
- Modify: `apps/expo/package.json`
- Modify: `apps/expo/app.json` (or `app.config.ts`)
  - Ensure `scheme` is set deterministically:
    - default: `<app-name>` (kebab-case) truncated to safe length
- Modify: `apps/expo/src/env.ts` (if present)
- Modify: `apps/expo/App.tsx` (or upstream root)
  - Conditional provider wiring based on `integrations`
- Modify: `apps/expo/src/utils/auth.ts` (keep better-auth expo client wiring; ensure base URL env key matches)

#### TanStack Start selected (if supported)
- Modify: `apps/tanstack-start/**` similarly:
  - env validation
  - provider wiring (if applicable)

---

### 2.3 AI system outputs (only if AI enabled)
- Copy/Create: `docs/ai/**`
- Copy/Create: `.opencode/skill/**`
- Copy/Create: `.opencode/agent/**` (if used)
- Copy/Create: `opencode.json`
- Create (optional): `PROJECT_MANIFEST.json` **only if you want it generated immediately**
  - If you don't want to generate it at scaffold time, you still include examples in `docs/ai/examples/`.

**Recommended behavior**
- If AI system enabled: generate a minimal `PROJECT_MANIFEST.json` that matches scaffold answers (platforms + integrations), so the AI workflow is "ready to run".

---

### 2.4 Provisioning outputs (only if provision enabled)
- Copy/Create: `scripts/provision.sh`
  - Must provision only enabled services
- Modify: `package.json`
  - Add `provision` script: `./scripts/provision.sh`

---

## 3) Integration Wiring (Toggle → Codebase Effects)

### 3.1 Global wiring rules (apply to all integrations)
Each integration must follow these invariants:

1. **No side effects when disabled**
   - No initialization at import time.
   - No provider mounted.
   - No env vars required.
2. **Explicit enable check in a single place**
   - Providers are assembled in one root file per app (`layout.tsx`, `App.tsx`).
3. **Typed config**
   - All code branches off `integrations` from `@<scope>/config`.
4. **Deterministic env validation**
   - Zod schemas require vars only when integration enabled.

---

### 3.2 Monitoring — Sentry (`integrations.sentry`)
**When ON**
- Web:
  - Add Sentry initialization via `packages/monitoring/web` (or direct Sentry SDK)
  - Hook into Next.js instrumentation as required by your approach
  - Env required:
    - `SENTRY_DSN` (or `NEXT_PUBLIC_SENTRY_DSN` depending on your model)
- Mobile:
  - Initialize Sentry in Expo entrypoint
  - Env required:
    - `SENTRY_DSN` (or `EXPO_PUBLIC_SENTRY_DSN`)

**When OFF**
- No Sentry init files referenced from app entrypoints
- Env schema does not mention Sentry vars

**Deterministic wiring pattern**
- `apps/nextjs/src/app/layout.tsx`:
  - wrap app with `<SentryBoundary>` only if enabled
- `apps/expo/App.tsx`:
  - call `initSentry()` only if enabled

---

### 3.3 Analytics — PostHog (`integrations.posthog`)
**When ON**
- Web:
  - Mount PostHog provider early (after auth, before API calls if you want user identification)
  - Env required:
    - `NEXT_PUBLIC_POSTHOG_KEY`
    - `NEXT_PUBLIC_POSTHOG_HOST` (optional if default)
- Mobile:
  - Initialize PostHog native wrapper/provider
  - Env required:
    - `EXPO_PUBLIC_POSTHOG_KEY`
    - `EXPO_PUBLIC_POSTHOG_HOST` (optional)

**When OFF**
- No provider mounted
- No analytics package imported by entrypoints
- Env not required

---

### 3.4 Payments — Stripe (`integrations.stripe`)
**When ON**
- Server/web:
  - Add `packages/payments` and wire Stripe client/server helpers
  - Add webhook route:
    - Next.js: `apps/nextjs/src/app/api/stripe/webhook/route.ts` (or equivalent)
  - Env required:
    - `STRIPE_SECRET_KEY`
    - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
    - `STRIPE_WEBHOOK_SECRET`
- Optional DB tables:
  - If your payments package expects DB tables, add them deterministically (or document that they are optional)

**When OFF**
- No webhook route generated
- No Stripe env keys required
- No payments package referenced

---

### 3.5 Email (`integrations.email.enabled`)
Email is two-dimensional: enabled + provider.

**When ON**
- Add `packages/email`
- Provider-specific wiring:
  - Resend:
    - Env required: `RESEND_API_KEY`, `EMAIL_FROM`
  - SendGrid:
    - Env required: `SENDGRID_API_KEY`, `EMAIL_FROM`
- Add an example transactional email function:
  - `packages/email/src/send.ts`
- Optional: add a "test email" route for dev:
  - `apps/nextjs/src/app/api/email/test/route.ts` (dev-only guarded)

**When OFF**
- No email package referenced
- No email env keys required
- No routes created

---

### 3.6 Realtime (`integrations.realtime.enabled`)
Enabled + provider.

**When ON**
- Add `packages/realtime`
- Provider-specific:
  - Pusher env: `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`
  - Ably env: `ABLY_API_KEY`
- Add example event channel usage:
  - server emitter helper
  - client subscription helper (web + mobile if needed)

**When OFF**
- No realtime package referenced
- Env not required

---

### 3.7 Storage (`integrations.storage.enabled`)
Enabled + provider.

**When ON**
- Add `packages/storage`
- UploadThing:
  - Add Next.js route handler for UploadThing
  - Env required: `UPLOADTHING_SECRET`, `UPLOADTHING_APP_ID` (names depend on chosen SDK)
- Add example upload UI component (web) and optional mobile helper.

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

**Important:** Prune must not remove shared infrastructure (`packages/config`, core DB/auth/api/ui) even if it contains flags for integrations.

---

### 4.2 Prune matrix (deterministic)

#### If `integrations.sentry === false`
Remove:
- `packages/monitoring/**` (if dedicated)
- `apps/nextjs/src/instrumentation.ts` *only if it exists solely for Sentry*
- `apps/nextjs/sentry.*` files (e.g., `sentry.client.config.ts`, `sentry.server.config.ts`)
- Any Sentry-specific Next.js config plugin wiring
- Sentry env keys from `.env.example`

Modify:
- `apps/nextjs/src/app/layout.tsx`: remove Sentry wrapper branch entirely

#### If `integrations.posthog === false`
Remove:
- `packages/analytics/**` (if dedicated)
- Any PostHog provider/component files
- PostHog env keys from `.env.example`

Modify:
- app entrypoints: remove provider branches

#### If `integrations.stripe === false`
Remove:
- `packages/payments/**`
- `apps/nextjs/src/app/api/stripe/**` (webhook routes)
- Any Stripe UI components or server helpers
- Stripe env keys from `.env.example`

Modify:
- Remove any mention of webhooks from docs

#### If `integrations.email.enabled === false`
Remove:
- `packages/email/**`
- Optional email test routes
- Email env keys from `.env.example`

#### If `integrations.realtime.enabled === false`
Remove:
- `packages/realtime/**`
- Example subscription/emitter files
- Realtime env keys from `.env.example`

#### If `integrations.storage.enabled === false`
Remove:
- `packages/storage/**`
- Upload routes + UI components
- Storage env keys from `.env.example`

---

### 4.3 Dependency pruning rules
For each removed package:
- Remove it from `pnpm-workspace.yaml` only if your workspace list is explicit (most are globbed, so usually no change).
- Remove any `@<scope>/<package>` dependency from:
  - `apps/nextjs/package.json`
  - `apps/expo/package.json`
  - `packages/api/package.json` (if any)
  - root `package.json` (if any)

---

### 4.4 Code pruning rules (avoid dangling imports)
After file deletions:
- Remove imports referencing deleted packages/files.
- Remove unused exports and re-exports.
- Remove dead env validation branches.

**Determinism requirement:** the prune step must end with a repo that typechecks with no conditional compilation.

---

## 5) Output Summary (What the generator guarantees)

After scaffolding:
- There is exactly one runtime "integration truth" source (`@<scope>/config` → `integrations`).
- Disabled integrations:
  - Without prune: present but not wired, no required env vars.
  - With prune: removed entirely, no references remain.
- Defaults produce a working app with:
  - better-auth + Neon + tRPC + shadcn UI
  - Sentry + PostHog enabled but not blocking local dev if env vars missing (you choose whether "enabled requires env" vs "enabled but optional in dev"; pick one and enforce consistently).

---

## 6) Recommended Consistency Decisions (Lock these before coding)

To keep implementation deterministic, pick and document these constants:

1. **Env var naming**
   - Recommended: `DATABASE_URL` (not `POSTGRES_URL`)
2. **Expo scheme rule**
   - Recommended: `scheme = <app-name>` (kebab-case) and stable
3. **Default integration behavior in dev**
   - Recommended: if integration enabled, env vars are required (fail fast) — simplest to reason about.
   - Alternative: allow missing env in dev (more DX-friendly, more branching). If you choose this, define exact behavior per integration.

---

## Appendix: Reference Implementation Skeleton

### Provider Assembly — Next.js (`apps/nextjs/src/app/layout.tsx`)

```tsx
import { integrations } from "@gmacko/config";

// Conditional imports (tree-shaken when disabled)
const SentryProvider = integrations.sentry 
  ? (await import("@gmacko/monitoring/web")).SentryProvider 
  : ({ children }: { children: React.ReactNode }) => children;

const PostHogProvider = integrations.posthog
  ? (await import("@gmacko/analytics/web")).PostHogProvider
  : ({ children }: { children: React.ReactNode }) => children;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <SentryProvider>
          <PostHogProvider>
            <TRPCProvider>
              {children}
            </TRPCProvider>
          </PostHogProvider>
        </SentryProvider>
      </body>
    </html>
  );
}
```

### Provider Assembly — Expo (`apps/expo/App.tsx`)

```tsx
import { integrations } from "@gmacko/config";

export default function App() {
  useEffect(() => {
    if (integrations.sentry) {
      initSentry();
    }
    if (integrations.posthog) {
      initPostHog();
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack />
    </QueryClientProvider>
  );
}
```

### Env Validation Pattern (`apps/nextjs/src/env.ts`)

```ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { integrations } from "@gmacko/config";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32),
    // Conditional validation
    ...(integrations.sentry && {
      SENTRY_DSN: z.string().url(),
    }),
    ...(integrations.stripe && {
      STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
      STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
    }),
  },
  client: {
    ...(integrations.posthog && {
      NEXT_PUBLIC_POSTHOG_KEY: z.string(),
    }),
    ...(integrations.stripe && {
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
    }),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    // ... rest
  },
});
```
