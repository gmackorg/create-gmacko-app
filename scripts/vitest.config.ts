import { defineConfig } from "vitest/config";

/** Root-level scripts (`scripts/*.mjs`) exercised against fixture trees. */
export default defineConfig({
  test: {
    include: ["scripts/__tests__/*.test.ts"],
  },
});
