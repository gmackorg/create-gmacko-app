/**
 * `@gmacko/storage`: UploadThing on Cloudflare Workers.
 *
 * UploadThing is the default because it is the only one of the two options
 * that is a *service*: signed upload URLs, a CDN, virus scanning and a
 * dashboard, with nothing to run. The Worker never sees the file bytes — the
 * browser uploads straight to UploadThing — so the Worker's request size and
 * CPU limits do not apply to the upload.
 *
 * Workers-safe by construction: `uploadthing/server` is the fetch adapter
 * (`Request` in, `Response` out) and uses `fetch`, `crypto` and `Blob` only.
 * The Next.js adapter (`uploadthing/next`) is NOT used — it imports
 * `next/server`, and the web lane has no Next.js since the Phase 8 cutover.
 * `src/storage.workers.test.ts` runs the route handler on workerd to keep
 * that true.
 *
 * R2 is the alternative when files must stay on your own account or inside
 * Cloudflare's network; see README.md for what that costs you.
 *
 * Everything here is inert while `integrations.storage.enabled` is false
 * (`gmacko.integrations.json`), which is the template's default.
 */
import { integrations } from "@gmacko/config";
import { createLogger } from "@gmacko/logging";
import {
  createRouteHandler,
  createUploadthing,
  UploadThingError,
  UTApi,
} from "uploadthing/server";
import type { FileRouter, RouteHandlerOptions } from "uploadthing/types";

const log = createLogger({ module: "storage" });

/**
 * The `f` builder every file route is declared with, or `null` when storage
 * is disabled.
 */
export function createFileRouter(): ReturnType<
  typeof createUploadthing
> | null {
  if (!integrations.storage.enabled) {
    log.debug("uploadthing initialization skipped (integration disabled)");
    return null;
  }

  return createUploadthing();
}

/** Whether the storage integration is on. */
export function isStorageEnabled(): boolean {
  return integrations.storage.enabled;
}

/**
 * Builds the router only when storage is enabled, so a disabled app never
 * evaluates the route definitions (which read the token at build time).
 */
export function createGuardedRouter<T extends FileRouter>(
  routerFn: () => T,
): T | Record<string, never> {
  if (!integrations.storage.enabled) {
    return {} as Record<string, never>;
  }
  return routerFn();
}

/**
 * The fetch handler for `/api/uploadthing`: mount it from a TanStack Start
 * server route, which hands it the `Request` and sends back the `Response`.
 * With storage disabled it answers 404 rather than throwing, so a route left
 * mounted in a disabled app is inert instead of a 500.
 *
 * `config.token` must come from the Worker's bindings, never `process.env`
 * (AGENTS.md): the Worker has no ambient environment.
 */
export function createStorageHandler<TRouter extends FileRouter>(
  options: RouteHandlerOptions<TRouter>,
): (request: Request) => Promise<Response> {
  if (!integrations.storage.enabled) {
    log.debug("uploadthing route handler skipped (integration disabled)");
    return () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "storage is not enabled" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      );
  }
  return createRouteHandler(options);
}

/**
 * The server-side API (delete, list, rename), for a handler that has to touch
 * a file outside an upload. Takes the token explicitly for the same reason.
 */
export function createStorageApi(token: string): UTApi {
  return new UTApi({ token });
}

export type { FileRouter, RouteHandlerOptions };
export { createRouteHandler, createUploadthing, UploadThingError, UTApi };
