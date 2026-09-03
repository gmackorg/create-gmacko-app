import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import tsConfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Workers suite: the Worker entry's wrapper (`make-worker.ts`: Sentry's
 * `withSentry` around `fetch`/`scheduled`, the telemetry flush on
 * `waitUntil`) on workerd, where the SDK's isolation scope and the
 * `ExecutionContext` are the real thing.
 *
 * The Miniflare options are inline, not `wrangler: { configPath }`:
 * pool-workers would otherwise take wrangler.jsonc's `main` (the TanStack
 * Start server entry, which only the Cloudflare Vite plugin can build) as
 * the test worker. Keep the compatibility date in step with packages/db's
 * vitest.workers.config.ts (the pool's workerd caps it).
 */
export default defineConfig({
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-08-22",
        compatibilityFlags: ["nodejs_compat"],
        bindings: { STAGE: "development" },
      },
    }),
  ],
  test: {
    include: ["src/**/*.workers.test.ts"],
  },
});
