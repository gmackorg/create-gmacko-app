import { authEnv } from "@gmacko/legacy-auth/env";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export const env = createEnv({
  clientPrefix: "VITE_",
  extends: [authEnv()],
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  /**
   * Specify your server-side environment variables schema here.
   * This way you can ensure the app isn't built with invalid env vars.
   */
  server: {
    APP_URL: z.url().optional(),
    PORTLESS_URL: z.string().url().optional(),
    DATABASE_URL: z.url(),
  },

  /**
   * Specify your client-side environment variables schema here.
   * For them to be exposed to the client, prefix them with `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },
  /**
   * Destructure all variables from `process.env` to make sure they aren't tree-shaken away.
   *
   * TODO(migration Phase 5): this and lib/url.ts are the last readers of
   * `process.env` in the Worker. They only work because the `dev` script sets
   * `CLOUDFLARE_INCLUDE_PROCESS_ENV=true`; see apps/web/README.md. Replace
   * with the `AppConfig` service built from `cloudflare:workers` env.
   */
  runtimeEnv: process.env,
  skipValidation:
    !!process.env.CI ||
    ["1", "true"].includes(process.env.SKIP_ENV_VALIDATION ?? "") ||
    process.env.npm_lifecycle_event === "lint",
});
