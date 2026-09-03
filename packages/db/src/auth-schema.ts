import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import { bool, timestampMs } from "./columns";

export const userRoleEnum = ["user", "admin"] as const;
export type UserRole = (typeof userRoleEnum)[number];

export const user = sqliteTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: bool("email_verified").notNull(),
  image: text(),
  role: text().$type<UserRole>().notNull().default("user"),
  createdAt: timestampMs("created_at").notNull(),
  updatedAt: timestampMs("updated_at").notNull(),
});

export const session = sqliteTable("session", {
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
});

export const account = sqliteTable("account", {
  id: text().primaryKey(),
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
});

export const verification = sqliteTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestampMs("expires_at").notNull(),
  createdAt: timestampMs("created_at"),
  updatedAt: timestampMs("updated_at"),
});
