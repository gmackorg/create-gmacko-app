import { defineConfig } from "vitest/config";

/**
 * Node suite for the React Native-free modules (config validation, the API
 * header provider). Screens are covered by the Maestro flows in .maestro/.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.expo/**"],
  },
});
