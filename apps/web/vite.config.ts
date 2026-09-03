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
      if (this.environment.name !== "ssr") return null;
      return shims[source] ?? null;
    },
  };
};

export default defineConfig({
  server: {
    port: 3001,
  },
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    workerShims(),
    // Runs the "ssr" environment (TanStack Start's server build) inside
    // workerd, using wrangler.jsonc for the entry, bindings and compat flags.
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
  ],
});
