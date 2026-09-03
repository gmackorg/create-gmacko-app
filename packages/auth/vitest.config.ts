import { defineConfig } from "vitest/config";

/** Node suite: better-auth over the sqlite-node `Database.layerTest`. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
