import { defineConfig } from "vitest/config";

/**
 * Node suite: the client against `@gmacko/api`'s in-process `TestApi`
 * (sqlite-node), so every test exercises real decoding, middleware and
 * status mapping. The package itself never imports `node:`.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
