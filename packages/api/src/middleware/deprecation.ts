/**
 * Deprecation Middleware for tRPC
 *
 * Provides utilities to mark endpoints as deprecated and warn consumers.
 */

import { TRPCError } from "@trpc/server";

import type { ApiVersion } from "../versioning";

/**
 * Deprecation metadata for an endpoint
 */
export interface DeprecationMeta {
  /** Whether this endpoint is deprecated */
  deprecated: boolean;
  /** Human-readable deprecation message */
  message?: string;
  /** Suggested replacement endpoint */
  replacement?: string;
  /** Date when endpoint will be removed (ISO string) */
  sunsetDate?: string;
  /** Minimum version where replacement is available */
  replacementVersion?: ApiVersion;
}

/**
 * Default deprecation metadata
 */
export const defaultDeprecationMeta: DeprecationMeta = {
  deprecated: false,
};

/**
 * Create deprecation metadata
 */
export function deprecated(
  options: Omit<DeprecationMeta, "deprecated">,
): DeprecationMeta {
  return {
    deprecated: true,
    ...options,
  };
}

/**
 * Format deprecation warning message
 */
export function formatDeprecationWarning(
  meta: DeprecationMeta,
  path: string,
): string {
  const parts = [`Endpoint '${path}' is deprecated.`];

  if (meta.message) {
    parts.push(meta.message);
  }

  if (meta.replacement) {
    parts.push(`Please use '${meta.replacement}' instead.`);
  }

  if (meta.sunsetDate) {
    parts.push(`This endpoint will be removed on ${meta.sunsetDate}.`);
  }

  return parts.join(" ");
}

/**
 * Generate deprecation response headers
 */
export function getDeprecationHeaders(
  meta: DeprecationMeta,
  path: string,
): Record<string, string> {
  if (!meta.deprecated) {
    return {};
  }

  const headers: Record<string, string> = {
    Deprecation: "true",
    "X-Deprecated-Endpoint": path,
  };

  if (meta.replacement) {
    headers["X-Replacement-Endpoint"] = meta.replacement;
  }

  if (meta.sunsetDate) {
    headers.Sunset = meta.sunsetDate;
  }

  if (meta.message) {
    headers["X-Deprecation-Notice"] = meta.message;
  }

  return headers;
}

/**
 * Endpoint version requirements
 */
export interface VersionRequirement {
  /** Minimum version required */
  minVersion?: ApiVersion;
  /** Maximum version allowed (for removed endpoints) */
  maxVersion?: ApiVersion;
  /** Specific versions where this endpoint is available */
  availableIn?: ApiVersion[];
}

/**
 * Check if an endpoint is available in a given version
 */
export function isEndpointAvailableInVersion(
  version: ApiVersion,
  requirement: VersionRequirement,
): boolean {
  const versionOrder: ApiVersion[] = ["v1", "v2"];
  const versionIndex = versionOrder.indexOf(version);

  // Check available versions list
  if (requirement.availableIn) {
    return requirement.availableIn.includes(version);
  }

  // Check min version
  if (requirement.minVersion) {
    const minIndex = versionOrder.indexOf(requirement.minVersion);
    if (versionIndex < minIndex) {
      return false;
    }
  }

  // Check max version
  if (requirement.maxVersion) {
    const maxIndex = versionOrder.indexOf(requirement.maxVersion);
    if (versionIndex > maxIndex) {
      return false;
    }
  }

  return true;
}

/**
 * Throw error if endpoint is not available in the requested version
 */
export function assertVersionAvailable(
  version: ApiVersion,
  requirement: VersionRequirement,
  endpointPath: string,
): void {
  if (!isEndpointAvailableInVersion(version, requirement)) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Endpoint '${endpointPath}' is not available in API version ${version}`,
    });
  }
}

/**
 * Registry for deprecated endpoints
 * Used to track and report deprecations
 */
export class DeprecationRegistry {
  private deprecations: Record<string, DeprecationMeta> = {};

  register(path: string, meta: DeprecationMeta): void {
    this.deprecations[path] = meta;
  }

  get(path: string): DeprecationMeta | undefined {
    return this.deprecations[path];
  }

  isDeprecated(path: string): boolean {
    const meta = this.deprecations[path];
    return meta?.deprecated ?? false;
  }

  getAllDeprecated(): { path: string; meta: DeprecationMeta }[] {
    const result: { path: string; meta: DeprecationMeta }[] = [];
    for (const path of Object.keys(this.deprecations)) {
      const meta = this.deprecations[path];
      if (meta?.deprecated) {
        result.push({ path, meta });
      }
    }
    return result;
  }
}

/**
 * Global deprecation registry instance
 */
export const deprecationRegistry = new DeprecationRegistry();
