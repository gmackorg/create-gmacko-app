/**
 * Preview environment configuration: detecting and describing a PR-specific
 * deployment. Pure functions over an `env` record the caller supplies (the
 * Worker's bindings, a CI step's variables), so nothing here reads
 * `process.env` and the module is safe in every bundle.
 */

/** The variables a preview deployment is described by. */
export type PreviewEnv = Readonly<Record<string, string | undefined>>;

/** Whether `env` describes a preview environment. */
export function isPreviewEnvironment(env: PreviewEnv): boolean {
  return (
    env.STAGE === "preview" ||
    env.DEPLOY_ENV === "preview" ||
    env.PREVIEW === "true" ||
    !!env.PREVIEW_PR_NUMBER
  );
}

/** The PR number of this preview deployment, when set and numeric. */
export function getPreviewPRNumber(env: PreviewEnv): number | null {
  const prNumber = env.PREVIEW_PR_NUMBER;
  if (prNumber) {
    const parsed = Number.parseInt(prNumber, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** The preview domain for this deployment, when set. */
export function getPreviewDomain(env: PreviewEnv): string | null {
  return env.PREVIEW_DOMAIN || null;
}

export interface PreviewConfig {
  /** Whether this is a preview environment */
  isPreview: boolean;
  /** PR number if in preview */
  prNumber: number | null;
  /** Preview domain */
  domain: string | null;
  /** Base preview domain (e.g. preview.gmacko.io) */
  baseDomain: string;
  /** Database configuration for preview */
  database: PreviewDatabaseConfig;
}

export interface PreviewDatabaseConfig {
  /**
   * Whether this preview has its own database (Phase 9 gives each PR a D1
   * of its own); until then previews share `gmacko-web-preview`.
   */
  useDedicatedDatabase: boolean;
  /** The shared or dedicated database's name, when known. */
  databaseName: string | null;
}

export const defaultPreviewBaseDomain = "preview.gmacko.io";

export function getPreviewConfig(env: PreviewEnv): PreviewConfig {
  return {
    isPreview: isPreviewEnvironment(env),
    prNumber: getPreviewPRNumber(env),
    domain: getPreviewDomain(env),
    baseDomain: env.PREVIEW_BASE_DOMAIN || defaultPreviewBaseDomain,
    database: {
      useDedicatedDatabase: env.PREVIEW_DATABASE_DEDICATED === "true",
      databaseName: env.PREVIEW_DATABASE_NAME || null,
    },
  };
}

/** `https://pr-<n>.<baseDomain>` */
export function constructPreviewUrl(
  prNumber: number,
  baseDomain: string = defaultPreviewBaseDomain,
): string {
  return `https://pr-${prNumber}.${baseDomain}`;
}

export interface PreviewFeatureFlags {
  /** Disable real payment processing */
  disablePayments: boolean;
  /** Disable sending real emails */
  disableEmails: boolean;
  /** Disable analytics tracking */
  disableAnalytics: boolean;
  /** Show preview banner in UI */
  showPreviewBanner: boolean;
  /** Allow test data seeding */
  allowTestDataSeeding: boolean;
}

/** What a preview turns off (payments, emails, analytics) unless `env` opts back in. */
export function getPreviewFeatureFlags(env: PreviewEnv): PreviewFeatureFlags {
  const isPreview = isPreviewEnvironment(env);
  return {
    disablePayments: isPreview,
    disableEmails: isPreview && env.PREVIEW_SEND_EMAILS !== "true",
    disableAnalytics: isPreview && env.PREVIEW_ENABLE_ANALYTICS !== "true",
    showPreviewBanner: isPreview,
    allowTestDataSeeding: isPreview,
  };
}

export interface PreviewMetadata {
  prNumber: number | null;
  branch: string | null;
  commit: string | null;
  deployedAt: string | null;
}

/** Preview metadata for display in the UI; `null` outside a preview. */
export function getPreviewMetadata(env: PreviewEnv): PreviewMetadata | null {
  if (!isPreviewEnvironment(env)) {
    return null;
  }
  return {
    prNumber: getPreviewPRNumber(env),
    branch: env.PREVIEW_BRANCH || null,
    commit: env.PREVIEW_COMMIT || null,
    deployedAt: env.PREVIEW_DEPLOYED_AT || null,
  };
}
