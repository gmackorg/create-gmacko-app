import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/__tests__/e2e.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // E2E tests are slow - each test can take 5-15 minutes
    testTimeout: 900000, // 15 minutes
    hookTimeout: 900000, // 15 minutes
    // Run tests sequentially to avoid disk/memory contention
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Set RUN_E2E environment variable
    env: {
      RUN_E2E: "true",
    },
  },
});
