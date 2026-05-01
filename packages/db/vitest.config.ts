import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    globalSetup: ["../../test/emulate-setup.ts"],
    env: {
      DATABASE_URL: "postgresql://localhost:5432/gmacko_dev",
      REDIS_URL: "redis://localhost:6379",
    },
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["**/*.d.ts", "**/*.test.ts", "**/index.ts", "**/schema.ts"],
    },
  },
});
