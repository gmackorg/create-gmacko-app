import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * CloudFault lane: systematic fault injection against the real Worker code
 * on workerd, with a real Miniflare D1 so CloudFault's D1 binding proxy
 * (`createD1FaultProxy`) wraps a genuine `env.DB` rather than a fake.
 *
 * Run it through `fault/run.mjs` (`pnpm test:fault`), not directly: that
 * script is what turns "`@gmacko/cloudfault` does not resolve" into a failure
 * instead of a green run with no scenarios. Search depth comes from
 * `CLOUDFAULT_DEPTH` (default 1).
 *
 * Miniflare options are inline for the same reason as
 * `vitest.workers.config.ts`: `wrangler: { configPath }` would take
 * wrangler.jsonc's `main` (the TanStack Start server entry) as the test
 * worker. Keep the `DB` and `BUCKET` binding names and the compatibility date
 * in step with apps/web/wrangler.jsonc and packages/db/vitest.workers.config.ts
 * by hand.
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    new URL("../../packages/db/migrations", import.meta.url).pathname,
  );
  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: "2026-08-22",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          // The upload scenario wraps this in `createR2FaultProxy`, so it has
          // to be a genuine bucket. Keep the name in step with
          // apps/web/wrangler.jsonc's `r2_buckets`.
          r2Buckets: ["BUCKET"],
          bindings: {
            STAGE: "development",
            TEST_MIGRATIONS: migrations,
            // Search depth, so CI can run a bounded pass on every PR and a
            // deeper one on a schedule without editing a scenario.
            CLOUDFAULT_DEPTH: process.env.CLOUDFAULT_DEPTH ?? "1",
          },
        },
      }),
    ],
    test: {
      include: ["fault/**/*.fault.ts"],
      // An app that has not written its first scenario yet still has a
      // working lane; the scaffolder removes the sample scenario when
      // payments are pruned.
      passWithNoTests: true,
      // A systematic search runs the workload once per scenario; the default
      // 5s is a unit-test budget, not a search budget.
      testTimeout: 120_000,
      hookTimeout: 60_000,
    },
  };
});
