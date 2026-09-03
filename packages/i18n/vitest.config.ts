import { defineConfig } from "vitest/config";

/** Node suite; the web hooks render through react-dom/server. */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
