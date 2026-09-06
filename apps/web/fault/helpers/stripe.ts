/**
 * Signed Stripe deliveries for the lane.
 *
 * The signature comes from CloudFault's own `stripeWebhookSigner`
 * (`@gmacko/cloudfault/adapter-sdk/signers`), which computes it the way
 * Stripe does — `v1 = HMAC-SHA256(secret, "<timestamp>.<payload>")` — so the
 * workload goes through the real `constructWebhookEvent` verification rather
 * than around it, and the lane does not carry its own crypto.
 */
import { stripeWebhookSigner } from "./cloudfault";

export interface StripeEventFixture {
  readonly id: string;
  readonly type: string;
  readonly payload: string;
}

/** One `checkout.session.completed`-shaped event, as Stripe serialises it. */
export const stripeEvent = (id: string, type: string): StripeEventFixture => ({
  id,
  type,
  payload: JSON.stringify({
    id,
    object: "event",
    api_version: "2025-01-27.acacia",
    created: 1_756_900_000,
    type,
    data: { object: { id: `cs_${id}`, object: "checkout.session" } },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
  }),
});

/** A `POST /api/webhooks/stripe` request carrying a valid signature. */
export const signedDelivery = async (
  event: StripeEventFixture,
  secret: string,
): Promise<Request> =>
  new Request("https://gmacko.test/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(await stripeWebhookSigner(secret).headers(event.payload)),
    },
    body: event.payload,
  });
