import type { FileRouter } from "uploadthing/next";
import { createUploadthing } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";

import { integrations } from "@gmacko/config";

/**
 * Create an UploadThing file router
 * Only functional if storage integration is enabled
 */
export function createFileRouter(): ReturnType<
  typeof createUploadthing
> | null {
  if (!integrations.storage.enabled) {
    console.log("[Storage disabled] UploadThing initialization skipped");
    return null;
  }

  return createUploadthing();
}

/**
 * Check if storage is enabled
 */
export function isStorageEnabled(): boolean {
  return integrations.storage.enabled;
}

/**
 * Create a guarded file router that returns empty if disabled
 */
export function createGuardedRouter<T extends FileRouter>(
  routerFn: () => T,
): T | Record<string, never> {
  if (!integrations.storage.enabled) {
    return {} as Record<string, never>;
  }
  return routerFn();
}

export { createUploadthing, UploadThingError };
export type { FileRouter };
