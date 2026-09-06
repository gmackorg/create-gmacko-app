/**
 * CloudFault scenario: Stripe webhook delivery.
 *
 * Stripe documents webhook delivery as *at-least-once* — the same event can
 * arrive more than once, and the endpoint is expected to be idempotent. This
 * scenario perturbs delivery (one extra copy, two extra copies) and checks
 * two invariants of `handleStripeWebhook`:
 *
 *   1. `stripe-webhook-effect-at-most-once` — a logical event's side effect
 *      runs at most once, however many times it is delivered.
 *   2. `stripe-webhook-ack-implies-effect` — a 200 means the effect has run;
 *      the endpoint never tells Stripe "handled" for an event it dropped.
 *
 * Unit tests cannot reach either one: they call the handler once. The class
 * of bug here only exists across *deliveries*.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";

// Relative, not `~/`: fault/ sits outside the app tsconfig's include
// (see docs/FAULT_TESTING.md), so the `~/*` path mapping does not reach here.
import { handleStripeWebhook } from "../src/server/stripe-webhook";
import type {
  FaultPoint,
  Perturbation,
  RunResult,
  Scenario,
} from "./helpers/cloudfault";
import {
  invariant,
  runCheckers,
  ScenarioController,
} from "./helpers/cloudfault";
import {
  assertActivated,
  explore,
  minimalFailureSetIds,
  searchDepth,
} from "./helpers/explore";
import { ledgerRows, perturbedLedger, resetLedger } from "./helpers/ledger";
import {
  d1WriteFaults,
  deliveryCount,
  webhookDuplicateDelivery,
  webhookTripleDelivery,
} from "./helpers/perturbations";

const ledgerFaults = d1WriteFaults("stripe-webhook-ledger");

import { signedDelivery, stripeEvent } from "./helpers/stripe";

const SECRET = "whsec_cloudfault_lane_signing_secret";
const EVENT = stripeEvent("evt_cloudfault_1", "checkout.session.completed");

interface WebhookState {
  /** Event ids the handler ran the side effect for, in order. */
  readonly applied: ReadonlyArray<string>;
  /** The status of every delivery, in order. */
  readonly acknowledged: ReadonlyArray<number>;
  readonly deliveries: number;
  /** What the ledger actually holds, read through the unproxied binding. */
  readonly ledger: ReadonlyArray<{
    event_id: string;
    completed_at: number | null;
  }>;
}

/**
 * Delivery is not a call the app makes, so there is no proxy to interpose on:
 * the scenario asks the controller which delivery-phase perturbations are
 * active and shapes the workload accordingly. `take` both selects and records
 * the activation, so the history shows the fault the same way a proxied call
 * would.
 */
const deliveriesFor = (controller: ScenarioController): number => {
  const plan = controller.begin({
    id: `stripe:webhook.delivery:${EVENT.id}`,
    name: "webhook.delivery",
    process: "stripe",
    target: "stripe",
    resource: `event:${EVENT.id}`,
  });
  const active: Perturbation[] = [];
  for (;;) {
    const perturbation = controller.take(plan, "delivery");
    if (!perturbation) break;
    active.push(perturbation);
  }
  const copies = deliveryCount(active);
  controller.complete(
    plan,
    "info",
    { copies },
    { actual: "committed", observed: "success" },
  );
  return copies;
};

const execute = async (
  scenario: Scenario,
): Promise<RunResult<WebhookState>> => {
  const started = Date.now();
  const controller = new ScenarioController(scenario);
  const copies = deliveriesFor(controller);
  await resetLedger();
  const ledger = perturbedLedger(controller);

  const applied: string[] = [];
  const acknowledged: number[] = [];

  for (let attempt = 1; attempt <= copies; attempt += 1) {
    const operation = controller.begin({
      id: `app:webhook:${EVENT.id}:${attempt}`,
      name: "handleStripeWebhook",
      process: "worker",
      target: "app",
      resource: `event:${EVENT.id}`,
      attempt,
    });
    try {
      // Signed per attempt, as Stripe signs each delivery attempt: the
      // request body is identical, the signature header is not.
      const response = await handleStripeWebhook(
        await signedDelivery(EVENT, SECRET),
        {
          secret: SECRET,
          events: ledger.events,
          onEvent: (_type, id) => {
            applied.push(id);
          },
        },
      );
      acknowledged.push(response.status);
      controller.complete(
        operation,
        response.ok ? "ok" : "fail",
        { status: response.status },
        {
          actual: "committed",
          observed: response.ok ? "success" : "definite-failure",
        },
      );
    } catch (error) {
      // An unhandled throw is a 500 to Stripe, which retries. Whether the
      // write behind it landed is CloudFault's business, not the caller's:
      // the D1 proxy already recorded `actual` in the history.
      acknowledged.push(500);
      controller.complete(
        operation,
        "fail",
        { error: String(error) },
        {
          actual: "unknown",
          observed: "definite-failure",
        },
      );
    }
  }

  await ledger.dispose();
  const state: WebhookState = {
    applied,
    acknowledged,
    deliveries: copies,
    ledger: await ledgerRows(),
  };
  const checks = await runCheckers(
    [
      invariant<WebhookState>(
        "stripe-webhook-effect-at-most-once",
        ({ state: seen }) => new Set(seen.applied).size === seen.applied.length,
        ({ state: seen }) =>
          `Event ${EVENT.id} was applied ${seen.applied.length} times across ${seen.deliveries} deliveries; Stripe delivers at least once, so the effect must be idempotent.`,
      ),
      invariant<WebhookState>(
        "stripe-webhook-ack-implies-effect",
        ({ state: seen }) =>
          !seen.acknowledged.includes(200) || seen.applied.length >= 1,
        () =>
          `The endpoint answered 200 for ${EVENT.id} but never ran its side effect: Stripe will not redeliver an acknowledged event.`,
      ),
      invariant<WebhookState>(
        "stripe-webhook-ledger-records-every-acknowledged-event",
        ({ state: seen }) =>
          !seen.acknowledged.includes(200) ||
          seen.ledger.some((row) => row.event_id === EVENT.id),
        () =>
          `The endpoint answered 200 for ${EVENT.id} without a ledger row: the next delivery would apply the effect again.`,
      ),
    ],
    { history: controller.history.snapshot(), state },
  );

  return {
    scenario,
    history: controller.history.snapshot(),
    checks,
    state,
    durationMs: Date.now() - started,
  };
};

const faultPoints: ReadonlyArray<FaultPoint> = [
  {
    id: "stripe-webhook-delivery",
    target: "stripe",
    choices: [webhookDuplicateDelivery, webhookTripleDelivery],
  },
  {
    // The ledger write is the one durable thing this endpoint does, so it is
    // the one worth perturbing. `commit-then-timeout` is the case unit tests
    // structurally cannot reach: the row lands and the caller is told it did
    // not.
    id: "stripe-webhook-ledger-write",
    target: "DB",
    choices: [ledgerFaults.commitThenTimeout, ledgerFaults.transientError],
  },
];

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

it("delivers a signed Stripe event exactly once under every bounded delivery perturbation", async () => {
  const result = await explore({
    name: "stripe-webhook/at-least-once-delivery",
    faultPoints,
    execute,
  });
  expect(result.baseline?.state?.applied).toEqual([EVENT.id]);
  expect(minimalFailureSetIds(result)).toEqual([]);
  expect(result.runs.length).toBeGreaterThanOrEqual(searchDepth());
  // A green fault lane is worthless if the faults never fired. This is the
  // check that would have caught the first version of this scenario, whose
  // D1 fault selected an operation name the driver never emits.
  assertActivated(result, faultPoints);
});
