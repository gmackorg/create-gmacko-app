/// <reference types="vite/client" />
/**
 * The browser-visible configuration (`src/env.ts` is client-safe by design and
 * carries no server block): `VITE_*` values Vite inlines at build
 * time, validated once. Nothing server-side lives here; the Worker's
 * bindings are read by `src/server/config.ts` (`AppConfig.fromBindings`)
 * and nothing under `src/` reads `process.env`.
 */
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_POSTHOG_KEY: z.string().optional(),
    VITE_POSTHOG_HOST: z.url().optional(),
    VITE_SENTRY_DSN: z.url().optional(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
