/**
 * @fileoverview better-auth CLI configuration (schema generation only).
 *
 * Consumed by `pnpm -F @gmacko/auth generate`, i.e.
 * `pnpx auth@1.7.2 generate --config script/auth-cli.ts --output ../db/.cache/auth-schema.generated.ts`
 * (the committed `packages/db/src/auth-schema.ts` is reconciled by hand).
 * The CLI evaluates this module and reads the adapter's schema; no query is
 * ever issued, so the D1 binding is a placeholder.
 *
 * DO NOT import this from application code.
 */
import type { D1Database } from "@cloudflare/workers-types";
import { relations } from "@gmacko/db";
import { drizzle } from "drizzle-orm/d1";

import { logMagicLink, makeAuth } from "../src/index";

export const auth = makeAuth(
  {
    baseUrl: "http://localhost:3001",
    productionUrl: "http://localhost:3001",
    secret: "cli-only-secret",
    allowedOrigins: ["http://localhost:3001"],
    github: { clientId: "cli", clientSecret: "cli" },
    google: { clientId: "cli", clientSecret: "cli" },
    apple: { clientId: "cli", clientSecret: "cli" },
    magicLink: { send: logMagicLink },
  },
  drizzle({} as D1Database, { relations }),
);
