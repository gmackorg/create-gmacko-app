import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * TODO(migration Phase 6): remove once @gmacko/logging and @gmacko/telemetry
 * are rebuilt on Effect and no longer need Node at module scope.
 *
 * Swaps Node-only workspace packages for Worker-safe shims, in the ssr
 * (workerd) environment only. See src/server/shims/*.ts for what each stub
 * covers and why the real package cannot load.
 */
const workerShims = (): Plugin => {
  const shims: Record<string, string> = {
    "@gmacko/logging": fileURLToPath(
      new URL("./src/server/shims/logging.ts", import.meta.url),
    ),
    "@gmacko/telemetry": fileURLToPath(
      new URL("./src/server/shims/telemetry.ts", import.meta.url),
    ),
  };
  return {
    name: "gmacko:worker-shims",
    enforce: "pre",
    resolveId(source) {
      if (this.environment?.name !== "ssr") return null;
      return shims[source] ?? null;
    },
  };
};

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version?: string };

export default defineConfig({
  define: {
    // Telemetry `service.version` and the Sentry release; not npm_package_version.
    __APP_VERSION__: JSON.stringify(version ?? "0.0.0"),
  },
  server: {
    port: 3001,
  },
  environments: {
    ssr: {
      optimizeDeps: {
        // TODO(migration Phase 8): remove with the legacy packages. Vite's dep
        // optimizer keys entries on the bare specifier, so with drizzle-orm
        // 0.45 (legacy Postgres) and 1.0 rc (@gmacko/db) both in the graph,
        // packages/db's `import "drizzle-orm"` was rewritten to the optimized
        // 0.45 copy (no `defineRelations`). Excluded, each importer resolves
        // its own version.
        exclude: ["drizzle-orm"],
      },
    },
  },
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    workerShims(),
    // Runs the "ssr" environment (TanStack Start's server build) inside
    // workerd, using wrangler.jsonc for the entry, bindings and compat flags.
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    // Generate routeTree.gen.ts in biome's style so builds never dirty it.
    tanstackStart({ router: { quoteStyle: "double", semicolons: true } }),
    viteReact(),
    tailwindcss(),
  ],
});
