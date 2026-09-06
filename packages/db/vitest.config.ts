import { defineConfig } from "vitest/config";

/** Node suite: the Database service against sqlite-node `:memory:`. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.workers.test.ts"],
  },
});
