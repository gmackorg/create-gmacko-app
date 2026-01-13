/**
 * API Versioning Strategy
 *
 * Supports both header-based and URL-based versioning:
 * - Header: `X-API-Version: v1` or `Api-Version: v1`
 * - URL: `/api/v1/trpc/...` or `/api/v2/trpc/...`
 *
 * Default version is v1 for backward compatibility.
 */

export type ApiVersion = "v1" | "v2";

export const API_VERSIONS = ["v1", "v2"] as const;

export const DEFAULT_API_VERSION: ApiVersion = "v1";

export const CURRENT_API_VERSION: ApiVersion = "v1";

/**
 * Header names used for version detection (in priority order)
 */
export const VERSION_HEADERS = ["x-api-version", "api-version"] as const;

/**
 * Configuration for API versioning behavior
 */
export interface VersioningConfig {
  /** Default version when none specified */
  defaultVersion: ApiVersion;
  /** Whether to allow version detection from URL path */
  allowUrlVersioning: boolean;
  /** Whether to allow version detection from headers */
  allowHeaderVersioning: boolean;
  /** Whether to include version info in response headers */
  includeVersionInResponse: boolean;
}

export const defaultVersioningConfig: VersioningConfig = {
  defaultVersion: DEFAULT_API_VERSION,
  allowUrlVersioning: true,
  allowHeaderVersioning: true,
  includeVersionInResponse: true,
};

/**
 * Extract API version from request headers
 */
export function extractVersionFromHeaders(headers: Headers): ApiVersion | null {
  for (const headerName of VERSION_HEADERS) {
    const value = headers.get(headerName);
    if (value && isValidVersion(value)) {
      return normalizeVersion(value);
    }
  }
  return null;
}

/**
 * Extract API version from URL path
 * Matches patterns like /api/v1/..., /v1/..., /api/v2/...
 */
export function extractVersionFromUrl(url: string): ApiVersion | null {
  const versionMatch = /\/(?:api\/)?v(\d+)(?:\/|$)/i.exec(url);
  if (versionMatch) {
    const version = `v${versionMatch[1]}` as ApiVersion;
    if (isValidVersion(version)) {
      return version;
    }
  }
  return null;
}

/**
 * Check if a string is a valid API version
 */
export function isValidVersion(version: string): boolean {
  const normalized = normalizeVersion(version);
  return API_VERSIONS.includes(normalized);
}

/**
 * Normalize version string (handles formats like "1", "v1", "V1")
 */
export function normalizeVersion(version: string): ApiVersion {
  const cleaned = version.toLowerCase().replace(/^v/, "");
  return `v${cleaned}` as ApiVersion;
}

/**
 * Resolve the API version from a request
 * Priority: URL path > Header > Default
 */
export function resolveApiVersion(
  url: string,
  headers: Headers,
  config: VersioningConfig = defaultVersioningConfig,
): ApiVersion {
  // URL-based versioning takes priority
  if (config.allowUrlVersioning) {
    const urlVersion = extractVersionFromUrl(url);
    if (urlVersion) {
      return urlVersion;
    }
  }

  // Header-based versioning
  if (config.allowHeaderVersioning) {
    const headerVersion = extractVersionFromHeaders(headers);
    if (headerVersion) {
      return headerVersion;
    }
  }

  // Default version
  return config.defaultVersion;
}

/**
 * Version context that can be passed through the request lifecycle
 */
export interface VersionContext {
  /** The resolved API version for this request */
  version: ApiVersion;
  /** How the version was determined */
  source: "url" | "header" | "default";
  /** Whether this version is deprecated */
  isDeprecated: boolean;
  /** Deprecation message if applicable */
  deprecationMessage?: string;
}

/**
 * Create version context from a request
 */
export function createVersionContext(
  url: string,
  headers: Headers,
  config: VersioningConfig = defaultVersioningConfig,
): VersionContext {
  let version: ApiVersion = config.defaultVersion;
  let source: VersionContext["source"] = "default";

  // Check URL first
  if (config.allowUrlVersioning) {
    const urlVersion = extractVersionFromUrl(url);
    if (urlVersion) {
      version = urlVersion;
      source = "url";
    }
  }

  // Check headers if URL didn't match
  if (source === "default" && config.allowHeaderVersioning) {
    const headerVersion = extractVersionFromHeaders(headers);
    if (headerVersion) {
      version = headerVersion;
      source = "header";
    }
  }

  const deprecationInfo = getVersionDeprecationInfo(version);

  return {
    version,
    source,
    isDeprecated: deprecationInfo.isDeprecated,
    deprecationMessage: deprecationInfo.message,
  };
}

/**
 * Deprecation information for each API version
 */
interface DeprecationInfo {
  isDeprecated: boolean;
  message?: string;
  sunsetDate?: Date;
}

const VERSION_DEPRECATION_MAP: Record<ApiVersion, DeprecationInfo> = {
  v1: {
    isDeprecated: false,
  },
  v2: {
    isDeprecated: false,
  },
};

/**
 * Get deprecation info for a specific version
 */
export function getVersionDeprecationInfo(
  version: ApiVersion,
): DeprecationInfo {
  return VERSION_DEPRECATION_MAP[version] ?? { isDeprecated: false };
}

/**
 * Mark a version as deprecated (for future use)
 * Note: This modifies the deprecation map at runtime - use with caution
 */
export function markVersionDeprecated(
  version: ApiVersion,
  message: string,
  sunsetDate?: Date,
): void {
  VERSION_DEPRECATION_MAP[version] = {
    isDeprecated: true,
    message,
    sunsetDate,
  };
}

/**
 * Response headers to include version information
 */
export function getVersionResponseHeaders(
  context: VersionContext,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-API-Version": context.version,
  };

  if (context.isDeprecated) {
    headers.Deprecation = "true";
    if (context.deprecationMessage) {
      headers["X-Deprecation-Notice"] = context.deprecationMessage;
    }
  }

  return headers;
}

/**
 * Utility to check if a feature is available in a specific version
 */
export function isFeatureAvailable(
  feature: string,
  version: ApiVersion,
  featureVersionMap: Record<string, ApiVersion>,
): boolean {
  const requiredVersion = featureVersionMap[feature];
  if (!requiredVersion) return true; // Feature available in all versions

  const versionIndex = API_VERSIONS.indexOf(version);
  const requiredIndex = API_VERSIONS.indexOf(requiredVersion);

  return versionIndex >= requiredIndex;
}

/**
 * Strip version prefix from URL path for routing
 * /api/v1/trpc/post.all -> /api/trpc/post.all
 */
export function stripVersionFromPath(path: string): string {
  return path.replace(/\/v\d+(?=\/|$)/i, "");
}

/**
 * Add version prefix to URL path
 * /api/trpc/post.all -> /api/v1/trpc/post.all
 */
export function addVersionToPath(path: string, version: ApiVersion): string {
  // Insert version after /api/ or at the beginning
  if (path.startsWith("/api/")) {
    return path.replace("/api/", `/api/${version}/`);
  }
  return `/${version}${path}`;
}
