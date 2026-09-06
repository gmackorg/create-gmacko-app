import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

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

/**
 * One row per (rate-limit scope, caller, fixed window): the global counter
 * behind sign-up and magic-link send. Cloudflare's Rate Limiting bindings
 * count per colo, which is the right trade for the read-mostly API scopes but
 * not for the two endpoints that create accounts and send mail, so those go
 * through D1 instead.
 *
 * `key` is `<scope>:<client>:<window start ms>`, so a new window is a new row
 * rather than a reset, and the nightly Cron tick deletes everything past
 * `expires_at` (`Jobs.pruneRateLimitWindows`). It has no row model in
 * @gmacko/domain on purpose: it is infrastructure, never part of the contract.
 */
export const rateLimitWindow = sqliteTable(
  "rate_limit_window",
  {
    key: text().primaryKey(),
    scope: text().notNull(),
    count: integer().notNull().default(0),
    expiresAt: timestampMs("expires_at").notNull(),
  },
  (table) => [index("rate_limit_window_expires_at_idx").on(table.expiresAt)],
);

/**
 * One row per Stripe webhook event id: the idempotency ledger behind
 * `POST /api/webhooks/stripe`. Stripe delivers at least once — "Occasionally,
 * the same event is sent more than once" — so an endpoint with side effects
 * has to dedupe on `event.id` or apply them twice.
 *
 * Two columns, not one, because a lost response is not a lost write. A
 * delivery *claims* the event (guarded insert), runs its effect, then marks
 * `completed_at`. A redelivery that finds `completed_at` set is a true
 * duplicate and does nothing; one that finds it NULL is retrying a claim
 * whose effect provably never finished, and runs it. Claim-and-forget (a
 * single column) turns "the response was lost" into "the effect is lost
 * forever", which is what apps/web/fault/stripe-webhook.fault.ts checks.
 *
 * Like `rate_limit_window` this is infrastructure: no row model in
 * @gmacko/domain, never part of the contract. The nightly Cron tick is the
 * right place to prune rows older than Stripe's retry window.
 */
export const stripeWebhookEvent = sqliteTable(
  "stripe_webhook_event",
  {
    /** Stripe's own `evt_...` id; the dedupe key, so it is the primary key. */
    eventId: text("event_id").primaryKey(),
    type: text().notNull(),
    receivedAt: timestampMs("received_at").notNull(),
    /** Set once the delivery's side effect finished; NULL while in flight. */
    completedAt: timestampMs("completed_at"),
  },
  (table) => [
    index("stripe_webhook_event_received_at_idx").on(table.receivedAt),
  ],
);

export * from "./auth-schema";
