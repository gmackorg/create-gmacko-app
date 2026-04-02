export const integrations = {
  // Monitoring & Analytics (default ON)
  sentry: true,
  posthog: true,

  // Payments - Web (default OFF)
  stripe: false,

  // Payments - Mobile (default OFF)
  revenuecat: false,

  // Push Notifications (default OFF)
  notifications: false,

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

  // Internationalization (default OFF)
  i18n: true,

  // OpenAPI documentation (default OFF)
  openapi: false,
} as const;

export type Integrations = typeof integrations;

export const saasFeatures = {
  collaboration: false,
  billing: false,
  metering: false,
  support: false,
  launch: false,
  referrals: false,
  operatorApis: false,
} as const;

export type SaasFeatures = typeof saasFeatures;

export const tenancy = {
  mode: "single-tenant" as "single-tenant" | "multi-tenant",
} as const;

export type Tenancy = typeof tenancy;

export const platformPrimitives = {
  featureFlags: {
    enabled: true,
    provider: "local" as const,
  },
  jobs: {
    enabled: true,
    provider: "local" as const,
  },
  rateLimits: {
    enabled: true,
    scopes: ["auth", "contact", "signup", "api-keys", "operator-api"] as const,
  },
  botProtection: {
    enabled: true,
    provider: "local-rate-limit" as const,
  },
  compliance: {
    enabled: true,
    dataExport: true,
    dataDeletion: true,
  },
  emailDelivery: {
    enabled: integrations.email.enabled,
    provider: integrations.email.provider,
    requiredEnv:
      integrations.email.enabled && integrations.email.provider === "resend"
        ? (["RESEND_API_KEY"] as const)
        : ([] as const),
  },
} as const;

export type PlatformPrimitives = typeof platformPrimitives;

export const isSentryEnabled = () => integrations.sentry;
export const isPostHogEnabled = () => integrations.posthog;
export const isStripeEnabled = () => integrations.stripe;
export const isRevenueCatEnabled = () => integrations.revenuecat;
export const isNotificationsEnabled = () => integrations.notifications;
export const isEmailEnabled = () => integrations.email.enabled;
export const isRealtimeEnabled = () => integrations.realtime.enabled;
export const isStorageEnabled = () => integrations.storage.enabled;
export const isI18nEnabled = () => integrations.i18n;
export const isOpenApiEnabled = () => integrations.openapi;
export const isSaasCollaborationEnabled = () => saasFeatures.collaboration;
export const isSaasBillingEnabled = () => saasFeatures.billing;
export const isSaasMeteringEnabled = () => saasFeatures.metering;
export const isSaasSupportEnabled = () => saasFeatures.support;
export const isSaasLaunchEnabled = () => saasFeatures.launch;
export const isSaasReferralsEnabled = () => saasFeatures.referrals;
export const isSaasOperatorApisEnabled = () => saasFeatures.operatorApis;
export const isSingleTenant = () => tenancy.mode === "single-tenant";
export const isMultiTenant = () => tenancy.mode === "multi-tenant";
export const isEmailDeliveryEnabled = () =>
  platformPrimitives.emailDelivery.enabled;
