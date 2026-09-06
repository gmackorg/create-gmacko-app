/**
 * `WebhookEvents` on a real D1 (Miniflare, `@cloudflare/vitest-pool-workers`):
 * the guarded insert is the only thing standing between Stripe's
 * at-least-once delivery and a doubled side effect, and
 * `ON CONFLICT DO NOTHING ... RETURNING` is only a guard on the real binding
 * — sqlite-node's `layerTest` would not prove it.
 *
 * The cross-delivery behaviour under injected faults (a claim that commits
 * while the Worker loses the result) lives in the CloudFault lane,
 * apps/web/fault/stripe-webhook.fault.ts.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { Database } from "@gmacko/db";
import { Effect, Layer, ManagedRuntime } from "effect";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { WebhookEvents } from "./webhook-events";

const runtime = ManagedRuntime.make(
  WebhookEvents.layer.pipe(Layer.provide(Database.layer(env.DB))),
);

const EVENT = { id: "evt_ledger_1", type: "checkout.session.completed" };

const claim = () =>
  runtime.runPromise(
    Effect.flatMap(WebhookEvents, (events) => events.claim(EVENT)),
  );
const complete = () =>
  runtime.runPromise(
    Effect.flatMap(WebhookEvents, (events) => events.complete(EVENT.id)),
  );

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.prepare("delete from stripe_webhook_event").run();
});

describe("WebhookEvents", () => {
  it("claims an unseen event once and reports the redelivery as a duplicate", async () => {
    expect(await claim()).toBe("first");
    await complete();
    expect(await claim()).toBe("duplicate");
  });

  it("reports a claim that was never completed as a retry, not a duplicate", async () => {
    expect(await claim()).toBe("first");
    // No `complete`: the first delivery's effect provably did not run, so the
    // redelivery has to run it rather than skip it.
    expect(await claim()).toBe("retry");
  });

  it("lets exactly one of two concurrent deliveries claim the event", async () => {
    const claims = await Promise.all([claim(), claim()]);
    expect(claims.filter((outcome) => outcome === "first")).toHaveLength(1);
    const { results } = await env.DB.prepare(
      "select event_id from stripe_webhook_event",
    ).all();
    expect(results).toHaveLength(1);
  });

  it("keeps the first completion timestamp when a redelivery completes too", async () => {
    await claim();
    await complete();
    const completedAt = () =>
      env.DB.prepare(
        "select completed_at from stripe_webhook_event where event_id = ?",
      )
        .bind(EVENT.id)
        .first<{ completed_at: number }>();
    const first = await completedAt();
    await complete();
    expect((await completedAt())?.completed_at).toBe(first?.completed_at);
  });
});
