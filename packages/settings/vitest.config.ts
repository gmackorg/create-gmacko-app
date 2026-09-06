import { defineConfig } from "vitest/config";

/** Pure schema tests: no database, no emulate; nothing here needs a service. */
export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["**/*.d.ts", "**/*.test.ts", "**/index.ts"],
    },
  },
});
