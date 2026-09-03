import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Workers suite: the guarded-write services against a Miniflare D1 through
 * `Database.layer(env.DB)`, with @gmacko/db's flattened migrations applied
 * in-test via `applyD1Migrations` (`cloudflare:test`). Mirrors
 * packages/db/vitest.workers.config.ts; the Miniflare options are inline
 * for the same reason (pool-workers would adopt apps/web's `main`) and
 * MUST BE KEPT IN STEP with apps/web/wrangler.jsonc by hand.
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    new URL("../db/migrations", import.meta.url).pathname,
  );
  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          // See packages/db/vitest.workers.config.ts for why 2026-08-22.
          compatibilityDate: "2026-08-22",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      include: ["src/**/*.workers.test.ts"],
    },
  };
});
