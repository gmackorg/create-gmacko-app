/**
 * The literal sets a row model constrains a free-text column to. D1 has no
 * enum type, so every one of these columns is `text` and the model is what
 * narrows it; the repositories validate (or fall back) before a row reaches
 * the contract. Re-exported by the group modules that own them.
 */
import { Schema } from "effect";

export const WaitlistSource = Schema.Literals([
  "landing",
  "contact",
  "referral",
  "blocked-signup",
]);
export type WaitlistSource = typeof WaitlistSource.Type;

export const WaitlistStatus = Schema.Literals([
  "pending",
  "contacted",
  "approved",
  "dismissed",
]);
export type WaitlistStatus = typeof WaitlistStatus.Type;

export const BillingInterval = Schema.Literals(["month", "year"]);
export type BillingInterval = typeof BillingInterval.Type;

export const WorkspaceSubscriptionStatus = Schema.Literals([
  "free",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
]);
export type WorkspaceSubscriptionStatus =
  typeof WorkspaceSubscriptionStatus.Type;

export const BillingProvider = Schema.Literals(["manual", "stripe"]);
export type BillingProvider = typeof BillingProvider.Type;

export const BillingLimitPeriod = Schema.Literals(["day", "month", "all_time"]);
export type BillingLimitPeriod = typeof BillingLimitPeriod.Type;

export const UsageAggregation = Schema.Literals(["sum", "max"]);
export type UsageAggregation = typeof UsageAggregation.Type;

/**
 * `application_settings.announcement_tone` is free text in D1; the repository
 * maps or validates the column into this literal set (falling back to `info`)
 * before it reaches `LaunchState`.
 */
export const AnnouncementTone = Schema.Literals([
  "info",
  "warning",
  "critical",
]);
export type AnnouncementTone = typeof AnnouncementTone.Type;

/**
 * `user_preferences.theme` is free text in D1; the repository maps or
 * validates the column into this literal set (falling back to `system`)
 * before it reaches `UserPreferences`.
 */
export const Theme = Schema.Literals(["light", "dark", "system"]);
export type Theme = typeof Theme.Type;
