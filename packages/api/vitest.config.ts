import { defineConfig } from "vitest/config";

/**
 * Node suite: every endpoint through the in-process web handler over the
 * sqlite-node `layerTest` (see src/testing.ts). The `*.workers.test.ts`
 * files run against a Miniflare D1 via vitest.workers.config.ts.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.workers.test.ts"],
  },
});
