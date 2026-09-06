import tsConfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Node suite: the HttpApi + in-process transport over the sqlite-node test
 * layers (no workerd, no `cloudflare:workers`).
 */
export default defineConfig({
  plugins: [tsConfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.workers.test.ts"],
  },
});
