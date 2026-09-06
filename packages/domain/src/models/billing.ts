import { Schema } from "effect";
import { Model } from "effect/unstable/schema";

import {
  BillingInterval,
  BillingLimitPeriod,
  BillingProvider,
  UsageAggregation,
  WorkspaceSubscriptionStatus,
} from "./enums";
import {
  BillingPlanId,
  BillingPlanLimitId,
  UsageMeterId,
  UsageRollupId,
  WorkspaceId,
  WorkspaceSubscriptionId,
} from "./ids";

/** `billing_plan`. */
export class BillingPlanModel extends Model.Class<BillingPlanModel>(
  "BillingPlanModel",
)({
  id: Model.GeneratedByApp(BillingPlanId),
  key: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  interval: BillingInterval,
  amountInCents: Schema.Int,
  currency: Schema.String,
  isDefault: Schema.Boolean,
  active: Schema.Boolean,
  createdAt: Model.GeneratedByApp(Schema.Date),
  updatedAt: Model.GeneratedByApp(Schema.NullOr(Schema.Date)),
}) {}

/** `billing_plan_limit`. `value` null means unlimited. */
export class BillingPlanLimitModel extends Model.Class<BillingPlanLimitModel>(
  "BillingPlanLimitModel",
)({
  id: Model.GeneratedByApp(BillingPlanLimitId),
  planId: BillingPlanId,
  key: Schema.String,
  value: Schema.NullOr(Schema.Int),
  period: BillingLimitPeriod,
  createdAt: Model.GeneratedByApp(Schema.Date),
  updatedAt: Model.GeneratedByApp(Schema.NullOr(Schema.Date)),
}) {}

/**
 * `workspace_subscription`. The Stripe ids are `Model.Sensitive`, so they are
 * in every database variant and in none of the JSON ones: that is what keeps
 * them server-side while `customerPortalAvailable` is derived from them.
 */
export class WorkspaceSubscriptionModel extends Model.Class<WorkspaceSubscriptionModel>(
  "WorkspaceSubscriptionModel",
)({
  id: Model.GeneratedByApp(WorkspaceSubscriptionId),
  workspaceId: WorkspaceId,
  planId: Schema.NullOr(BillingPlanId),
  status: WorkspaceSubscriptionStatus,
  provider: BillingProvider,
  stripeCustomerId: Model.Sensitive(Schema.NullOr(Schema.String)),
  stripeSubscriptionId: Model.Sensitive(Schema.NullOr(Schema.String)),
  currentPeriodStart: Schema.NullOr(Schema.Date),
  currentPeriodEnd: Schema.NullOr(Schema.Date),
  cancelAtPeriodEnd: Schema.Boolean,
  createdAt: Model.GeneratedByApp(Schema.Date),
  updatedAt: Model.GeneratedByApp(Schema.NullOr(Schema.Date)),
}) {}

/** `usage_meter`. */
export class UsageMeterModel extends Model.Class<UsageMeterModel>(
  "UsageMeterModel",
)({
  id: Model.GeneratedByApp(UsageMeterId),
  key: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  aggregation: UsageAggregation,
  unit: Schema.String,
  createdAt: Model.GeneratedByApp(Schema.Date),
  updatedAt: Model.GeneratedByApp(Schema.NullOr(Schema.Date)),
}) {}

/** `workspace_usage_rollup`. */
export class UsageRollupModel extends Model.Class<UsageRollupModel>(
  "UsageRollupModel",
)({
  id: Model.GeneratedByApp(UsageRollupId),
  workspaceId: WorkspaceId,
  meterId: UsageMeterId,
  periodStart: Schema.Date,
  periodEnd: Schema.Date,
  quantity: Schema.Int,
  createdAt: Model.GeneratedByApp(Schema.Date),
  updatedAt: Model.GeneratedByApp(Schema.NullOr(Schema.Date)),
}) {}
