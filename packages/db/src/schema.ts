import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import { user } from "./auth-schema";
import { bool, id, json, timestampMs, timestamps } from "./columns";

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

export const Post = sqliteTable("post", {
  id: id(),
  title: text().notNull(),
  content: text().notNull(),
  ...timestamps(),
});

export const userPreferences = sqliteTable("user_preferences", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  theme: text().notNull().default("system"),
  language: text().notNull().default("en"),
  timezone: text().notNull().default("UTC"),
  emailNotifications: bool("email_notifications").notNull().default(true),
  pushNotifications: bool("push_notifications").notNull().default(true),
  ...timestamps(),
});

export const apiKeys = sqliteTable("api_keys", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text().notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  permissions: json<string[]>("permissions").notNull().default(["read"]),
  lastUsedAt: timestampMs("last_used_at"),
  expiresAt: timestampMs("expires_at"),
  createdAt: timestampMs("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  revokedAt: timestampMs("revoked_at"),
});

export const workspace = sqliteTable("workspace", {
  id: id(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ...timestamps(),
});

export const workspaceMembership = sqliteTable(
  "workspace_membership",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text().$type<WorkspaceRole>().notNull().default("member"),
    ...timestamps(),
  },
  (table) => [
    unique("workspace_membership_workspace_user_unique").on(
      table.workspaceId,
      table.userId,
    ),
  ],
);

export const workspaceInviteAllowlist = sqliteTable(
  "workspace_invite_allowlist",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: text().notNull(),
    role: text().$type<WorkspaceRole>().notNull().default("member"),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (table) => [
    unique("workspace_invite_allowlist_workspace_email_unique").on(
      table.workspaceId,
      table.email,
    ),
  ],
);

export const applicationSettings = sqliteTable("application_settings", {
  id: id(),
  setupCompletedAt: timestampMs("setup_completed_at"),
  setupCompletedByUserId: text("setup_completed_by_user_id").references(
    () => user.id,
    { onDelete: "set null" },
  ),
  initialWorkspaceId: text("initial_workspace_id").references(
    () => workspace.id,
    { onDelete: "set null" },
  ),
  maintenanceMode: bool("maintenance_mode").notNull().default(false),
  signupEnabled: bool("signup_enabled").notNull().default(true),
  announcementMessage: text("announcement_message"),
  announcementTone: text("announcement_tone").notNull().default("info"),
  allowedEmailDomains: json<string[]>("allowed_email_domains")
    .notNull()
    .default([]),
  ...timestamps(),
});

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

export const waitlistEntry = sqliteTable(
  "waitlist_entry",
  {
    id: id(),
    email: text().notNull(),
    source: text().$type<WaitlistSource>().notNull().default("landing"),
    status: text().$type<WaitlistStatus>().notNull().default("pending"),
    message: text(),
    referralCode: text("referral_code"),
    reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestampMs("reviewed_at"),
    ...timestamps(),
  },
  (table) => [
    unique("waitlist_entry_email_source_unique").on(table.email, table.source),
  ],
);

export const billingPlan = sqliteTable("billing_plan", {
  id: id(),
  key: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  interval: text().$type<BillingInterval>().notNull().default("month"),
  amountInCents: integer("amount_in_cents").notNull().default(0),
  currency: text().notNull().default("usd"),
  isDefault: bool("is_default").notNull().default(false),
  active: bool("active").notNull().default(true),
  ...timestamps(),
});

export const billingPlanLimit = sqliteTable(
  "billing_plan_limit",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => billingPlan.id, { onDelete: "cascade" }),
    key: text().notNull(),
    value: integer(),
    period: text().$type<BillingLimitPeriod>().notNull().default("month"),
    ...timestamps(),
  },
  (table) => [
    unique("billing_plan_limit_plan_key_unique").on(table.planId, table.key),
  ],
);

export const workspaceSubscription = sqliteTable(
  "workspace_subscription",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    planId: text("plan_id").references(() => billingPlan.id, {
      onDelete: "set null",
    }),
    status: text()
      .$type<WorkspaceSubscriptionStatus>()
      .notNull()
      .default("free"),
    provider: text().$type<BillingProvider>().notNull().default("manual"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    currentPeriodStart: timestampMs("current_period_start"),
    currentPeriodEnd: timestampMs("current_period_end"),
    cancelAtPeriodEnd: bool("cancel_at_period_end").notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    unique("workspace_subscription_workspace_unique").on(table.workspaceId),
  ],
);

export const usageMeter = sqliteTable("usage_meter", {
  id: id(),
  key: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  aggregation: text().$type<UsageAggregation>().notNull().default("sum"),
  unit: text().notNull().default("count"),
  ...timestamps(),
});

export const workspaceUsageRollup = sqliteTable(
  "workspace_usage_rollup",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    meterId: text("meter_id")
      .notNull()
      .references(() => usageMeter.id, { onDelete: "cascade" }),
    periodStart: timestampMs("period_start").notNull(),
    periodEnd: timestampMs("period_end").notNull(),
    quantity: integer().notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    unique("workspace_usage_rollup_workspace_meter_period_unique").on(
      table.workspaceId,
      table.meterId,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

export * from "./auth-schema";
