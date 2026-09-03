/**
 * Custom Worker entry (wrangler.jsonc `main`).
 *
 * The Cloudflare Vite plugin would otherwise generate the Worker entry from
 * TanStack Start, which leaves nowhere to hang a `scheduled` handler, a Queue
 * consumer, or Sentry's `withSentry` wrapper. This module re-exports Start's
 * `fetch`, adds the rest, and wraps the export with Sentry.
 */
import { withSentry } from "@sentry/cloudflare";
import startEntry from "@tanstack/react-start/server-entry";
import { Effect } from "effect";

import { runtime } from "./runtime";

// TODO(Phase 7): cover `withSentry` (error capture + flush on waitUntil) and
// `scheduled` (runs on the shared runtime) with pool-workers tests; Spike C
// verified both by hand only.

const handler = {
  fetch: (request) => startEntry.fetch(request),
  // Runs on the shared ManagedRuntime, so cron work gets the same services
  // (AppConfig, Database, Auth, Background) and logger as the HTTP handlers.
  scheduled: (controller) =>
    runtime.runPromise(
      Effect.logInfo("cron tick", {
        cron: controller.cron,
        scheduledTime: new Date(controller.scheduledTime).toISOString(),
      }),
    ),
} satisfies ExportedHandler<Cloudflare.Env>;

/**
 * Sentry instruments `fetch` and `scheduled` (isolation scope, error capture,
 * flush on waitUntil). Without a DSN the client is a no-op and the handlers
 * run unchanged. Tracing stays with the Effect OTLP tracer, hence
 * `skipOpenTelemetrySetup`.
 */
export default withSentry(
  (env: Cloudflare.Env) => ({
    dsn: env.SENTRY_DSN,
    environment: env.STAGE,
    release: __APP_VERSION__,
    skipOpenTelemetrySetup: true,
    tracesSampleRate: 0,
  }),
  handler,
);
