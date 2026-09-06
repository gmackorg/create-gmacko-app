import { defineConfig } from "drizzle-kit";

/**
 * `generate` needs only the schema. The D1 HTTP credentials are read for
 * `studio` / `push` against a remote database and may be left unset.
 */
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  // schema.ts re-exports auth-schema.ts; listing both would duplicate tables.
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID ?? "",
    token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
  },
});
