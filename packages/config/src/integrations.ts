/**
 * Integration configuration - single source of truth
 *
 * This file defines which integrations are enabled in this instance.
 * Disabled integrations:
 * - Have no provider initialization
 * - Require no env vars
 * - Execute no runtime code paths
 */
export const integrations = {
  // Monitoring & Analytics (default ON)
  sentry: true,
  posthog: true,

  // Payments (default OFF)
  stripe: false,

  // Communication (default OFF)
  email: {
    enabled: false,
    provider: "none" as "resend" | "sendgrid" | "none",
  },

  // Realtime (default OFF)
  realtime: {
    enabled: false,
    provider: "none" as "pusher" | "ably" | "none",
  },

  // Storage (default OFF)
  storage: {
    enabled: false,
    provider: "none" as "uploadthing" | "none",
  },
} as const;

export type Integrations = typeof integrations;

// Helper type guards
export const isSentryEnabled = () => integrations.sentry;
export const isPostHogEnabled = () => integrations.posthog;
export const isStripeEnabled = () => integrations.stripe;
export const isEmailEnabled = () => integrations.email.enabled;
export const isRealtimeEnabled = () => integrations.realtime.enabled;
export const isStorageEnabled = () => integrations.storage.enabled;
