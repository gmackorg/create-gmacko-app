import { integrations } from "@gmacko/config";
import { createLogger } from "@gmacko/logging";
import Stripe from "stripe";

const log = createLogger({ module: "payments" });

let stripeClient: Stripe | null = null;

export interface StripeConfig {
  secretKey: string;
  apiVersion?: Stripe.LatestApiVersion;
  host?: string;
  protocol?: "https" | "http";
  port?: number;
}

/**
 * Stripe's fetch-based HTTP client and WebCrypto signature provider: the
 * SDK then runs on Cloudflare Workers (no `node:http`, no `node:crypto`),
 * and everywhere else `fetch` and `crypto.subtle` exist.
 */
const httpClient = () => Stripe.createFetchHttpClient();
const cryptoProvider = () => Stripe.createSubtleCryptoProvider();

/**
 * Initialize Stripe client
 * Only initializes if stripe integration is enabled
 */
export function initStripe(config: StripeConfig): Stripe | null {
  if (!integrations.stripe) {
    log.debug("stripe initialization skipped (integration disabled)");
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(config.secretKey, {
      apiVersion: config.apiVersion,
      httpClient: httpClient(),
      ...(config.host
        ? {
            host: config.host,
            protocol: config.protocol ?? "https",
            port: config.port ?? 443,
          }
        : {}),
    });
  }

  return stripeClient;
}

/**
 * Get the Stripe client instance
 */
export function getStripe(): Stripe | null {
  if (!integrations.stripe) {
    return null;
  }
  return stripeClient;
}

/**
 * Create a checkout session
 */
export async function createCheckoutSession(
  params: Stripe.Checkout.SessionCreateParams,
): Promise<Stripe.Checkout.Session | null> {
  const stripe = getStripe();
  if (!stripe) {
    log.debug("checkout session skipped (integration disabled)");
    return null;
  }
  return stripe.checkout.sessions.create(params);
}

/**
 * Create a billing portal session
 */
export async function createBillingPortalSession(
  params: Stripe.BillingPortal.SessionCreateParams,
): Promise<Stripe.BillingPortal.Session | null> {
  const stripe = getStripe();
  if (!stripe) {
    log.debug("billing portal session skipped (integration disabled)");
    return null;
  }
  return stripe.billingPortal.sessions.create(params);
}

/** Thrown by `constructWebhookEvent` for a missing, malformed or stale signature. */
export class WebhookSignatureError extends Error {
  override readonly name = "WebhookSignatureError";
}

/**
 * Verifies a Stripe webhook delivery and decodes the event. Signature
 * checking needs no API key, so this works whether or not the integration
 * is enabled; it uses SubtleCrypto (async) so it runs on Workers.
 */
export async function constructWebhookEvent(
  payload: string,
  signature: string | null,
  secret: string,
  options?: { readonly tolerance?: number | undefined },
): Promise<Stripe.Event> {
  if (!signature) {
    throw new WebhookSignatureError("Missing stripe-signature header");
  }
  const verifier =
    stripeClient ??
    new Stripe("sk_webhook_verify_only", { httpClient: httpClient() });
  try {
    return await verifier.webhooks.constructEventAsync(
      payload,
      signature,
      secret,
      options?.tolerance,
      cryptoProvider(),
    );
  } catch (error) {
    throw new WebhookSignatureError(
      error instanceof Error ? error.message : "Invalid webhook signature",
      { cause: error },
    );
  }
}

export { Stripe };
