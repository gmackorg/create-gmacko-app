/**
 * The Stripe webhook route: a delivery signed with the endpoint secret is
 * accepted (200, event type echoed); a bad or missing signature, a stale
 * timestamp, or a tampered body is refused with 400 and the secret is never
 * required to be a live one. The signature is computed here the way Stripe
 * computes it: `v1 = HMAC-SHA256(secret, "<timestamp>.<payload>")`.
 */
import { describe, expect, it } from "vitest";

import { handleStripeWebhook } from "../stripe-webhook";

const SECRET = "whsec_test_signing_secret_for_the_route_spec";

const sign = async (
  payload: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
): Promise<string> => {
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
  const hex = Array.from(new Uint8Array(mac), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `t=${timestamp},v1=${hex}`;
};

const event = JSON.stringify({
  id: "evt_test_1",
  object: "event",
  api_version: "2025-01-27.acacia",
  created: 1_756_900_000,
  type: "checkout.session.completed",
  data: { object: { id: "cs_test_1", object: "checkout.session" } },
  livemode: false,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
});

const deliver = (body: string, signature?: string) =>
  new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    // An unsigned delivery carries no `stripe-signature` header at all,
    // which is what the 400 case below is about.
    headers: signature
      ? {
          "content-type": "application/json",
          "stripe-signature": signature,
        }
      : { "content-type": "application/json" },
    body,
  });

describe("handleStripeWebhook", () => {
  it("accepts a correctly signed delivery and reports the event type", async () => {
    const seen: Array<[string, string]> = [];
    const response = await handleStripeWebhook(
      deliver(event, await sign(event, SECRET)),
      { secret: SECRET, onEvent: (type, id) => seen.push([type, id]) },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      type: "checkout.session.completed",
    });
    expect(seen).toEqual([["checkout.session.completed", "evt_test_1"]]);
  });

  it("rejects a signature made with another secret", async () => {
    const response = await handleStripeWebhook(
      deliver(event, await sign(event, "whsec_someone_else")),
      { secret: SECRET },
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid signature",
    });
  });

  it("rejects a tampered body, a stale timestamp and a missing header", async () => {
    const signature = await sign(event, SECRET);
    const tampered = await handleStripeWebhook(
      deliver(event.replace("cs_test_1", "cs_test_2"), signature),
      { secret: SECRET },
    );
    expect(tampered.status).toBe(400);

    const stale = await handleStripeWebhook(
      deliver(
        event,
        await sign(event, SECRET, Math.floor(Date.now() / 1000) - 3600),
      ),
      { secret: SECRET },
    );
    expect(stale.status).toBe(400);

    const missing = await handleStripeWebhook(deliver(event), {
      secret: SECRET,
    });
    expect(missing.status).toBe(400);
  });

  it("answers 503 when no secret is configured and 405 for other methods", async () => {
    const unconfigured = await handleStripeWebhook(
      deliver(event, await sign(event, SECRET)),
      { secret: undefined },
    );
    expect(unconfigured.status).toBe(503);

    const get = await handleStripeWebhook(
      new Request("http://localhost/api/webhooks/stripe"),
      { secret: SECRET },
    );
    expect(get.status).toBe(405);
  });
});
