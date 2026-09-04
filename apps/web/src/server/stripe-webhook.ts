/**
 * `POST /api/webhooks/stripe`: verifies the delivery's signature with the
 * signing secret and acknowledges it. The event is logged by type; the
 * template ships no billing side effects (those arrive with the billing
 * layer), so a verified event is a 200 `{ received: true, type }`.
 *
 * Pure over its inputs so the route (src/routes/api.webhooks.stripe.ts) is
 * a one-liner and the signature check has a unit test with a signed
 * fixture.
 */
import { constructWebhookEvent, WebhookSignatureError } from "@gmacko/payments";

export interface StripeWebhookOptions {
  /** `STRIPE_WEBHOOK_SECRET`; unset means the endpoint is not configured. */
  readonly secret: string | undefined;
  readonly onEvent?: ((type: string, id: string) => void) | undefined;
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
  try {
    const event = await constructWebhookEvent(
      payload,
      request.headers.get("stripe-signature"),
      options.secret,
    );
    options.onEvent?.(event.type, event.id);
    return json(200, { received: true, type: event.type });
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      return json(400, { error: "invalid signature" });
    }
    throw error;
  }
};
