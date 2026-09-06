/**
 * The bindings vitest.fault.config.ts adds for the CloudFault lane only, and
 * the `cloudflare:test` module types (the Workers globals already come from
 * the generated worker-configuration.d.ts). Mirrors
 * packages/api/src/workers-env.d.ts;
 * apps/web's generated worker-configuration.d.ts describes the deployed
 * Worker and must not be hand-edited (`pnpm check:cf-types` pins it).
 */
/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { D1Migration } from "@cloudflare/vitest-pool-workers";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      /** Search depth, from the `CLOUDFAULT_DEPTH` environment variable. */
      CLOUDFAULT_DEPTH?: string;
    }
  }
}
