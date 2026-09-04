/**
 * `WebhookEvents`: the idempotency ledger behind `POST /api/webhooks/stripe`.
 *
 * Stripe's webhook delivery is at-least-once — "Occasionally, the same event
 * is sent more than once. We advise you to guard against duplicated event
 * receipts by making your event processing idempotent." Verifying the
 * signature says the delivery is genuine, not that it is new, so an endpoint
 * with side effects has to dedupe on `event.id`, and this is where.
 *
 * Two phases, not one, because a lost response is not a lost write:
 *
 *   claim()    guarded INSERT on the event id. `first` won it, `duplicate`
 *              means an earlier delivery already finished, and `retry` means
 *              an earlier delivery claimed the id and never marked itself
 *              done — its effect provably did not run, so this one runs it.
 *   complete() marks the claim finished, guarded on it still being open.
 *
 * A single-phase claim ("insert, skip if it conflicts") is the obvious
 * version and is wrong in exactly one case, which is the case CloudFault
 * exists for: the INSERT commits, the Worker loses the result, Stripe
 * redelivers, the redelivery sees the row and skips — and the effect never
 * runs at all. apps/web/fault/stripe-webhook.fault.ts pins both halves.
 *
 * Known limit, stated here because it bounds what the endpoint promises: the
 * side effect and `complete` are two writes. A handler whose effect is itself
 * a D1 write must put that write and the completion in one
 * `Database.batch([...])`; otherwise a fault between them re-runs the effect
 * on redelivery. The template's handler only logs, so it has nothing to lose
 * there.
 *
 * D1 has no transactions, so uniqueness comes from the primary key and
 * `ON CONFLICT DO NOTHING ... RETURNING` reports the winner in one round trip
 * — the same guarded-write shape as `completeBootstrap` and the rate limiter.
 */
import { Database, type DatabaseError } from "@gmacko/db";
import { stripeWebhookEvent } from "@gmacko/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

/** What a delivery learns about the event id it just presented. */
export type WebhookClaim = "first" | "duplicate" | "retry";

/** The logical event a delivery carries; the provider's own id is the key. */
export interface WebhookEventRef {
  readonly id: string;
  readonly type: string;
}

export interface WebhookEventsShape {
  /** Claims `event.id` for this delivery. */
  readonly claim: (
    event: WebhookEventRef,
  ) => Effect.Effect<WebhookClaim, DatabaseError>;
  /** Marks the claim finished; the side effect has run. */
  readonly complete: (id: string) => Effect.Effect<void, DatabaseError>;
}

export class WebhookEvents extends Context.Service<
  WebhookEvents,
  WebhookEventsShape
>()("@gmacko/api/WebhookEvents") {
  static layer: Layer.Layer<WebhookEvents, never, Database> = Layer.effect(
    WebhookEvents,
  )(
    Effect.map(Database, ({ db, updateWhere }) =>
      WebhookEvents.of({
        claim: (event) =>
          Effect.gen(function* () {
            const claimed = yield* db
              .insert(stripeWebhookEvent)
              .values({
                eventId: event.id,
                type: event.type,
                receivedAt: new Date(),
              })
              .onConflictDoNothing()
              .returning({ eventId: stripeWebhookEvent.eventId });
            if (claimed.length > 0) return "first" as const;
            const [row] = yield* db
              .select({ completedAt: stripeWebhookEvent.completedAt })
              .from(stripeWebhookEvent)
              .where(eq(stripeWebhookEvent.eventId, event.id))
              .limit(1);
            // No row means the ledger was pruned under us; treat that the way
            // an unfinished claim is treated. Running the effect again beats
            // losing it.
            return row?.completedAt == null
              ? ("retry" as const)
              : ("duplicate" as const);
          }),
        // Guarded on `completed_at IS NULL` so a redelivery racing the first
        // cannot move the timestamp; the count is ignored on purpose, since
        // either delivery finishing is the outcome we want.
        complete: (id) =>
          Effect.asVoid(
            updateWhere(
              db
                .update(stripeWebhookEvent)
                .set({ completedAt: new Date() })
                .where(
                  and(
                    eq(stripeWebhookEvent.eventId, id),
                    isNull(stripeWebhookEvent.completedAt),
                  ),
                ),
            ),
          ),
      }),
    ),
  );
}
