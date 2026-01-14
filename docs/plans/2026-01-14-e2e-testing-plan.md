# E2E Testing Plan (create-gmacko-app)

Date: 2026-01-14

## Bottom line

Use **tiered E2E** per app (Playwright for web, Maestro for mobile) gated in CI, backed by a **hybrid test-data strategy**: PRs get an **ephemeral Neon branch cloned from a seeded base branch**, while local dev uses a **shared staging DB** plus deterministic seeding.

To make auth tests reliable (Discord OAuth is a CI liability), add a **test-only auth path** (email/password or "test login" endpoint) enabled only under `E2E_TESTING=1`, while still covering real OAuth in a non-blocking nightly job if desired.

## Action plan (implementation sequence)

1. Create test directories + conventions (web + mobile).
2. Add Neon branch lifecycle automation (CI + optional local scripts).
3. Make DB seed "E2E-aware" (deterministic users/roles + entities + API keys).
4. Implement a CI-safe auth strategy for E2E (test-only, gated by env).
5. Expand Playwright to cover all critical flows + fixtures + POM.
6. Add Maestro flows for mobile critical paths (reusing same seed/users).
7. Add GitHub Actions workflows: `e2e-web.yml` + `e2e-mobile.yml` with smoke/full triggers.

**Effort estimate:** **Medium (1-2d)** if you already have the needed UI routes and can add test-only auth quickly; **Large (3d+)** if the app currently has no non-OAuth sign-in path and you must build one.

---

## Goals & gating model

### Goals

- **CI/CD gate:** prevent deploys when critical flows break.
- **Regression safety net:** catch auth + CRUD + admin regressions early.
- **Living documentation:** tests encode "what must work".

### Tiers

- **Smoke** (PR gate, <2 minutes target):
  - Auth: sign-in + sign-out + session persistence (minimal)
  - Core CRUD: create + list + delete primary entity
  - Settings: load + update a preference
  - API key management: create + revoke
  - Admin panel: user list + role change
- **Full suite** (main branch merges):
  - More browsers/devices, expanded coverage, negative cases, a11y checks

---

## Directory structure & naming conventions

### Web (Next.js): `apps/nextjs/e2e`

Keep the existing `apps/nextjs/e2e` (Playwright already targets it).

Recommended structure:

```
apps/nextjs/
  e2e/
    _setup/
      global.setup.ts
      auth.setup.ts                # generates storageState files
    fixtures/
      test.ts                      # base test fixture export (auth + helpers)
    pages/
      home.page.ts
      auth.page.ts
      settings.page.ts
      admin.page.ts
      api-keys.page.ts
      posts.page.ts
    specs/
      smoke/
        auth.smoke.spec.ts
        posts.smoke.spec.ts
        settings.smoke.spec.ts
        api-keys.smoke.spec.ts
        admin.smoke.spec.ts
      full/
        auth.full.spec.ts
        posts.full.spec.ts
        ...
    utils/
      env.ts
      urls.ts
      selectors.ts                 # data-testid conventions
      db.ts                        # optional direct DB helpers (minimal)
      neon.ts                      # optional local neonctl helpers
      test-data.ts                 # shared constants: seeded users, IDs
    README.md
```

Naming:

- Test files: `*.spec.ts`
- Use tags in titles for tiering: `test("... @smoke", ...)`
- Prefer `data-testid` selectors over text/structure.

### Mobile (Expo): `apps/expo/.maestro`

If `.maestro` does not exist yet, create it (your `package.json` already runs `maestro test .maestro/`).

Recommended structure:

```
apps/expo/
  .maestro/
    config.yaml
    flows/
      smoke/
        01-auth-signin.yaml
        02-settings.yaml
        03-posts-crud.yaml
        04-api-keys.yaml
        05-auth-signout.yaml
      full/
        ...
    subflows/
      login.yaml
      ensure-logged-out.yaml
      navigate.yaml
    README.md
```

---

## Playwright setup (Next.js)

### 1) `apps/nextjs/playwright.config.ts` (extend existing)

Current config is good, but two changes are important for CI reliability:

- Ensure a web server runs in CI (today it is `undefined` in CI).
- Add `globalSetup` + tier configuration (smoke vs full) via env.

Example (key parts only):

```ts
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const isCI = !!process.env.CI;
const tier = process.env.E2E_TIER ?? "smoke"; // "smoke" | "full"

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/_setup/global.setup.ts",

  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,

  reporter: [
    ["html", { open: "never" }],
    ["json", { outputFile: "playwright-report/results.json" }],
    isCI ? ["github"] : ["list"],
  ],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: isCI ? "retain-on-failure" : "off",
  },

  // Smoke: chromium only to stay fast; Full: matrix browsers/devices
  projects:
    tier === "smoke"
      ? [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
      : [
          { name: "chromium", use: { ...devices["Desktop Chrome"] } },
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
          { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
          { name: "mobile-safari", use: { ...devices["iPhone 12"] } },
        ],

  webServer: {
    command: isCI ? "pnpm build && pnpm start" : "pnpm dev",
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 180 * 1000,
  },
});
```

### 2) Global setup: DB + auth state

Add `apps/nextjs/e2e/_setup/global.setup.ts` to:

- Validate required env vars (`DATABASE_URL`, `E2E_TESTING`, etc.)
- Optionally run `pnpm db:seed` (local) when using shared staging DB
- Generate storageState files via `auth.setup.ts`

Minimal skeleton:

```ts
import { execSync } from "node:child_process";

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");

  // Local-only convenience: seed once (CI should use Neon base branch clone)
  if (!process.env.CI && process.env.E2E_AUTO_SEED === "1") {
    execSync("pnpm db:seed", { stdio: "inherit" });
  }

  // Generate storageState for user/admin (fast path)
  execSync("node ./e2e/_setup/auth.setup.mjs", { stdio: "inherit" });
}
```

### 3) Auth fixtures & strategy (critical)

#### Why you need this

Your web UI currently shows "Sign in with Discord". **Discord OAuth is not deterministic in CI** (CAPTCHAs, 2FA, redirects, provider uptime), so it's a poor CI gate.

#### Primary recommendation (minimal + reliable)

Add a **test-only auth method** enabled only when `E2E_TESTING=1`:

- Option A (preferred): enable **email/password sign-in** in better-auth for test/staging only.
- Option B (very pragmatic): add a **test-only login endpoint** (e.g. `POST /api/e2e/login`) that:
  - validates `E2E_TEST_SECRET`
  - creates/returns an authenticated session for a seeded user/admin
  - returns proper `Set-Cookie` headers (so Playwright can save storageState)

This keeps CI stable while still allowing you to run real Discord OAuth tests in a **nightly non-blocking workflow** if you want.

#### Playwright fixture pattern

Create `apps/nextjs/e2e/fixtures/test.ts` that exports a `test` with helpers:

- `loginAsUser()`, `loginAsAdmin()`
- `seeded` constants (seed emails/IDs)
- optional `api` request client for setup/teardown

Then use `test.use({ storageState: "e2e/.auth/admin.json" })` for most specs.

### 4) Page Object Model (POM)

Use POM lightly (avoid over-abstraction). Keep one file per page/feature area:

- `AuthPage`: sign-in/out and session assertions
- `SettingsPage`: read/update prefs
- `PostsPage`: create/delete post via UI
- `ApiKeysPage`: create/revoke key
- `AdminPage`: list users, promote/demote (guard rails)

### 5) Example spec outlines for critical flows

Auth (`apps/nextjs/e2e/specs/smoke/auth.smoke.spec.ts`)

- `sign in @smoke` (via test auth path)
- `session persists on reload @smoke`
- `sign out clears session @smoke`

Core CRUD (`apps/nextjs/e2e/specs/smoke/posts.smoke.spec.ts`)

- `create post @smoke`
- `post appears in list @smoke`
- `delete post @smoke`

Settings (`apps/nextjs/e2e/specs/smoke/settings.smoke.spec.ts`)

- `load preferences @smoke`
- `update theme/language/timezone @smoke` (your DB supports this)

Admin (`apps/nextjs/e2e/specs/smoke/admin.smoke.spec.ts`)

- `admin can list users @smoke`
- `admin can update user role @smoke` (protect against self-demotion already exists)

API keys (`apps/nextjs/e2e/specs/smoke/api-keys.smoke.spec.ts`)

- `create API key @smoke` (verify prefix/permissions appear)
- `revoke API key @smoke` (verify disappears / revoked state)

---

## Maestro setup (Expo)

### 1) `apps/expo/.maestro/config.yaml`

Keep it env-driven so it works locally and in Maestro Cloud.

Example:

```yaml
appId: ${APP_ID}
name: gmacko-e2e
env:
  API_URL: ${API_URL}
  E2E_TESTING: "1"
  TEST_USER_EMAIL: ${TEST_USER_EMAIL}
  TEST_USER_PASSWORD: ${TEST_USER_PASSWORD}
  TEST_ADMIN_EMAIL: ${TEST_ADMIN_EMAIL}
  TEST_ADMIN_PASSWORD: ${TEST_ADMIN_PASSWORD}
```

### 2) Flow examples (critical paths)

Auth sign-in (`apps/expo/.maestro/flows/smoke/01-auth-signin.yaml`)

- `launchApp`
- navigate to sign-in screen
- fill email/password (or trigger test login)
- assert home/dashboard visible

Settings (`apps/expo/.maestro/flows/smoke/02-settings.yaml`)

- navigate to settings tab
- toggle theme / update language
- assert persisted state (close + relaunch)

Posts CRUD (`apps/expo/.maestro/flows/smoke/03-posts-crud.yaml`)

- create post
- verify list shows it
- delete post

API keys (`apps/expo/.maestro/flows/smoke/04-api-keys.yaml`)

- create key, copy to clipboard (assert toast / prefix)
- revoke key

Sign-out (`apps/expo/.maestro/flows/smoke/05-auth-signout.yaml`)

- sign out
- assert sign-in screen

### 3) Mobile auth handling

Use the **same CI-safe auth strategy** as web:

- If you add email/password for test/staging, Maestro can drive it like a normal form.
- If you implement a test login endpoint, consider a simple "E2E Login" screen gated by `E2E_TESTING=1` that:
  - calls your backend to establish a session/token
  - stores session in `expo-secure-store` / cookie jar as required by `@better-auth/expo`
  - then navigates to app home

This avoids third-party OAuth entirely in mobile E2E, which is especially important on emulators in CI.

---

## Neon branching integration (CI + local)

### Data model you already have

- Schema: `packages/db/src/schema.ts` + `packages/db/src/auth-schema.ts`
- Seed script: `packages/db/src/seed.ts` (idempotent, deterministic IDs/emails)
- DB URL: everything reads `process.env.DATABASE_URL`

### 1) Seeded base branch strategy (hybrid)

Maintain a Neon branch (example name: `e2e-base`) that is:

- migrated to latest schema
- seeded with deterministic fixtures (users, admin, posts, api keys)

CI creates a short-lived branch per PR from `e2e-base`:

- no cross-test contamination
- fast startup (data already present)
- easy cleanup (delete branch or set expiration)

### 2) CI branch lifecycle (recommended: official actions)

- Create branch: `neondatabase/create-branch-action@v6`
- Delete branch: `neondatabase/delete-branch-action@v3`
- Export connection string to `DATABASE_URL`

### 3) Local scripts (optional but useful)

Add:

- `scripts/neon/create-branch.ts`
- `scripts/neon/delete-branch.ts`

Implementation approach:

- Prefer `neonctl` (already used in repo tooling) for local convenience.
- Inputs: `NEON_PROJECT_ID`, `NEON_API_KEY` (or neonctl auth), `E2E_BASE_BRANCH`, `E2E_BRANCH_NAME`.

Outputs:

- prints a pooled/non-pooled `DATABASE_URL`
- optionally writes `.env.e2e.local` for local runs

---

## Seed data structure (make it E2E-ready)

Update `packages/db/src/seed.ts` so E2E tests can rely on:

- A seeded **admin user** (`role: "admin"`)
- Known user emails/passwords if you introduce email/password
- Seeded API keys that represent realistic permission sets
- Clear labels/prefixes for "seed-generated" entities for safe cleanup

Recommended conventions:

- Users:
  - `alice.seed@example.com` (regular user)
  - `admin.seed@example.com` (admin)
- IDs:
  - fixed user IDs for idempotency (you already do this)
- Posts:
  - include one deterministic post title you can assert on
- API keys:
  - seed at least one `read` and one `admin` permission example (even if CI later creates new keys)

---

## GitHub Actions workflows

Create two workflows so web/mobile run in parallel, as requested.

### 1) `/.github/workflows/e2e-web.yml` (Playwright)

Triggers:

- PR: smoke tier (`E2E_TIER=smoke`) - gating
- push to `main`: full tier (`E2E_TIER=full`) - gating

High-level job steps:

1. Checkout + setup Node 22 + pnpm cache
2. Create Neon branch from `e2e-base`
3. Export `DATABASE_URL`
4. Run `pnpm db:migrate` (optional if base is always current; recommended for safety)
5. Run Playwright smoke/full (`pnpm -F @gmacko/nextjs e2e`)
6. Always upload Playwright artifacts
7. Always delete Neon branch

Skeleton:

```yaml
name: E2E Web

on:
  pull_request:
  push:
    branches: [main]

jobs:
  e2e-web:
    runs-on: ubuntu-latest
    timeout-minutes: 20

    env:
      E2E_TESTING: "1"
      E2E_TIER: ${{ github.event_name == 'pull_request' && 'smoke' || 'full' }}

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install deps
        run: pnpm i --frozen-lockfile

      - name: Create Neon branch
        id: neon
        uses: neondatabase/create-branch-action@v6
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          api_key: ${{ secrets.NEON_API_KEY }}
          parent_branch: e2e-base
          branch_name: e2e-${{ github.run_id }}-${{ github.run_attempt }}

      - name: Set DATABASE_URL
        run: echo "DATABASE_URL=${{ steps.neon.outputs.db_url_pooled }}" >> "$GITHUB_ENV"

      - name: Migrate (optional but recommended)
        run: pnpm db:migrate

      - name: Run Playwright
        run: pnpm -F @gmacko/nextjs e2e
        env:
          E2E_TEST_SECRET: ${{ secrets.E2E_TEST_SECRET }}

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            apps/nextjs/playwright-report
            apps/nextjs/test-results

      - name: Delete Neon branch
        if: always()
        uses: neondatabase/delete-branch-action@v3
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          api_key: ${{ secrets.NEON_API_KEY }}
          branch: ${{ steps.neon.outputs.branch_name }}
```

### 2) `/.github/workflows/e2e-mobile.yml` (Maestro Cloud)

Triggers:

- PR: smoke (gating) OR start as non-blocking until stable, then flip to gating
- push to `main`: full (gating)

Key points:

- Maestro Cloud handles emulator provisioning
- Provide `API_URL` pointing at your deployed preview backend (or a dedicated E2E backend)
- Use the same seeded identity strategy as web

Skeleton (provider-specific; adapt to your Maestro Cloud action/CLI):

```yaml
name: E2E Mobile

on:
  pull_request:
  push:
    branches: [main]

jobs:
  e2e-mobile:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - name: Run Maestro Cloud
        run: |
          # Example: maestro-cloud upload / run
          # Provide APP_ID, API_URL, and test creds/secrets
          echo "Integrate Maestro Cloud run here"
        env:
          MAESTRO_CLOUD_API_KEY: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
          API_URL: ${{ secrets.E2E_API_URL }}
          APP_ID: ${{ secrets.EXPO_APP_ID }}
          TEST_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}
```

---

## Local development workflow

### Web (Playwright)

From repo root:

- Smoke: `pnpm e2e:web -- --grep @smoke`
- Full: `E2E_TIER=full pnpm e2e:web`
- UI mode: `pnpm -F @gmacko/nextjs e2e:ui`
- Headed: `pnpm -F @gmacko/nextjs e2e:headed`

Recommended local env:

- Use a shared staging DB (`DATABASE_URL` points to staging)
- Set `E2E_AUTO_SEED=1` to reseed on demand (or run `pnpm db:seed` manually)
- Use unique per-dev identifiers (email suffix / post title prefix) to avoid collisions

### Mobile (Maestro)

From `apps/expo`:

- Run all flows: `pnpm e2e`
- Record: `pnpm e2e:record`
- Studio: `pnpm e2e:studio`

Tip: Add a small `apps/expo/.maestro/README.md` with a "known-good" simulator config and required env vars.

---

## Test utilities & helpers

### Auth helpers

- Web: `loginAsUser()`, `loginAsAdmin()` implemented once (fixture).
- Mobile: a shared `login.yaml` subflow.
- Prefer "fast auth" (storageState / test-only login) for most tests; reserve "true login flow" tests for a smaller set.

### Data factories

Keep them close to tests unless you need cross-app sharing:

- `apps/nextjs/e2e/utils/test-data.ts`:
  - seeded user emails/IDs
  - admin email/ID
  - stable post titles
  - permission sets

If you later share across apps, promote into `packages/test-utils` (only if needed).

### Cleanup utilities

With Neon branches per CI run, cleanup is mostly unnecessary.

For local staging DB:

- ensure seed script is idempotent (it is today)
- add "namespace prefix" for locally-created entities (e.g. `local_<username>_...`) and a cleanup command if needed

---

## Watch outs (risks + mitigations)

- **OAuth flakiness (Discord)**: don't gate CI on third-party OAuth UI. Mitigation: test-only auth path gated by `E2E_TESTING=1`.
- **Selector instability**: add `data-testid` for all critical UI elements (tabs, buttons, inputs). Avoid matching by text where translations/themes vary.
- **Neon base drift**: if `e2e-base` isn't kept current, branches won't match schema. Mitigation: run `pnpm db:migrate` in CI even when branching from base, or have a scheduled workflow that rebuilds `e2e-base`.
- **Test time budget**: smoke must stay <2 minutes. Mitigation: chromium-only, avoid unnecessary page reloads, prefer storageState auth.

---

## Escalation triggers (when to revisit with a more complex solution)

- Smoke suite exceeds ~2 minutes consistently - split smoke further or parallelize with shard-by-file.
- Local staging DB causes frequent collisions - move local dev to per-dev Neon branches (scripted).
- Auth still flaky in mobile - add a dedicated in-app E2E harness screen for login/session reset.

## Alternative sketch (advanced path, only if needed later)

A more sophisticated approach is a full "test harness mode":

- a dedicated `@gmacko/testkit` package with factories + reset APIs
- per-test database reset using transactional tests or schema cloning
- nightly real OAuth validation against Discord in a separate non-blocking workflow

For now, the simplest reliable gate is: **Neon branch per run + deterministic seed + CI-safe auth**.
