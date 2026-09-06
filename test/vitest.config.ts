import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Smoke tests against the service emulators `pnpm dev` starts (no database). */
export default defineConfig({
  test: {
    globals: true,
    globalSetup: [
      fileURLToPath(new URL("./emulate-setup.ts", import.meta.url)),
    ],
    include: ["test/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
