export const integrations = {
  sentry: true,
  posthog: true,
  forgegraph: false,
  stripe: false,
  revenuecat: false,
  notifications: false,
  email: {
    enabled: false,
    provider: "none" as "resend" | "sendgrid" | "none",
  },
  // Node-only (ioredis + BullMQ): unsupported on the web lane, which runs on
  // Cloudflare Workers. Enable it only for a Node service on a VPS node; see
  // packages/realtime/README.md.
  realtime: {
    enabled: false,
    provider: "none" as "redis" | "none",
  },
  storage: {
    enabled: false,
    provider: "none" as "uploadthing" | "none",
  },
  // Keep disabled to match the flat (non-localized) app route structure — with
  // i18n enabled, next-intl's locale routing leaves the root `/` unresolved
  // (404). The scaffolder also generates apps with i18n:false; enabling it
  // requires adding a [locale] segment.
  i18n: false,
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
export const isForgeGraphEnabled = () => integrations.forgegraph;
export const isSaasCollaborationEnabled = () => saasFeatures.collaboration;
export const isSaasBillingEnabled = () => saasFeatures.billing;
export const isSaasMeteringEnabled = () => saasFeatures.metering;
export const isSaasSupportEnabled = () => saasFeatures.support;
export const isSaasLaunchEnabled = () => saasFeatures.launch;
export const isSaasReferralsEnabled = () => saasFeatures.referrals;
export const isSaasOperatorApisEnabled = () => saasFeatures.operatorApis;
export const isEmailDeliveryEnabled = () =>
  platformPrimitives.emailDelivery.enabled;
