import { SettingsCard, SettingsPanel } from "@gmacko/ui/settings-card";
import { useSuspenseQuery } from "@tanstack/react-query";

import { queries } from "~/lib/api";

function formatMoney(amountInCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountInCents / 100);
}

// UTC, not the runtime's zone: this renders on the Worker (UTC) and again in
// the browser (the viewer's zone), and between UTC midnight and local midnight
// an unpinned formatter prints two different dates and fails hydration.
function formatDate(value: Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

/** The billing and usage panels; each hides itself when its feature is off. */
export function BillingSections() {
  const { data: overview } = useSuspenseQuery(
    queries.settings.billingOverview(),
  );
  const { billing, usage } = overview;

  return (
    <>
      {billing.visible ? (
        <SettingsCard
          title="Billing"
          data-testid="billing"
          description="Billing stays per-workspace in v1. Seat billing is intentionally out of scope for this first pass."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SettingsPanel title="Current plan">
              {billing.plan ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p className="font-medium">{billing.plan.name}</p>
                  <p className="text-muted-foreground">
                    {formatMoney(
                      billing.plan.amountInCents,
                      billing.plan.currency,
                    )}{" "}
                    / {billing.plan.interval}
                  </p>
                  {billing.plan.description ? (
                    <p className="text-muted-foreground">
                      {billing.plan.description}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-muted-foreground mt-2 text-sm">
                  No workspace plan is configured yet.
                </p>
              )}
            </SettingsPanel>

            <SettingsPanel title="Subscription status">
              {billing.subscription ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p className="capitalize">
                    {billing.subscription.status.replaceAll("_", " ")}
                  </p>
                  <p className="text-muted-foreground capitalize">
                    Provider: {billing.subscription.provider}
                  </p>
                  <p className="text-muted-foreground">
                    Current period ends{" "}
                    {formatDate(billing.subscription.currentPeriodEnd)}
                  </p>
                  {billing.subscription.cancelAtPeriodEnd ? (
                    <p className="text-sm text-amber-600">
                      Cancels at period end.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-muted-foreground mt-2 text-sm">
                  No paid subscription is attached yet. The workspace can still
                  run on its default plan.
                </p>
              )}
            </SettingsPanel>
          </div>

          <SettingsPanel>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">Available plans</h3>
              <span className="text-muted-foreground text-sm">
                {billing.plans.length}
              </span>
            </div>
            {billing.plans.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {billing.plans.map((plan) => (
                  <li
                    key={plan.id}
                    className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{plan.name}</p>
                      <p className="text-muted-foreground">
                        {formatMoney(plan.amountInCents, plan.currency)} /{" "}
                        {plan.interval}
                      </p>
                    </div>
                    <span className="text-muted-foreground">
                      {plan.isDefault ? "Default" : "Optional"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground mt-3 text-sm">
                Add plans in the billing primitives before exposing upgrades to
                customers.
              </p>
            )}
            <p className="text-muted-foreground mt-4 text-sm">
              {billing.providerConfigured
                ? billing.customerPortalAvailable
                  ? "Stripe is configured and the customer portal can be layered on next."
                  : "Stripe is configured, but this workspace does not have a customer-portal-ready subscription yet."
                : "Stripe is not configured yet, so billing stays in a read-only scaffold state."}
            </p>
          </SettingsPanel>
        </SettingsCard>
      ) : null}

      {usage.visible ? (
        <SettingsCard
          title="Usage & Limits"
          data-testid="usage"
          description="Limits stay tied to the current workspace plan. Meter rollups are optional and only appear once the product records usage."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SettingsPanel title="Plan limits">
              {usage.limits.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {usage.limits.map((limit) => (
                    <li
                      key={limit.key}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div>
                        <p className="font-medium">{limit.key}</p>
                        <p className="text-muted-foreground capitalize">
                          {limit.period.replaceAll("_", " ")}
                        </p>
                      </div>
                      <p>
                        {limit.currentUsage} /{" "}
                        {limit.value === null ? "Unlimited" : limit.value}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-3 text-sm">
                  No plan limits are configured yet.
                </p>
              )}
            </SettingsPanel>

            <SettingsPanel title="Meters">
              {usage.meters.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {usage.meters.map((meter) => (
                    <li key={meter.key} className="rounded-md border px-3 py-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{meter.name}</p>
                        <p>
                          {meter.currentUsage} {meter.unit}
                        </p>
                      </div>
                      <p className="text-muted-foreground mt-1">
                        {meter.key} • {meter.aggregation}
                      </p>
                      <p className="text-muted-foreground mt-1">
                        Period {formatDate(meter.latestPeriodStart)} -{" "}
                        {formatDate(meter.latestPeriodEnd)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-3 text-sm">
                  No usage meters are configured yet.
                </p>
              )}
            </SettingsPanel>
          </div>
        </SettingsCard>
      ) : null}
    </>
  );
}
