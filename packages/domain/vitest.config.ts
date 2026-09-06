import { defineConfig } from "vitest/config";

/** Node suite: the contract is pure data, so no platform layer is needed. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
