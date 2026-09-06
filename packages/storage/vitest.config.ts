import { defineConfig } from "vitest/config";

/** Node suite: the guards that run whether or not storage is enabled. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.workers.test.ts"],
  },
});
