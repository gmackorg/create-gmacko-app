/**
 * `POST /api/webhooks/stripe`: verifies the delivery's signature with the
 * signing secret, dedupes it on `event.id`, and acknowledges it. The event is
 * logged by type; the template ships no billing side effects (those arrive
 * with the billing layer), so a verified event is a 200 `{ received: true,
 * type }`.
 *
 * Verification says the delivery is genuine; it does not say it is new.
 * Stripe delivers webhooks at least once, so `options.events` (the D1 ledger
 * in stripe-webhook-events.ts) decides whether this delivery owns the side
 * effect. Without it `onEvent` runs once per delivery, which is only correct
 * for a handler that has no side effects to duplicate.
 *
 * Pure over its inputs so the route (src/routes/api.webhooks.stripe.ts) is
 * a one-liner, the signature check has a unit test with a signed fixture,
 * and apps/web/fault/stripe-webhook.fault.ts can drive it under injected
 * delivery and D1 faults.
 */
import { constructWebhookEvent, WebhookSignatureError } from "@gmacko/payments";

/**
 * The promise-shaped view of `@gmacko/api`'s `WebhookEvents` ledger, so this
 * module stays a plain fetch handler (the route is not an Effect handler).
 * runtime.ts binds it to the isolate's runtime.
 */
export interface StripeWebhookLedger {
  readonly claim: (event: {
    readonly id: string;
    readonly type: string;
  }) => Promise<"first" | "duplicate" | "retry">;
  readonly complete: (id: string) => Promise<void>;
}

export interface StripeWebhookOptions {
  /** `STRIPE_WEBHOOK_SECRET`; unset means the endpoint is not configured. */
  readonly secret: string | undefined;
  /**
   * The event-id ledger that makes redelivery a no-op. Omitting it accepts
   * that `onEvent` runs once per *delivery*, not once per event.
   */
  readonly events?: StripeWebhookLedger | undefined;
  readonly onEvent?:
    | ((type: string, id: string) => void | Promise<void>)
    | undefined;
}

/** The three bodies this endpoint answers with. */
type WebhookResponseBody =
  | { readonly error: string }
  | { readonly received: true; readonly type: string };

const json = (status: number, body: WebhookResponseBody): Response =>
  Response.json(body, { status });

export const handleStripeWebhook = async (
  request: Request,
  options: StripeWebhookOptions,
): Promise<Response> => {
  if (request.method !== "POST") {
    return json(405, { error: "method not allowed" });
  }
  if (!options.secret) {
    return json(503, { error: "webhook not configured" });
  }
  const payload = await request.text();
  let event: { readonly id: string; readonly type: string };
  try {
    event = await constructWebhookEvent(
      payload,
      request.headers.get("stripe-signature"),
      options.secret,
    );
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      return json(400, { error: "invalid signature" });
    }
    throw error;
  }
  // A ledger failure must not be acknowledged: an unhandled rejection is a
  // 500, and Stripe redelivers. Acknowledging it would drop the event.
  const claim = options.events
    ? await options.events.claim({ id: event.id, type: event.type })
    : "first";
  if (claim === "duplicate") {
    return json(200, { received: true, type: event.type });
  }
  await options.onEvent?.(event.type, event.id);
  await options.events?.complete(event.id);
  return json(200, { received: true, type: event.type });
};
