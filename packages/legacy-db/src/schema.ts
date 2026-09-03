import { sql } from "drizzle-orm";
import { pgTable, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { user } from "./auth-schema";

export const workspaceRoleEnum = ["owner", "admin", "member"] as const;
export type WorkspaceRole = (typeof workspaceRoleEnum)[number];
export const billingIntervalEnum = ["month", "year"] as const;
export type BillingInterval = (typeof billingIntervalEnum)[number];
export const workspaceSubscriptionStatusEnum = [
  "free",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
] as const;
export type WorkspaceSubscriptionStatus =
  (typeof workspaceSubscriptionStatusEnum)[number];
export const billingProviderEnum = ["manual", "stripe"] as const;
export type BillingProvider = (typeof billingProviderEnum)[number];
export const billingLimitPeriodEnum = ["day", "month", "all_time"] as const;
export type BillingLimitPeriod = (typeof billingLimitPeriodEnum)[number];
export const usageAggregationEnum = ["sum", "max"] as const;
export type UsageAggregation = (typeof usageAggregationEnum)[number];

export const Post = pgTable("post", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  title: t.varchar({ length: 256 }).notNull(),
  content: t.text().notNull(),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const CreatePostSchema = createInsertSchema(Post, {
  title: z.string().max(256),
  content: z.string().max(256),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const userPreferences = pgTable("user_preferences", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t
    .text()
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  theme: t.varchar({ length: 20 }).notNull().default("system"),
  language: t.varchar({ length: 10 }).notNull().default("en"),
  timezone: t.varchar({ length: 50 }).notNull().default("UTC"),
  emailNotifications: t.boolean().notNull().default(true),
  pushNotifications: t.boolean().notNull().default(true),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const apiKeys = pgTable("api_keys", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t
    .text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: t.varchar({ length: 100 }).notNull(),
  keyHash: t.text().notNull(),
  keyPrefix: t.varchar({ length: 12 }).notNull(),
  permissions: t.json().$type<string[]>().notNull().default(["read"]),
  lastUsedAt: t.timestamp({ mode: "date", withTimezone: true }),
  expiresAt: t.timestamp({ mode: "date", withTimezone: true }),
  createdAt: t.timestamp().defaultNow().notNull(),
  revokedAt: t.timestamp({ mode: "date", withTimezone: true }),
}));

export const workspace = pgTable("workspace", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  name: t.varchar({ length: 120 }).notNull(),
  slug: t.varchar({ length: 160 }).notNull().unique(),
  ownerUserId: t
    .text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const workspaceMembership = pgTable(
  "workspace_membership",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    workspaceId: t
      .uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: t.text().$type<WorkspaceRole>().notNull().default("member"),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    unique("workspace_membership_workspace_user_unique").on(
      table.workspaceId,
      table.userId,
    ),
  ],
);

export const workspaceInviteAllowlist = pgTable(
  "workspace_invite_allowlist",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    workspaceId: t
      .uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: t.varchar({ length: 320 }).notNull(),
    role: t.text().$type<WorkspaceRole>().notNull().default("member"),
    invitedByUserId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    unique("workspace_invite_allowlist_workspace_email_unique").on(
      table.workspaceId,
      table.email,
    ),
  ],
);

export const applicationSettings = pgTable("application_settings", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  setupCompletedAt: t.timestamp({ mode: "date", withTimezone: true }),
  setupCompletedByUserId: t
    .text()
    .references(() => user.id, { onDelete: "set null" }),
  initialWorkspaceId: t
    .uuid()
    .references(() => workspace.id, { onDelete: "set null" }),
  maintenanceMode: t.boolean().notNull().default(false),
  signupEnabled: t.boolean().notNull().default(true),
  announcementMessage: t.text(),
  announcementTone: t.varchar({ length: 24 }).notNull().default("info"),
  allowedEmailDomains: t.json().$type<string[]>().notNull().default([]),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const waitlistSourceEnum = [
  "landing",
  "contact",
  "referral",
  "blocked-signup",
] as const;
export type WaitlistSource = (typeof waitlistSourceEnum)[number];

export const waitlistStatusEnum = [
  "pending",
  "contacted",
  "approved",
  "dismissed",
] as const;
export type WaitlistStatus = (typeof waitlistStatusEnum)[number];

export const waitlistEntry = pgTable(
  "waitlist_entry",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    email: t.varchar({ length: 320 }).notNull(),
    source: t.text().$type<WaitlistSource>().notNull().default("landing"),
    status: t.text().$type<WaitlistStatus>().notNull().default("pending"),
    message: t.text(),
    referralCode: t.varchar({ length: 120 }),
    reviewedByUserId: t
      .text()
      .references(() => user.id, { onDelete: "set null" }),
    reviewedAt: t.timestamp({ mode: "date", withTimezone: true }),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    unique("waitlist_entry_email_source_unique").on(table.email, table.source),
  ],
);

export const billingPlan = pgTable("billing_plan", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  key: t.varchar({ length: 64 }).notNull().unique(),
  name: t.varchar({ length: 120 }).notNull(),
  description: t.text(),
  interval: t.text().$type<BillingInterval>().notNull().default("month"),
  amountInCents: t.integer().notNull().default(0),
  currency: t.varchar({ length: 3 }).notNull().default("usd"),
  isDefault: t.boolean().notNull().default(false),
  active: t.boolean().notNull().default(true),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const billingPlanLimit = pgTable(
  "billing_plan_limit",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    planId: t
      .uuid()
      .notNull()
      .references(() => billingPlan.id, { onDelete: "cascade" }),
    key: t.varchar({ length: 80 }).notNull(),
    value: t.integer(),
    period: t.text().$type<BillingLimitPeriod>().notNull().default("month"),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    unique("billing_plan_limit_plan_key_unique").on(table.planId, table.key),
  ],
);

export const workspaceSubscription = pgTable(
  "workspace_subscription",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    workspaceId: t
      .uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    planId: t.uuid().references(() => billingPlan.id, { onDelete: "set null" }),
    status: t
      .text()
      .$type<WorkspaceSubscriptionStatus>()
      .notNull()
      .default("free"),
    provider: t.text().$type<BillingProvider>().notNull().default("manual"),
    stripeCustomerId: t.varchar({ length: 255 }),
    stripeSubscriptionId: t.varchar({ length: 255 }),
    currentPeriodStart: t.timestamp({ mode: "date", withTimezone: true }),
    currentPeriodEnd: t.timestamp({ mode: "date", withTimezone: true }),
    cancelAtPeriodEnd: t.boolean().notNull().default(false),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    unique("workspace_subscription_workspace_unique").on(table.workspaceId),
  ],
);

export const usageMeter = pgTable("usage_meter", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  key: t.varchar({ length: 80 }).notNull().unique(),
  name: t.varchar({ length: 120 }).notNull(),
  description: t.text(),
  aggregation: t.text().$type<UsageAggregation>().notNull().default("sum"),
  unit: t.varchar({ length: 40 }).notNull().default("count"),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const workspaceUsageRollup = pgTable(
  "workspace_usage_rollup",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    workspaceId: t
      .uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    meterId: t
      .uuid()
      .notNull()
      .references(() => usageMeter.id, { onDelete: "cascade" }),
    periodStart: t.timestamp({ mode: "date", withTimezone: true }).notNull(),
    periodEnd: t.timestamp({ mode: "date", withTimezone: true }).notNull(),
    quantity: t.integer().notNull().default(0),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    unique("workspace_usage_rollup_workspace_meter_period_unique").on(
      table.workspaceId,
      table.meterId,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

export const CreateUserPreferencesSchema = createInsertSchema(userPreferences, {
  theme: z.enum(["light", "dark", "system"]).default("system"),
  language: z.string().max(10).default("en"),
  timezone: z.string().max(50).default("UTC"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdateUserPreferencesSchema =
  CreateUserPreferencesSchema.partial().omit({
    userId: true,
  });

export * from "./auth-schema";
