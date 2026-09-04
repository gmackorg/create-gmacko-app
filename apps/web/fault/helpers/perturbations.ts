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
import type { Fault } from "./cloudfault";

const WEBHOOK_TARGET = "stripe";
const WEBHOOK_OPERATION = "webhook.delivery";

const deliveryFault = (
  kind: string,
  description: string,
  metadata: Record<string, unknown>,
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
  metadata,
});

/**
 * Stripe documents webhook delivery as at-least-once: "Occasionally, the same
 * event is sent more than once. We advise you to guard against duplicated
 * event receipts by making your event processing idempotent."
 */
export const webhookDuplicateDelivery: Fault = deliveryFault(
  "webhook-duplicate",
  "Stripe delivers the same event more than once (at-least-once delivery)",
  { duplicates: 1 },
);

/** Two retries of one event, e.g. after two 5xx acknowledgements. */
export const webhookTripleDelivery: Fault = deliveryFault(
  "webhook-duplicate-x2",
  "Stripe redelivers the same event twice more after failed acknowledgements",
  { duplicates: 2 },
);

/** How many extra copies of each event this scenario delivers. */
export const duplicateCount = (active: readonly Fault[]): number =>
  active.reduce((total, item) => {
    const extra = item.metadata?.duplicates;
    return total + (typeof extra === "number" ? extra : 0);
  }, 0);
