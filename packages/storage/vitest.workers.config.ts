import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Workers suite: the bucket operations and the two handlers against a real
 * R2 binding on workerd (Miniflare's R2), not a fake.
 *
 * A hand-written double would agree with whatever `createStorage` does, which
 * is precisely what needs checking: R2's 5 MiB floor on every multipart part
 * but the last, `list`'s cursor, and the fact that a prefixed key is a
 * different key. `r2Buckets: ["BUCKET"]` is what makes `env.BUCKET` real, and
 * the binding name mirrors apps/web/wrangler.jsonc.
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
        r2Buckets: ["BUCKET"],
      },
    }),
  ],
  test: {
    include: ["src/**/*.workers.test.ts"],
  },
});
