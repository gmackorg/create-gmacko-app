import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    globalSetup: ["test/emulate-setup.ts"],
    include: ["test/*.test.ts"],
    env: {
      DATABASE_URL: "postgresql://localhost:5432/gmacko_dev",
      REDIS_URL: "redis://localhost:6379",
    },
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
