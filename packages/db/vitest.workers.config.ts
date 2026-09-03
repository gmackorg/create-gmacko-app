import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Workers suite: the same Database tests through `Database.layer(env.DB)`
 * against a Miniflare D1, with the flattened migrations applied in-test via
 * `applyD1Migrations` (`cloudflare:test`).
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    new URL("./migrations", import.meta.url).pathname,
  );
  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          // The workerd bundled with vitest-pool-workers 0.22 tops out at
          // 2026-08-22; wrangler.jsonc's 2026-09-01 would refuse to start.
          // Still past 2026-08-04, so nodejs_compat is on by default too.
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
