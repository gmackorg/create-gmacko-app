export interface BillingPlanSummary {
  id: string;
  key: string;
  name: string;
  isDefault: boolean;
}

export interface WorkspaceSubscriptionSummary {
  workspaceId: string;
  planId: string | null;
  status:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "incomplete"
    | "free";
}

export interface BillingLimitSummary {
  key: string;
  value: number | null;
}

export interface BillingLimitEvaluation {
  key: string;
  limit: number | null;
  currentUsage: number;
  nextUsage: number;
  remaining: number | null;
  exceededBy: number;
  allowed: boolean;
}

export interface MeterUsageRecord {
  workspaceId: string;
  meterId: string;
  quantity: number;
  occurredAt: Date;
}

export interface MeterUsageRollup {
  workspaceId: string;
  meterId: string;
  periodStart: Date;
  periodEnd: Date;
  quantity: number;
}

export function resolveWorkspacePlan(input: {
  plans: BillingPlanSummary[];
  subscription: WorkspaceSubscriptionSummary | null;
}): BillingPlanSummary | null {
  if (input.subscription?.planId) {
    const subscribedPlan =
      input.plans.find((plan) => plan.id === input.subscription?.planId) ??
      null;

    if (subscribedPlan) {
      return subscribedPlan;
    }
  }

  return input.plans.find((plan) => plan.isDefault) ?? input.plans[0] ?? null;
}

export function evaluateLimit(input: {
  limit: BillingLimitSummary;
  currentUsage: number;
  amount?: number;
}): BillingLimitEvaluation {
  const amount = input.amount ?? 1;
  const nextUsage = input.currentUsage + amount;

  if (input.limit.value === null) {
    return {
      key: input.limit.key,
      limit: null,
      currentUsage: input.currentUsage,
      nextUsage,
      remaining: null,
      exceededBy: 0,
      allowed: true,
    };
  }

  const remaining = Math.max(input.limit.value - nextUsage, 0);
  const exceededBy = Math.max(nextUsage - input.limit.value, 0);

  return {
    key: input.limit.key,
    limit: input.limit.value,
    currentUsage: input.currentUsage,
    nextUsage,
    remaining,
    exceededBy,
    allowed: exceededBy === 0,
  };
}

export function rollupMeterUsage(input: {
  records: MeterUsageRecord[];
  workspaceId: string;
  meterId: string;
  periodStart: Date;
  periodEnd: Date;
}): MeterUsageRollup {
  const quantity = input.records
    .filter(
      (record) =>
        record.workspaceId === input.workspaceId &&
        record.meterId === input.meterId &&
        record.occurredAt >= input.periodStart &&
        record.occurredAt < input.periodEnd,
    )
    .reduce((total, record) => total + record.quantity, 0);

  return {
    workspaceId: input.workspaceId,
    meterId: input.meterId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    quantity,
  };
}
