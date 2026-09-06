import { defineConfig, devices } from "@playwright/test";

import { BASE_URL, E2E_PORT, serverEnv } from "./e2e/helpers/env";

/**
 * The browser suite runs the app the way a developer does, `vite dev` on
 * workerd, on its own port and its own local D1 (see e2e/helpers/env.ts),
 * with the Worker's bindings passed in through the process environment.
 * Specs share one database, so they run one at a time.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["html", { open: "never" }],
    ["json", { outputFile: "playwright-report/results.json" }],
    process.env.CI ? ["github"] : ["list"],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm exec vite dev --port ${E2E_PORT} --strictPort`,
    // Liveness only: the database is prepared by global-setup.
    url: `${BASE_URL}/api/health/live`,
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: serverEnv(),
  },
});
