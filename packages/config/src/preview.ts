/**
 * Preview environment configuration
 *
 * This module provides utilities for detecting and configuring
 * preview deployments (PR-specific environments).
 */

/**
 * Check if running in a preview environment
 */
export function isPreviewEnvironment(): boolean {
  return (
    process.env.NODE_ENV === "preview" ||
    process.env.NEXT_PUBLIC_PREVIEW === "true" ||
    process.env.VERCEL_ENV === "preview" ||
    !!process.env.PREVIEW_PR_NUMBER
  );
}

/**
 * Get the PR number for this preview deployment
 */
export function getPreviewPRNumber(): number | null {
  const prNumber = process.env.PREVIEW_PR_NUMBER;
  if (prNumber) {
    const parsed = parseInt(prNumber, 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Get the preview domain for this deployment
 */
export function getPreviewDomain(): string | null {
  return process.env.PREVIEW_DOMAIN || null;
}

/**
 * Preview environment configuration
 */
export interface PreviewConfig {
  /** Whether this is a preview environment */
  isPreview: boolean;
  /** PR number if in preview */
  prNumber: number | null;
  /** Preview domain */
  domain: string | null;
  /** Base preview domain (e.g., preview.gmacko.io) */
  baseDomain: string;
  /** Database configuration for preview */
  database: PreviewDatabaseConfig;
}

export interface PreviewDatabaseConfig {
  /** Use PR-specific schema */
  useSchema: boolean;
  /** Schema name pattern */
  schemaName: string | null;
  /** Use branch database */
  useBranchDatabase: boolean;
}

/**
 * Get complete preview configuration
 */
export function getPreviewConfig(): PreviewConfig {
  const isPreview = isPreviewEnvironment();
  const prNumber = getPreviewPRNumber();

  return {
    isPreview,
    prNumber,
    domain: getPreviewDomain(),
    baseDomain: process.env.PREVIEW_BASE_DOMAIN || "preview.gmacko.io",
    database: getPreviewDatabaseConfig(prNumber),
  };
}

/**
 * Get preview database configuration
 *
 * Supports two strategies:
 * 1. Schema-based isolation: Each PR gets its own schema in the same database
 * 2. Branch database: Each PR gets a dedicated Neon branch
 */
function getPreviewDatabaseConfig(
  prNumber: number | null,
): PreviewDatabaseConfig {
  // Check if using Neon branch databases
  const useBranchDatabase = !!process.env.PREVIEW_DATABASE_URL;

  // Check if using schema-based isolation
  const useSchema =
    !useBranchDatabase && !!process.env.PREVIEW_USE_SCHEMA_ISOLATION;

  return {
    useSchema,
    schemaName: useSchema && prNumber ? `preview_pr_${prNumber}` : null,
    useBranchDatabase,
  };
}

/**
 * Get the database URL for preview environments
 *
 * If PREVIEW_DATABASE_URL is set, uses that directly (Neon branch database).
 * If PREVIEW_USE_SCHEMA_ISOLATION is set, appends schema to regular DATABASE_URL.
 * Otherwise, falls back to regular DATABASE_URL.
 */
export function getPreviewDatabaseUrl(): string {
  const config = getPreviewConfig();

  // Priority 1: Dedicated preview database URL (Neon branch)
  if (process.env.PREVIEW_DATABASE_URL) {
    return process.env.PREVIEW_DATABASE_URL;
  }

  // Priority 2: Schema-based isolation
  if (config.database.useSchema && config.database.schemaName) {
    const baseUrl = process.env.DATABASE_URL;
    if (baseUrl) {
      // Append schema parameter to connection string
      const separator = baseUrl.includes("?") ? "&" : "?";
      return `${baseUrl}${separator}schema=${config.database.schemaName}`;
    }
  }

  // Fallback: Regular database URL
  return process.env.DATABASE_URL || "";
}

/**
 * Construct preview URL for a given PR number
 */
export function constructPreviewUrl(
  prNumber: number,
  baseDomain?: string,
): string {
  const domain =
    baseDomain || process.env.PREVIEW_BASE_DOMAIN || "preview.gmacko.io";
  return `https://pr-${prNumber}.${domain}`;
}

/**
 * Preview environment feature flags
 *
 * Some features should be disabled or modified in preview environments
 */
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

/**
 * Get feature flags for preview environments
 */
export function getPreviewFeatureFlags(): PreviewFeatureFlags {
  const isPreview = isPreviewEnvironment();

  return {
    disablePayments: isPreview,
    disableEmails: isPreview && process.env.PREVIEW_SEND_EMAILS !== "true",
    disableAnalytics:
      isPreview && process.env.PREVIEW_ENABLE_ANALYTICS !== "true",
    showPreviewBanner: isPreview,
    allowTestDataSeeding: isPreview,
  };
}

/**
 * Preview environment metadata for display
 */
export interface PreviewMetadata {
  prNumber: number | null;
  branch: string | null;
  commit: string | null;
  deployedAt: string | null;
}

/**
 * Get preview metadata for display in UI
 */
export function getPreviewMetadata(): PreviewMetadata | null {
  if (!isPreviewEnvironment()) {
    return null;
  }

  return {
    prNumber: getPreviewPRNumber(),
    branch:
      process.env.VERCEL_GIT_COMMIT_REF || process.env.PREVIEW_BRANCH || null,
    commit:
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.PREVIEW_COMMIT || null,
    deployedAt: process.env.PREVIEW_DEPLOYED_AT || null,
  };
}
