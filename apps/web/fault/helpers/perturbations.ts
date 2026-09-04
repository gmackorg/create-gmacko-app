/**
 * Perturbations this repo declares itself, rather than importing.
 *
 * CloudFault ships the same three records as `webhookFaults()` in
 * `@cloudfault/adapter-sdk/capabilities`, but that sub-subpath is not part of
 * the published `@gmacko/cloudfault` surface (which exposes one subpath per
 * internal package). A `Fault` is a data record, not code, so declaring it
 * here costs nothing and keeps the lane off an unpublished specifier. If the
 * package later exports `@gmacko/cloudfault/adapter-sdk/capabilities`, delete
 * this file and import `webhookFaults` instead.
 */
import type { Fault, Perturbation } from "./cloudfault";

const WEBHOOK_TARGET = "stripe";
const WEBHOOK_OPERATION = "webhook.delivery";

const deliveryFault = (
  kind: string,
  description: string,
  /** Total deliveries of one logical event, this fault included. */
  copies: number,
): Fault => ({
  id: `${WEBHOOK_TARGET}:${WEBHOOK_OPERATION}:${kind}`,
  target: WEBHOOK_TARGET,
  operation: WEBHOOK_OPERATION,
  kind,
  phase: "delivery",
  description,
  category: "provider",
  // The provider committed the event and believes it delivered it; the
  // perturbation is in *how* it delivered, not whether the event is real.
  actualOutcome: "committed",
  observedOutcome: "success",
  metadata: { duplicates: copies - 1 },
});

/**
 * Stripe documents webhook delivery as at-least-once: "Occasionally, the same
 * event is sent more than once. We advise you to guard against duplicated
 * event receipts by making your event processing idempotent."
 */
export const webhookDuplicateDelivery: Fault = deliveryFault(
  "webhook-duplicate",
  "Stripe delivers the same event more than once (at-least-once delivery)",
  2,
);

/** Two retries of one event, e.g. after two 5xx acknowledgements. */
export const webhookTripleDelivery: Fault = deliveryFault(
  "webhook-duplicate-x2",
  "Stripe redelivers the same event twice more after failed acknowledgements",
  3,
);

/**
 * How many deliveries of one logical event this scenario makes. Keyed by
 * perturbation id rather than by reading `metadata` back out, so the count is
 * a typed value the scenario owns and not an `unknown` from the record.
 */
const DELIVERY_COPIES = {
  [webhookDuplicateDelivery.id]: 2,
  [webhookTripleDelivery.id]: 3,
} satisfies Record<string, number>;

/** Total deliveries under `active`; 1 when delivery is not perturbed. */
export const deliveryCount = (active: readonly Perturbation[]): number =>
  active.reduce(
    (most, item) => Math.max(most, DELIVERY_COPIES[item.id] ?? 1),
    1,
  );

/**
 * D1 faults for the ledger write, selected by *target only*.
 *
 * CloudFault's `d1CommitThenTimeout(target, operation)` defaults to
 * `d1.run`, and this stack issues neither `run` nor `all`: drizzle's Effect
 * driver executes through `@effect/sql`'s `executeValues`, i.e.
 * `prepare(sql).bind(...).raw()`. Pinning the operation name would couple the
 * lane to that detail and — worse — would silently stop activating if the
 * driver changed, leaving the scenario passing for no reason. A target-only
 * selector matches whichever terminal the driver picks; `assertActivated` in
 * explore.ts is the backstop that catches a fault that stops firing anyway.
 */
const ledgerFault = (
  kind: string,
  description: string,
  extra: Pick<Fault, "phase" | "actualOutcome" | "observedOutcome">,
): Fault => ({
  id: `DB:stripe-webhook-ledger:${kind}`,
  target: "DB",
  kind,
  description,
  category: "cloudflare",
  selector: { target: "DB" },
  ...extra,
});

/**
 * The write commits and the caller is told it did not. This is the case unit
 * tests structurally cannot reach and the reason the ledger has two phases.
 */
export const ledgerCommitThenTimeout: Fault = ledgerFault(
  "commit-then-timeout",
  "The ledger write commits but the Worker loses the result",
  {
    phase: "after-commit-before-response",
    actualOutcome: "committed",
    observedOutcome: "indeterminate",
  },
);

/** The write never reaches D1: a definite failure, and the endpoint must not ack. */
export const ledgerTransientError: Fault = ledgerFault(
  "transient-network-error",
  "The ledger write fails before it commits",
  {
    phase: "before-commit",
    actualOutcome: "not-committed",
    observedOutcome: "definite-failure",
  },
);
