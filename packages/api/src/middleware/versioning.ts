import { TRPCError } from "@trpc/server";

import type {
  ApiVersion,
  VersionContext,
  VersioningConfig,
} from "../versioning";
import {
  createVersionContext,
  defaultVersioningConfig,
  getVersionResponseHeaders,
  isValidVersion,
} from "../versioning";

export interface VersionedContext {
  apiVersion: VersionContext;
}

export function createVersionMiddlewareContext(
  url: string,
  headers: Headers,
  config: VersioningConfig = defaultVersioningConfig,
): VersionedContext {
  return {
    apiVersion: createVersionContext(url, headers, config),
  };
}

export function assertMinVersion(
  context: VersionContext,
  minVersion: ApiVersion,
  featureName: string,
): void {
  const versionOrder: ApiVersion[] = ["v1", "v2"];
  const currentIndex = versionOrder.indexOf(context.version);
  const minIndex = versionOrder.indexOf(minVersion);

  if (currentIndex < minIndex) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Feature '${featureName}' requires API version ${minVersion} or higher. Current version: ${context.version}`,
    });
  }
}

export function assertMaxVersion(
  context: VersionContext,
  maxVersion: ApiVersion,
  featureName: string,
): void {
  const versionOrder: ApiVersion[] = ["v1", "v2"];
  const currentIndex = versionOrder.indexOf(context.version);
  const maxIndex = versionOrder.indexOf(maxVersion);

  if (currentIndex > maxIndex) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Feature '${featureName}' was removed in API version ${context.version}. Maximum supported version: ${maxVersion}`,
    });
  }
}

export function validateVersionHeader(headers: Headers): ApiVersion | null {
  const versionHeaders = ["x-api-version", "api-version"];

  for (let i = 0; i < versionHeaders.length; i++) {
    const headerName = versionHeaders[i];
    if (headerName) {
      const value = headers.get(headerName);
      if (value && isValidVersion(value)) {
        const normalized = value.toLowerCase().replace(/^v/, "");
        return `v${normalized}` as ApiVersion;
      }
    }
  }

  return null;
}

export { getVersionResponseHeaders };
