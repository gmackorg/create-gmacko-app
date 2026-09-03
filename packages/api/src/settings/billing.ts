/**
 * `Billing`: the read model behind `GET /api/billing`, ported from the
 * legacy `getBillingOverview`: the current workspace's plan (subscription's
 * → default → cheapest), every plan, the subscription summary, and the
 * usage meters with the latest rollup per meter matched to the plan's
 * limits. Visibility comes from the feature switches; the model is computed
 * either way, as before.
 */
import type { RequestContextShape } from "@gmacko/auth/request-context";
import { Database, type DatabaseError } from "@gmacko/db";
import {
  billingPlan,
  billingPlanLimit,
  usageMeter,
  workspace,
  workspaceSubscription,
  workspaceUsageRollup,
} from "@gmacko/db/schema";
import { BillingOverview, type BillingPlanId } from "@gmacko/domain/settings";
import { asc, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { AppConfig } from "../config";

export interface BillingShape {
  readonly overview: (
    userId: string,
    request: RequestContextShape,
  ) => Effect.Effect<BillingOverview, DatabaseError>;
}

/** The UTC calendar month around `now`. */
export const defaultUsagePeriod = (now = new Date()) => ({
  periodStart: new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  ),
  periodEnd: new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  ),
});

export class Billing extends Context.Service<Billing, BillingShape>()(
  "@gmacko/api/Billing",
) {
  static layer: Layer.Layer<Billing, never, Database | AppConfig> =
    Layer.effect(Billing)(
      Effect.gen(function* () {
        const config = yield* AppConfig;
        const { db } = yield* Database;
        const { stripe } = config.features;

        const empty = new BillingOverview({
          billing: {
            customerPortalAvailable: false,
            plan: null,
            plans: [],
            providerConfigured: stripe,
            subscription: null,
            visible: false,
          },
          usage: {
            currentPeriodEnd: null,
            currentPeriodStart: null,
            limits: [],
            meters: [],
            visible: false,
          },
        });

        return Billing.of({
          overview: (userId, request) =>
            Effect.gen(function* () {
              const scope = yield* request.workspace(userId);
              if (scope === null) return empty;
              const [current] = yield* db
                .select({ id: workspace.id })
                .from(workspace)
                .where(eq(workspace.id, scope.workspaceId))
                .limit(1);
              if (current === undefined) return empty;
              const workspaceId = current.id;

              const [plans, [subscription], meters, rollups] =
                yield* Effect.all([
                  db
                    .select()
                    .from(billingPlan)
                    .orderBy(
                      asc(billingPlan.amountInCents),
                      asc(billingPlan.name),
                    ),
                  db
                    .select()
                    .from(workspaceSubscription)
                    .where(eq(workspaceSubscription.workspaceId, workspaceId))
                    .limit(1),
                  db
                    .select()
                    .from(usageMeter)
                    .orderBy(asc(usageMeter.name), asc(usageMeter.key)),
                  db
                    .select()
                    .from(workspaceUsageRollup)
                    .where(eq(workspaceUsageRollup.workspaceId, workspaceId))
                    .orderBy(
                      desc(workspaceUsageRollup.periodEnd),
                      desc(workspaceUsageRollup.createdAt),
                    ),
                ]);

              const currentPlan =
                (subscription?.planId
                  ? plans.find((plan) => plan.id === subscription.planId)
                  : undefined) ??
                plans.find((plan) => plan.isDefault) ??
                plans[0] ??
                null;

              const limits =
                currentPlan === null
                  ? []
                  : yield* db
                      .select()
                      .from(billingPlanLimit)
                      .where(eq(billingPlanLimit.planId, currentPlan.id))
                      .orderBy(asc(billingPlanLimit.key));

              // Rollups arrive latest-period first; the first per meter wins.
              const latestByMeter = new Map<string, (typeof rollups)[number]>();
              for (const rollup of rollups) {
                if (!latestByMeter.has(rollup.meterId)) {
                  latestByMeter.set(rollup.meterId, rollup);
                }
              }

              const fallback = defaultUsagePeriod();
              const periodStart =
                subscription?.currentPeriodStart ?? fallback.periodStart;
              const periodEnd =
                subscription?.currentPeriodEnd ?? fallback.periodEnd;

              return new BillingOverview({
                billing: {
                  customerPortalAvailable:
                    stripe && Boolean(subscription?.stripeCustomerId),
                  plan:
                    currentPlan === null
                      ? null
                      : {
                          amountInCents: currentPlan.amountInCents,
                          currency: currentPlan.currency,
                          description: currentPlan.description,
                          id: currentPlan.id as BillingPlanId,
                          interval: currentPlan.interval,
                          key: currentPlan.key,
                          name: currentPlan.name,
                        },
                  plans: plans.map((plan) => ({
                    amountInCents: plan.amountInCents,
                    currency: plan.currency,
                    id: plan.id as BillingPlanId,
                    interval: plan.interval,
                    isDefault: plan.isDefault,
                    key: plan.key,
                    name: plan.name,
                  })),
                  providerConfigured: stripe,
                  subscription:
                    subscription === undefined
                      ? null
                      : {
                          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                          currentPeriodEnd: subscription.currentPeriodEnd,
                          currentPeriodStart: subscription.currentPeriodStart,
                          provider: subscription.provider,
                          status: subscription.status,
                        },
                  visible: config.features.billing,
                },
                usage: {
                  currentPeriodEnd: periodEnd,
                  currentPeriodStart: periodStart,
                  limits: limits.map((limit) => {
                    const meter = meters.find((m) => m.key === limit.key);
                    const currentUsage =
                      meter === undefined
                        ? 0
                        : (latestByMeter.get(meter.id)?.quantity ?? 0);
                    return {
                      currentUsage,
                      key: limit.key,
                      period: limit.period,
                      value: limit.value,
                    };
                  }),
                  meters: meters.map((meter) => {
                    const latest = latestByMeter.get(meter.id);
                    return {
                      aggregation: meter.aggregation,
                      currentUsage: latest?.quantity ?? 0,
                      key: meter.key,
                      latestPeriodEnd: latest?.periodEnd ?? periodEnd,
                      latestPeriodStart: latest?.periodStart ?? periodStart,
                      name: meter.name,
                      unit: meter.unit,
                    };
                  }),
                  visible: config.features.billing || config.features.metering,
                },
              });
            }),
        });
      }),
    );
}
