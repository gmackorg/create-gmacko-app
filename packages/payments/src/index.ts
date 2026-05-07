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

export { Stripe };
