/** The transactional email provider; `none` means the app sends no email. */
export type EmailProvider = "resend" | "sendgrid" | "none";
/** The pub/sub + queue backend `@gmacko/realtime` talks to. */
export type RealtimeProvider = "redis" | "none";
/** The object store `@gmacko/storage` writes to. */
export type StorageProvider = "r2" | "none";

// Each provider-bearing integration is declared through its own contract
// rather than written inline under `as const`, which would pin `provider` to
// the single literal it is scaffolded with and turn every
// `provider === "…"` comparison in this repo into a "no overlap" error.
// `enabled` keeps the literal the scaffolder wrote, so a disabled integration
// stays statically disabled for its consumers.

/** How the app sends transactional email. */
interface EmailIntegration {
  readonly enabled: false;
  readonly provider: EmailProvider;
}
/** How the app publishes and subscribes to realtime events. */
interface RealtimeIntegration {
  readonly enabled: false;
  readonly provider: RealtimeProvider;
}
/** Where the app stores uploaded files. */
interface StorageIntegration {
  readonly enabled: false;
  readonly provider: StorageProvider;
}

const email: EmailIntegration = { enabled: false, provider: "none" };
// Node-only (ioredis + BullMQ): unsupported on the web lane, which runs on
// Cloudflare Workers. Enable it only for a Node service on a VPS node; see
// packages/realtime/README.md.
const realtime: RealtimeIntegration = { enabled: false, provider: "none" };
const storage: StorageIntegration = { enabled: false, provider: "none" };

export const integrations = {
  sentry: true,
  posthog: true,
  forgegraph: false,
  stripe: false,
  revenuecat: false,
  notifications: false,
  email,
  realtime,
  storage,
  // Keep disabled to match the flat (non-localized) route structure of
  // apps/web; enabling it means adding a locale segment to the routes. The
  // scaffolder also generates apps with i18n:false.
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
