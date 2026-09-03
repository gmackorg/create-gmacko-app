import { readFileSync } from "node:fs";

import { cloudflare } from "@cloudflare/vite-plugin";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version?: string };

/**
 * Source maps go to Sentry only when a build has an auth token (CI's
 * release job); a local build neither emits nor uploads them.
 */
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

/** The browser suite keeps its local D1 apart from `.wrangler/state` (e2e/helpers/env.ts). */
const persistState = process.env.E2E_STATE_DIR
  ? { path: process.env.E2E_STATE_DIR }
  : true;

export default defineConfig({
  define: {
    // Telemetry `service.version` and the Sentry release; not npm_package_version.
    __APP_VERSION__: JSON.stringify(version ?? "0.0.0"),
  },
  server: {
    // portless assigns PORT (scripts/dev-portless.mjs); 3001 otherwise.
    port: Number(process.env.PORT ?? 3001),
  },
  build: {
    sourcemap: sentryAuthToken ? "hidden" : false,
  },
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    // Runs the "ssr" environment (TanStack Start's server build) inside
    // workerd, using wrangler.jsonc for the entry, bindings and compat flags.
    cloudflare({ viteEnvironment: { name: "ssr" }, persistState }),
    // Generate routeTree.gen.ts in biome's style so builds never dirty it.
    tanstackStart({ router: { quoteStyle: "double", semicolons: true } }),
    viteReact(),
    tailwindcss(),
    ...(sentryAuthToken
      ? [
          sentryVitePlugin({
            authToken: sentryAuthToken,
            org: process.env.SENTRY_ORG,
            project:
              process.env.SENTRY_PROJECT ?? process.env.SENTRY_PROJECT_WEB,
            release: { name: version ?? "0.0.0" },
            telemetry: false,
            sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
          }),
        ]
      : []),
  ],
});
