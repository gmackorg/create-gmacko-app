import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";

import { runtime, webConfig } from "~/server/runtime";
import { handleStripeWebhook } from "~/server/stripe-webhook";

/**
 * Stripe deliveries. More specific than `/api/$`, so it wins over the
 * HttpApi catch-all; verification lives in src/server/stripe-webhook.ts.
 */
export const Route = createFileRoute("/api/webhooks/stripe")({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleStripeWebhook(request, {
          secret: webConfig.stripeWebhookSecret,
          onEvent: (type, id) => {
            void runtime.runPromise(
              Effect.logInfo("stripe webhook received", { type, id }),
            );
          },
        }),
    },
  },
});
