/**
 * better-auth's tables (1.7.2), hand-maintained on top of `auth generate`:
 * `pnpm -F @gmacko/auth generate` writes the CLI's version here; reconcile it
 * against this file rather than committing it verbatim. Deliberate
 * differences from the generated output:
 *   - column helpers (`bool`, `timestampMs`) instead of inline `integer(...)`;
 *   - `role` is NOT NULL DEFAULT 'user' (the CLI emits it nullable);
 *   - no DB-side `unixepoch()` defaults / `$onUpdate`: better-auth sets
 *     createdAt/updatedAt itself on every write;
 *   - relations live in relations.ts (drizzle v2 `defineRelations`), not the
 *     v1 `relations()` blocks the CLI appends.
 * Everything else (columns, NOT NULLs, indexes) must match the CLI output.
 */
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { bool, timestampMs } from "./columns";

export const userRoleEnum = ["user", "admin"] as const;
export type UserRole = (typeof userRoleEnum)[number];

export const user = sqliteTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: bool("email_verified").notNull().default(false),
  image: text(),
  role: text().$type<UserRole>().notNull().default("user"),
  createdAt: timestampMs("created_at").notNull(),
  updatedAt: timestampMs("updated_at").notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: timestampMs("expires_at").notNull(),
    token: text().notNull().unique(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text().primaryKey(),
    /** OAuth issuer (1.7+): with `accountId` it is the provider-side identity key. */
    issuer: text().notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestampMs("access_token_expires_at"),
    refreshTokenExpiresAt: timestampMs("refresh_token_expires_at"),
    scope: text(),
    password: text(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("account_issuer_accountId_uidx").on(
      table.issuer,
      table.accountId,
    ),
    index("account_userId_idx").on(table.userId),
  ],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);
