/**
 * `@gmacko/api`'s `WebhookEvents` ledger, built over a CloudFault-proxied
 * `env.DB`.
 *
 * `Database.layer` takes a `D1Database`, and `createD1FaultProxy` returns
 * something with that exact shape, so the app's real Effect stack runs on top
 * of the fault proxy and nothing in `src/` or `packages/api` knows it is being
 * perturbed. Two things are worth knowing before adding scenarios:
 *
 *  - the terminal is `.raw()`, not `.run()`/`.all()`: drizzle's Effect driver
 *    goes through `@effect/sql`'s `executeValues`. Select faults by *target*
 *    rather than operation name (see helpers/perturbations.ts);
 *  - `@effect/sql-d1` implements `Database.batch` with `db.batch()`, and
 *    CloudFault's D1 proxy does not interpose on `batch()`. Batched writes —
 *    `acceptInvite`, `completeBootstrap`, `reviewWaitlistEntry` — pass
 *    through unperturbed today.
 */
import { env } from "cloudflare:workers";
import { WebhookEvents } from "@gmacko/api";
import { Database } from "@gmacko/db";
import { Effect, Layer, ManagedRuntime } from "effect";

import type { StripeWebhookLedger } from "../../src/server/stripe-webhook";
import { createD1FaultProxy, ScenarioController } from "./cloudfault";

export interface LedgerFixture {
  readonly events: StripeWebhookLedger;
  readonly dispose: () => Promise<void>;
}

/** A ledger whose every D1 statement passes through `controller`. */
export const perturbedLedger = (
  controller: ScenarioController,
): LedgerFixture => {
  const database = createD1FaultProxy(env.DB, {
    controller,
    target: "DB",
    process: "worker",
    callsite: "webhook-events",
  });
  const runtime = ManagedRuntime.make(
    WebhookEvents.layer.pipe(Layer.provide(Database.layer(database))),
  );
  return {
    events: {
      claim: (event) =>
        runtime.runPromise(
          Effect.flatMap(WebhookEvents, (events) => events.claim(event)),
        ),
      complete: (id) =>
        runtime.runPromise(
          Effect.flatMap(WebhookEvents, (events) => events.complete(id)),
        ),
    },
    dispose: () => runtime.dispose(),
  };
};

/** Empties the ledger between scenarios; every run starts from the same state. */
export const resetLedger = async (): Promise<void> => {
  await env.DB.prepare("delete from stripe_webhook_event").run();
};

/** What actually landed in D1, read through the *unproxied* binding. */
export const ledgerRows = async (): Promise<
  ReadonlyArray<{ event_id: string; completed_at: number | null }>
> => {
  const { results } = await env.DB.prepare(
    "select event_id, completed_at from stripe_webhook_event",
  ).all<{ event_id: string; completed_at: number | null }>();
  return results;
};
