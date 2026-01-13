import Stripe from "stripe";

import { integrations } from "@gmacko/config";

let stripeClient: Stripe | null = null;

export interface StripeConfig {
  secretKey: string;
  apiVersion?: Stripe.LatestApiVersion;
}

/**
 * Initialize Stripe client
 * Only initializes if stripe integration is enabled
 */
export function initStripe(config: StripeConfig): Stripe | null {
  if (!integrations.stripe) {
    console.log("[Stripe disabled] Stripe initialization skipped");
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(config.secretKey, {
      apiVersion: config.apiVersion,
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
    console.log("[Stripe disabled] Cannot create checkout session");
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
    console.log("[Stripe disabled] Cannot create billing portal session");
    return null;
  }
  return stripe.billingPortal.sessions.create(params);
}

export { Stripe };
