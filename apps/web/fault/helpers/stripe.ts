/**
 * Signed Stripe deliveries for the lane.
 *
 * The signature is computed the way Stripe computes it —
 * `v1 = HMAC-SHA256(secret, "<timestamp>.<payload>")` — so the workload goes
 * through the real `constructWebhookEvent` verification rather than around
 * it. (CloudFault ships the same helper as `stripeWebhookSigner` in
 * `@cloudfault/adapter-sdk/signers`; that sub-subpath is not part of the
 * published `@gmacko/cloudfault` surface, and this is eight lines.)
 */
const hex = (value: ArrayBuffer): string =>
  Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");

const sign = async (payload: string, secret: string, timestamp: number): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  return `t=${timestamp},v1=${hex(mac)}`;
};

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
      "stripe-signature": await sign(event.payload, secret, Math.floor(Date.now() / 1000)),
    },
    body: event.payload,
  });
