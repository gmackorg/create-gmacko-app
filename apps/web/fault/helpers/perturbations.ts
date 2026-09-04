/**
 * Perturbations this repo declares itself, rather than importing.
 *
 * `@gmacko/cloudfault/adapter-sdk/capabilities` exports `webhookFaults()`,
 * whose `webhook-duplicate` record is byte-identical to the one below — same
 * id, same phase, same outcomes. The lane declares its own anyway because the
 * shipped set does not fit this workload: it has no two-extra-copies variant,
 * and its `webhook-delay` and `webhook-reorder` records only mean something
 * for a workload with more than one event, which this one is not. A `Fault`
 * is a data record, not code, so the cost of declaring it is a literal.
 * Keeping the ids identical is what matters: a minimal failure set from this
 * repo reads the same as one from any other CloudFault project.
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
 * D1 write faults, selected by *target only*.
 *
 * CloudFault's `d1CommitThenTimeout(target, operation)` defaults to `d1.run`,
 * and this stack issues neither `run` nor `all`: drizzle's Effect driver
 * executes through `@effect/sql`'s `executeValues`, i.e.
 * `prepare(sql).bind(...).raw()`. Pinning the operation name would couple the
 * lane to that detail and — worse — would silently stop activating if the
 * driver changed, leaving the scenario passing for no reason. A target-only
 * selector matches whichever terminal the driver picks; `assertActivated` in
 * explore.ts is the backstop that catches a fault that stops firing anyway.
 *
 * `name` only distinguishes the ids, so a minimal failure set says which
 * write it was talking about.
 */
export interface D1WriteFaults {
  /**
   * The write commits and the caller is told it did not. This is the case
   * unit tests structurally cannot reach.
   */
  readonly commitThenTimeout: Fault;
  /** The write never reaches D1: a definite failure the caller can trust. */
  readonly transientError: Fault;
}

export const d1WriteFaults = (name: string): D1WriteFaults => {
  const base = (
    kind: string,
    description: string,
    extra: Pick<Fault, "phase" | "actualOutcome" | "observedOutcome">,
  ): Fault => ({
    id: `DB:${name}:${kind}`,
    target: "DB",
    kind,
    description,
    category: "cloudflare",
    selector: { target: "DB" },
    ...extra,
  });
  return {
    commitThenTimeout: base(
      "commit-then-timeout",
      `The ${name} write commits but the Worker loses the result`,
      {
        phase: "after-commit-before-response",
        actualOutcome: "committed",
        observedOutcome: "indeterminate",
      },
    ),
    transientError: base(
      "transient-network-error",
      `The ${name} write fails before it commits`,
      {
        phase: "before-commit",
        actualOutcome: "not-committed",
        observedOutcome: "definite-failure",
      },
    ),
  };
};
