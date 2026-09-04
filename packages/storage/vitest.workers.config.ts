import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Workers suite: UploadThing's fetch adapter (`uploadthing/server`) on
 * workerd, which is the claim this package makes. No bindings are needed —
 * the point is that the module loads and answers a `Request` in an isolate
 * with no Node built-ins beyond `nodejs_compat`.
 *
 * The Miniflare options are inline and the compatibility date is kept in step
 * with packages/db's workers config (the pool's workerd caps it).
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-08-22",
        compatibilityFlags: ["nodejs_compat"],
      },
    }),
  ],
  test: {
    include: ["src/**/*.workers.test.ts"],
  },
});
