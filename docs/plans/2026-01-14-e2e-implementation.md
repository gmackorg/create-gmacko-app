# E2E Testing Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up production-ready E2E testing with Playwright (web), Maestro (mobile), Neon branch-per-run isolation, and CI-safe test auth.

**Architecture:** Tiered testing (smoke on PR <2min, full on main), ephemeral Neon branches for CI test isolation, test-only email/password auth gated by `E2E_TESTING=1`, parallel GitHub Actions workflows for web/mobile.

**Tech Stack:** Playwright, Maestro, Neon branching, better-auth email/password plugin, GitHub Actions, pnpm workspaces

---

## Phase 1: Test-Only Auth (CI-Safe)

### Task 1.1: Add email/password auth plugin for E2E

**Files:**

- Modify: `packages/auth/src/index.ts`
- Modify: `apps/nextjs/src/app/api/auth/[...all]/route.ts`

**Step 1: Update auth config to include email/password when E2E_TESTING is set**

In `packages/auth/src/index.ts`, add the emailAndPassword plugin:

```typescript
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oAuthProxy } from "better-auth/plugins";

import { db } from "@gmacko/db/client";

export function initAuth<
  TExtraPlugins extends BetterAuthPlugin[] = [],
>(options: {
  baseUrl: string;
  productionUrl: string;
  secret: string | undefined;

  discordClientId: string;
  discordClientSecret: string;
  extraPlugins?: TExtraPlugins;
  enableTestAuth?: boolean; // NEW
}) {
  const config = {
    database: drizzleAdapter(db, {
      provider: "pg",
    }),
    baseURL: options.baseUrl,
    secret: options.secret,
    emailAndPassword: options.enableTestAuth
      ? {
          enabled: true,
          requireEmailVerification: false,
        }
      : undefined,
    plugins: [
      oAuthProxy({
        productionURL: options.productionUrl,
      }),
      expo(),
      ...(options.extraPlugins ?? []),
    ],
    socialProviders: {
      discord: {
        clientId: options.discordClientId,
        clientSecret: options.discordClientSecret,
        redirectURI: `${options.productionUrl}/api/auth/callback/discord`,
      },
    },
    trustedOrigins: ["expo://"],
    onAPIError: {
      onError(error, ctx) {
        console.error("BETTER AUTH API ERROR", error, ctx);
      },
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
```

**Step 2: Update Next.js auth route to pass enableTestAuth**

In `apps/nextjs/src/app/api/auth/[...all]/route.ts`, find where `initAuth` is called and add:

```typescript
enableTestAuth: process.env.E2E_TESTING === "1",
```

**Step 3: Verify auth changes compile**

Run: `pnpm typecheck`
Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add packages/auth/src/index.ts apps/nextjs/src/app/api/auth/
git commit -m "feat(auth): add email/password auth for E2E testing

Gated behind E2E_TESTING=1 env var"
```

---

### Task 1.2: Add admin user to seed with password

**Files:**

- Modify: `packages/db/src/seed.ts`

**Step 1: Add admin user with known password to seed**

Update `packages/db/src/seed.ts` to include an admin user. Add to the `sampleUsers` array:

```typescript
const SEED_ADMIN_ID = "seed_admin_e2e_001";

// Add to sampleUsers array:
{
  id: SEED_ADMIN_ID,
  name: "E2E Admin",
  email: "admin.e2e@example.com",
  emailVerified: true,
  image: null,
  role: "admin", // if your schema supports roles
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-01T00:00:00Z"),
}
```

Also add an `account` record for password auth (better-auth stores passwords in `account` table):

```typescript
// After inserting users, insert account for password auth
// Password: "e2e-test-password-123" (bcrypt hash)
import { hash } from "bcryptjs";

const E2E_TEST_PASSWORD = "e2e-test-password-123";
const hashedPassword = await hash(E2E_TEST_PASSWORD, 10);

// Insert into account table for admin user
await db.insert(account).values({
  id: randomUUID(),
  userId: SEED_ADMIN_ID,
  accountId: SEED_ADMIN_ID,
  providerId: "credential",
  password: hashedPassword,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Also add for alice (regular user)
await db.insert(account).values({
  id: randomUUID(),
  userId: SEED_USER_IDS[0]!,
  accountId: SEED_USER_IDS[0]!,
  providerId: "credential",
  password: hashedPassword,
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

**Step 2: Export seed constants for E2E tests**

Create `packages/db/src/seed-constants.ts`:

```typescript
// Exported for E2E tests to use
export const E2E_SEED = {
  ADMIN: {
    id: "seed_admin_e2e_001",
    email: "admin.e2e@example.com",
    password: "e2e-test-password-123",
  },
  USER: {
    id: "seed_user_alice_001",
    email: "alice.seed@example.com",
    password: "e2e-test-password-123",
  },
} as const;
```

**Step 3: Update package.json exports**

In `packages/db/package.json`, add export for seed-constants:

```json
"./seed-constants": {
  "types": "./dist/seed-constants.d.ts",
  "default": "./dist/seed-constants.js"
}
```

**Step 4: Verify seed runs**

Run: `pnpm -F @gmacko/db build`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/db/
git commit -m "feat(db): add E2E seed users with password auth

- Admin user: admin.e2e@example.com
- Regular user: alice.seed@example.com
- Export seed constants for E2E tests"
```

---

## Phase 2: Playwright Infrastructure

### Task 2.1: Create Playwright directory structure

**Files:**

- Create: `apps/nextjs/e2e/_setup/global.setup.ts`
- Create: `apps/nextjs/e2e/_setup/auth.setup.ts`
- Create: `apps/nextjs/e2e/fixtures/test.ts`
- Create: `apps/nextjs/e2e/utils/test-data.ts`

**Step 1: Create global setup**

Create `apps/nextjs/e2e/_setup/global.setup.ts`:

```typescript
import { execSync } from "node:child_process";

export default async function globalSetup() {
  // Validate required env vars
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for E2E tests");
  }

  // Local-only: auto-seed if requested
  if (!process.env.CI && process.env.E2E_AUTO_SEED === "1") {
    console.log("Seeding database for E2E tests...");
    execSync("pnpm db:seed", { stdio: "inherit", cwd: "../.." });
  }

  console.log("Global setup complete");
}
```

**Step 2: Create auth setup for storageState**

Create `apps/nextjs/e2e/_setup/auth.setup.ts`:

```typescript
import type { FullConfig } from "@playwright/test";
import { chromium } from "@playwright/test";

import { E2E_SEED } from "@gmacko/db/seed-constants";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function authenticateUser(
  email: string,
  password: string,
  storageStatePath: string,
) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to sign-in
  await page.goto(`${baseURL}/api/auth/signin`);

  // Fill email/password form (better-auth credential form)
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect to home (authenticated)
  await page.waitForURL(`${baseURL}/`);

  // Save storage state
  await context.storageState({ path: storageStatePath });
  await browser.close();
}

export default async function authSetup(config: FullConfig) {
  if (process.env.E2E_TESTING !== "1") {
    console.log("Skipping auth setup (E2E_TESTING not set)");
    return;
  }

  console.log("Setting up auth storage states...");

  // Create .auth directory
  const fs = await import("fs/promises");
  await fs.mkdir("e2e/.auth", { recursive: true });

  // Authenticate admin
  await authenticateUser(
    E2E_SEED.ADMIN.email,
    E2E_SEED.ADMIN.password,
    "e2e/.auth/admin.json",
  );

  // Authenticate regular user
  await authenticateUser(
    E2E_SEED.USER.email,
    E2E_SEED.USER.password,
    "e2e/.auth/user.json",
  );

  console.log("Auth setup complete");
}
```

**Step 3: Create test fixtures**

Create `apps/nextjs/e2e/fixtures/test.ts`:

```typescript
import { test as base } from "@playwright/test";

import { E2E_SEED } from "@gmacko/db/seed-constants";

// Export seed data for assertions
export const seed = E2E_SEED;

// Authenticated test fixtures
export const test = base.extend({});

// Pre-authenticated as regular user
export const userTest = base.extend({
  storageState: "e2e/.auth/user.json",
});

// Pre-authenticated as admin
export const adminTest = base.extend({
  storageState: "e2e/.auth/admin.json",
});

export { expect } from "@playwright/test";
```

**Step 4: Create test data utilities**

Create `apps/nextjs/e2e/utils/test-data.ts`:

```typescript
import { E2E_SEED } from "@gmacko/db/seed-constants";

export const testData = {
  admin: E2E_SEED.ADMIN,
  user: E2E_SEED.USER,

  // Test-specific data
  post: {
    title: "E2E Test Post",
    content: "This post was created by E2E tests",
  },

  apiKey: {
    name: "E2E Test API Key",
  },
} as const;

// Selectors (data-testid convention)
export const selectors = {
  signInButton: '[data-testid="sign-in-button"]',
  signOutButton: '[data-testid="sign-out-button"]',
  userMenu: '[data-testid="user-menu"]',
  postList: '[data-testid="post-list"]',
  postItem: '[data-testid="post-item"]',
  createPostButton: '[data-testid="create-post-button"]',
  settingsForm: '[data-testid="settings-form"]',
  apiKeyList: '[data-testid="api-key-list"]',
  adminUserList: '[data-testid="admin-user-list"]',
} as const;
```

**Step 5: Commit**

```bash
git add apps/nextjs/e2e/
git commit -m "feat(e2e): add Playwright infrastructure

- Global setup with env validation
- Auth setup for storageState generation
- Test fixtures for user/admin auth
- Test data utilities and selectors"
```

---

### Task 2.2: Update Playwright config

**Files:**

- Modify: `apps/nextjs/playwright.config.ts`

**Step 1: Update config with tiers and global setup**

Replace `apps/nextjs/playwright.config.ts`:

```typescript
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const isCI = !!process.env.CI;
const tier = (process.env.E2E_TIER ?? "smoke") as "smoke" | "full";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/_setup/global.setup.ts",

  // Test filtering by tier
  grep: tier === "smoke" ? /@smoke/ : undefined,

  fullyParallel: true,
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

  // Smoke: chromium only (fast); Full: all browsers
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
    env: {
      E2E_TESTING: "1",
    },
  },
});
```

**Step 2: Add .auth to .gitignore**

Add to `apps/nextjs/.gitignore`:

```
# E2E auth state
e2e/.auth/
```

**Step 3: Verify config is valid**

Run: `pnpm -F @gmacko/nextjs exec playwright test --list`
Expected: Lists available tests

**Step 4: Commit**

```bash
git add apps/nextjs/playwright.config.ts apps/nextjs/.gitignore
git commit -m "feat(e2e): update Playwright config with tiers and global setup"
```

---

### Task 2.3: Write smoke tests for auth flow

**Files:**

- Create: `apps/nextjs/e2e/specs/smoke/auth.smoke.spec.ts`

**Step 1: Write auth smoke tests**

Create `apps/nextjs/e2e/specs/smoke/auth.smoke.spec.ts`:

```typescript
import { expect, test, userTest } from "../../fixtures/test";
import { testData } from "../../utils/test-data";

test.describe("Auth @smoke", () => {
  test("shows sign in button when not authenticated", async ({ page }) => {
    await page.goto("/");

    // Should see sign in option
    const signInButton = page.getByRole("button", { name: /sign in/i });
    await expect(signInButton).toBeVisible();
  });

  test("can sign in with email/password", async ({ page }) => {
    await page.goto("/");

    // Click sign in
    await page.getByRole("button", { name: /sign in/i }).click();

    // Fill credentials
    await page.fill('input[name="email"]', testData.user.email);
    await page.fill('input[name="password"]', testData.user.password);
    await page.click('button[type="submit"]');

    // Should be redirected and see user menu
    await expect(page.getByTestId("user-menu")).toBeVisible();
  });
});

userTest.describe("Authenticated User @smoke", () => {
  userTest("session persists on reload", async ({ page }) => {
    await page.goto("/");

    // Should be authenticated
    await expect(page.getByTestId("user-menu")).toBeVisible();

    // Reload
    await page.reload();

    // Still authenticated
    await expect(page.getByTestId("user-menu")).toBeVisible();
  });

  userTest("can sign out", async ({ page }) => {
    await page.goto("/");

    // Open user menu and sign out
    await page.getByTestId("user-menu").click();
    await page.getByRole("button", { name: /sign out/i }).click();

    // Should see sign in button again
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});
```

**Step 2: Verify test file is discovered**

Run: `pnpm -F @gmacko/nextjs exec playwright test --list --grep @smoke`
Expected: Lists auth.smoke.spec.ts tests

**Step 3: Commit**

```bash
git add apps/nextjs/e2e/specs/
git commit -m "test(e2e): add auth smoke tests"
```

---

### Task 2.4: Write smoke tests for settings

**Files:**

- Create: `apps/nextjs/e2e/specs/smoke/settings.smoke.spec.ts`

**Step 1: Write settings smoke tests**

Create `apps/nextjs/e2e/specs/smoke/settings.smoke.spec.ts`:

```typescript
import { expect, userTest } from "../../fixtures/test";

userTest.describe("Settings @smoke", () => {
  userTest("can access settings page", async ({ page }) => {
    await page.goto("/settings");

    // Should see settings page
    await expect(
      page.getByRole("heading", { name: /settings/i }),
    ).toBeVisible();
  });

  userTest("can update preferences", async ({ page }) => {
    await page.goto("/settings");

    // Find a preference toggle/select and change it
    const themeSelect = page.getByLabel(/theme/i);
    if (await themeSelect.isVisible()) {
      await themeSelect.selectOption("dark");

      // Save
      await page.getByRole("button", { name: /save/i }).click();

      // Should see success message
      await expect(page.getByText(/saved/i)).toBeVisible();
    }
  });
});
```

**Step 2: Commit**

```bash
git add apps/nextjs/e2e/specs/smoke/settings.smoke.spec.ts
git commit -m "test(e2e): add settings smoke tests"
```

---

### Task 2.5: Write smoke tests for API keys

**Files:**

- Create: `apps/nextjs/e2e/specs/smoke/api-keys.smoke.spec.ts`

**Step 1: Write API keys smoke tests**

Create `apps/nextjs/e2e/specs/smoke/api-keys.smoke.spec.ts`:

```typescript
import { expect, userTest } from "../../fixtures/test";
import { testData } from "../../utils/test-data";

userTest.describe("API Keys @smoke", () => {
  userTest("can create an API key", async ({ page }) => {
    await page.goto("/settings");

    // Navigate to API keys section
    await page.getByRole("tab", { name: /api keys/i }).click();

    // Create new key
    await page.getByRole("button", { name: /create/i }).click();
    await page.fill('input[name="name"]', testData.apiKey.name);
    await page.getByRole("button", { name: /generate/i }).click();

    // Should see the key (shown once)
    await expect(page.getByText(/gmk_/)).toBeVisible();

    // Key should appear in list
    await expect(page.getByText(testData.apiKey.name)).toBeVisible();
  });

  userTest("can revoke an API key", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("tab", { name: /api keys/i }).click();

    // Find a key and revoke it
    const keyRow = page.getByTestId("api-key-item").first();
    await keyRow.getByRole("button", { name: /revoke/i }).click();

    // Confirm
    await page.getByRole("button", { name: /confirm/i }).click();

    // Should see revoked status or key removed
    await expect(keyRow.getByText(/revoked/i)).toBeVisible();
  });
});
```

**Step 2: Commit**

```bash
git add apps/nextjs/e2e/specs/smoke/api-keys.smoke.spec.ts
git commit -m "test(e2e): add API keys smoke tests"
```

---

### Task 2.6: Write smoke tests for admin panel

**Files:**

- Create: `apps/nextjs/e2e/specs/smoke/admin.smoke.spec.ts`

**Step 1: Write admin smoke tests**

Create `apps/nextjs/e2e/specs/smoke/admin.smoke.spec.ts`:

```typescript
import { adminTest, expect } from "../../fixtures/test";

adminTest.describe("Admin Panel @smoke", () => {
  adminTest("can access admin panel", async ({ page }) => {
    await page.goto("/admin");

    // Should see admin page
    await expect(page.getByRole("heading", { name: /admin/i })).toBeVisible();
  });

  adminTest("can view user list", async ({ page }) => {
    await page.goto("/admin/users");

    // Should see user list
    await expect(page.getByTestId("admin-user-list")).toBeVisible();

    // Should see seeded users
    await expect(page.getByText(/alice/i)).toBeVisible();
  });

  adminTest("can update user role", async ({ page }) => {
    await page.goto("/admin/users");

    // Find a non-admin user
    const userRow = page
      .getByTestId("admin-user-row")
      .filter({ hasText: /alice/i });

    // Change role
    await userRow
      .getByRole("combobox", { name: /role/i })
      .selectOption("moderator");

    // Should see confirmation
    await expect(page.getByText(/updated/i)).toBeVisible();
  });
});
```

**Step 2: Commit**

```bash
git add apps/nextjs/e2e/specs/smoke/admin.smoke.spec.ts
git commit -m "test(e2e): add admin panel smoke tests"
```

---

## Phase 3: Neon Branch Integration

### Task 3.1: Create Neon branch scripts

**Files:**

- Create: `scripts/neon/create-branch.ts`
- Create: `scripts/neon/delete-branch.ts`
- Modify: `package.json` (root)

**Step 1: Create branch creation script**

Create `scripts/neon/create-branch.ts`:

```typescript
#!/usr/bin/env npx tsx
/**
 * Creates a Neon branch for E2E testing
 * Usage: npx tsx scripts/neon/create-branch.ts [branch-name]
 */
import { execSync } from "child_process";

const projectId = process.env.NEON_PROJECT_ID;
const parentBranch = process.env.NEON_E2E_BASE_BRANCH ?? "e2e-base";
const branchName = process.argv[2] ?? `e2e-${Date.now()}`;

if (!projectId) {
  console.error("NEON_PROJECT_ID is required");
  process.exit(1);
}

console.log(`Creating Neon branch: ${branchName} from ${parentBranch}`);

try {
  const result = execSync(
    `neonctl branches create \
      --project-id ${projectId} \
      --name ${branchName} \
      --parent ${parentBranch} \
      --output json`,
    { encoding: "utf-8" },
  );

  const branch = JSON.parse(result);
  const connectionString = execSync(
    `neonctl connection-string ${branchName} --project-id ${projectId} --pooled`,
    { encoding: "utf-8" },
  ).trim();

  console.log(`Branch created: ${branch.name}`);
  console.log(`DATABASE_URL=${connectionString}`);

  // Write to .env.e2e.local for convenience
  const fs = require("fs");
  fs.writeFileSync(".env.e2e.local", `DATABASE_URL="${connectionString}"\n`);
  console.log("Written to .env.e2e.local");
} catch (error) {
  console.error("Failed to create branch:", error);
  process.exit(1);
}
```

**Step 2: Create branch deletion script**

Create `scripts/neon/delete-branch.ts`:

```typescript
#!/usr/bin/env npx tsx
/**
 * Deletes a Neon branch
 * Usage: npx tsx scripts/neon/delete-branch.ts <branch-name>
 */
import { execSync } from "child_process";

const projectId = process.env.NEON_PROJECT_ID;
const branchName = process.argv[2];

if (!projectId) {
  console.error("NEON_PROJECT_ID is required");
  process.exit(1);
}

if (!branchName) {
  console.error("Branch name is required");
  process.exit(1);
}

console.log(`Deleting Neon branch: ${branchName}`);

try {
  execSync(`neonctl branches delete ${branchName} --project-id ${projectId}`, {
    stdio: "inherit",
  });
  console.log("Branch deleted");
} catch (error) {
  console.error("Failed to delete branch:", error);
  process.exit(1);
}
```

**Step 3: Add scripts to root package.json**

Add to root `package.json` scripts:

```json
"neon:create-branch": "tsx scripts/neon/create-branch.ts",
"neon:delete-branch": "tsx scripts/neon/delete-branch.ts"
```

**Step 4: Commit**

```bash
git add scripts/neon/ package.json
git commit -m "feat(scripts): add Neon branch management for E2E tests"
```

---

### Task 3.2: Create seeded e2e-base branch

**Manual step - document in README**

This is a one-time setup step:

```bash
# 1. Create the e2e-base branch in Neon console or CLI
neonctl branches create --project-id $NEON_PROJECT_ID --name e2e-base

# 2. Get the connection string
neonctl connection-string e2e-base --project-id $NEON_PROJECT_ID --pooled

# 3. Run migrations against it
DATABASE_URL="<connection-string>" pnpm db:push

# 4. Seed it
DATABASE_URL="<connection-string>" pnpm db:seed
```

Add this to `docs/plans/2026-01-14-e2e-testing-plan.md` under "Setup Instructions".

---

## Phase 4: GitHub Actions Workflows

### Task 4.1: Update e2e-web workflow with Neon branching

**Files:**

- Modify: `.github/workflows/e2e.yml`

**Step 1: Replace e2e.yml with tiered Neon-backed workflow**

Replace `.github/workflows/e2e.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  e2e-web:
    name: Web E2E (${{ github.event_name == 'pull_request' && 'Smoke' || 'Full' }})
    runs-on: ubuntu-latest
    timeout-minutes: 20

    env:
      E2E_TESTING: "1"
      E2E_TIER: ${{ github.event_name == 'pull_request' && 'smoke' || 'full' }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: ".nvmrc"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

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

      - name: Install Playwright browsers
        run: pnpm -F @gmacko/nextjs exec playwright install --with-deps chromium

      - name: Build application
        run: pnpm -F @gmacko/nextjs build
        env:
          AUTH_SECRET: ${{ secrets.AUTH_SECRET }}
          AUTH_DISCORD_ID: ${{ secrets.AUTH_DISCORD_ID }}
          AUTH_DISCORD_SECRET: ${{ secrets.AUTH_DISCORD_SECRET }}

      - name: Run E2E tests
        run: pnpm -F @gmacko/nextjs e2e
        env:
          AUTH_SECRET: ${{ secrets.AUTH_SECRET }}
          AUTH_DISCORD_ID: ${{ secrets.AUTH_DISCORD_ID }}
          AUTH_DISCORD_SECRET: ${{ secrets.AUTH_DISCORD_SECRET }}

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ github.run_id }}
          path: |
            apps/nextjs/playwright-report
            apps/nextjs/test-results
          retention-days: 7

      - name: Delete Neon branch
        if: always()
        uses: neondatabase/delete-branch-action@v3
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          api_key: ${{ secrets.NEON_API_KEY }}
          branch: ${{ steps.neon.outputs.branch_name }}

  e2e-mobile:
    name: Mobile E2E (Maestro Cloud)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    # Only run on main or when labeled
    if: github.event_name == 'push' || contains(github.event.pull_request.labels.*.name, 'run-mobile-e2e')

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run Maestro Cloud
        uses: mobile-dev-inc/action-maestro-cloud@v1
        with:
          api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
          app-file: apps/expo
          workspace: apps/expo/.maestro
        env:
          APP_ID: ${{ vars.EXPO_APP_ID }}
          API_URL: ${{ secrets.E2E_API_URL }}
          E2E_TESTING: "1"
```

**Step 2: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "feat(ci): add Neon branching and tiered E2E tests

- Smoke tests on PR (chromium only, <2min)
- Full tests on main (all browsers)
- Ephemeral Neon branch per run
- Maestro Cloud for mobile"
```

---

## Phase 5: Add data-testid attributes to UI

### Task 5.1: Add testids to key UI components

**Files:**

- Modify: Various UI components in `apps/nextjs/src/`

**Step 1: Add testids to auth-related elements**

This will vary based on your actual components. Key places:

```tsx
// User menu button
<Button data-testid="user-menu">...</Button>

// Sign in button
<Button data-testid="sign-in-button">Sign In</Button>

// Sign out button
<Button data-testid="sign-out-button">Sign Out</Button>
```

**Step 2: Add testids to settings page**

```tsx
// Settings form
<form data-testid="settings-form">...</form>
```

**Step 3: Add testids to API keys section**

```tsx
// API key list
<div data-testid="api-key-list">...</div>

// Individual key item
<div data-testid="api-key-item">...</div>
```

**Step 4: Add testids to admin panel**

```tsx
// User list
<table data-testid="admin-user-list">...</table>

// User row
<tr data-testid="admin-user-row">...</tr>
```

**Step 5: Commit**

```bash
git add apps/nextjs/src/
git commit -m "feat(ui): add data-testid attributes for E2E tests"
```

---

## Phase 6: Documentation & Cleanup

### Task 6.1: Add E2E README

**Files:**

- Create: `apps/nextjs/e2e/README.md`

**Step 1: Create E2E documentation**

Create `apps/nextjs/e2e/README.md`:

````markdown
# E2E Tests (Playwright)

## Quick Start

```bash
# Run smoke tests (fast, chromium only)
pnpm -F @gmacko/nextjs e2e

# Run full suite (all browsers)
E2E_TIER=full pnpm -F @gmacko/nextjs e2e

# UI mode (interactive)
pnpm -F @gmacko/nextjs e2e:ui

# Headed mode (see browser)
pnpm -F @gmacko/nextjs e2e:headed
```
````

## Prerequisites

1. Set `E2E_TESTING=1` in your `.env`
2. Ensure database is seeded: `pnpm db:seed`
3. Start the dev server: `pnpm -F @gmacko/nextjs dev`

## Test Organization

- `specs/smoke/` - Critical path tests, run on every PR (<2 min)
- `specs/full/` - Comprehensive tests, run on main branch merges
- Tag tests with `@smoke` in the title for tiering

## Auth

Tests use pre-authenticated storageState files:

- `e2e/.auth/user.json` - Regular user
- `e2e/.auth/admin.json` - Admin user

Use fixtures: `userTest`, `adminTest` from `fixtures/test.ts`

## CI

- PRs: Smoke tests only (chromium)
- Main: Full test suite (all browsers)
- Each run gets an isolated Neon database branch

````

**Step 2: Commit**

```bash
git add apps/nextjs/e2e/README.md
git commit -m "docs(e2e): add Playwright E2E documentation"
````

---

### Task 6.2: Update root package.json scripts

**Files:**

- Modify: `package.json` (root)

**Step 1: Add convenient E2E scripts**

Add to root `package.json` scripts:

```json
"e2e:web": "pnpm -F @gmacko/nextjs e2e",
"e2e:web:ui": "pnpm -F @gmacko/nextjs e2e:ui",
"e2e:mobile": "pnpm -F @gmacko/expo e2e"
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add root E2E convenience scripts"
```

---

## Verification Checklist

After completing all tasks:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes
- [ ] `E2E_TESTING=1 pnpm e2e:web` runs locally (with seeded DB)
- [ ] GitHub Actions workflow runs on PR
- [ ] Neon branch is created and deleted in CI

---

## Summary

| Phase                        | Tasks   | Estimated Time |
| ---------------------------- | ------- | -------------- |
| 1. Test Auth                 | 1.1-1.2 | 30 min         |
| 2. Playwright Infrastructure | 2.1-2.6 | 1 hour         |
| 3. Neon Integration          | 3.1-3.2 | 30 min         |
| 4. GitHub Actions            | 4.1     | 20 min         |
| 5. UI Testids                | 5.1     | 30 min         |
| 6. Documentation             | 6.1-6.2 | 15 min         |

**Total: ~3 hours**
