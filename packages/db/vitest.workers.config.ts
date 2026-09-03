import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Workers suite: the same Database tests through `Database.layer(env.DB)`
 * against a Miniflare D1, with the flattened migrations applied in-test via
 * `applyD1Migrations` (`cloudflare:test`).
 *
 * The Miniflare options are inline rather than `wrangler: { configPath:
 * "../../apps/web/wrangler.jsonc" }`: pool-workers would also adopt that
 * config's `main` (apps/web's TanStack Start worker entry, which needs the
 * Cloudflare Vite plugin to resolve) as the test worker's entry. So the two
 * MUST BE KEPT IN STEP with apps/web/wrangler.jsonc by hand: the `DB` binding
 * name and, when it moves, the compatibility date (see below).
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    new URL("./migrations", import.meta.url).pathname,
  );
  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          // vitest-pool-workers 0.22.0 pins miniflare 5.20260815.0-alpha,
          // whose workerd (1.20260815.1) supports dates up to 2026-08-22 and
          // refuses wrangler.jsonc's 2026-09-01 ("newest date supported by
          // this server binary is 2026-08-22"). Bump when the pool moves.
          // Still past 2026-08-04, so wrangler's nodejs_compat-on-by-default
          // rule covers production; the pool takes the flag explicitly.
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
