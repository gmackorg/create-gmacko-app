/**
 * Custom Worker entry (wrangler.jsonc `main`).
 *
 * The Cloudflare Vite plugin would otherwise generate the Worker entry from
 * TanStack Start, which leaves nowhere to hang a `scheduled` handler, a Queue
 * consumer, or Sentry's `withSentry` wrapper. This module composes Start's
 * `fetch`, the cron tick on the shared runtime, the telemetry flush and the
 * Sentry options into `makeWorker` (make-worker.ts, covered by the workers
 * suite in src/server/__tests__/worker.workers.test.ts).
 */
import { Jobs } from "@gmacko/api";
import { sentryWorkerOptions } from "@gmacko/monitoring/web/server";
import startEntry from "@tanstack/react-start/server-entry";
import { Effect } from "effect";

import { makeWorker } from "./make-worker";
import { flush, runtime } from "./runtime";

export default makeWorker<Cloudflare.Env>({
  fetch: (request) => startEntry.fetch(request),
  // Runs on the shared ManagedRuntime, so cron work gets the same services
  // (AppConfig, Database, Auth, Background, Jobs) and logger as the HTTP
  // handlers. `Jobs.runScheduled` never fails: a cron tick has nobody to
  // report a failure to, so each job logs its own cause and the tick ends 200.
  scheduled: (controller) =>
    runtime.runPromise(
      Effect.logInfo("cron tick", {
        cron: controller.cron,
        scheduledTime: new Date(controller.scheduledTime).toISOString(),
      }).pipe(
        Effect.andThen(Effect.flatMap(Jobs, (jobs) => jobs.runScheduled)),
      ),
    ),
  flush,
  /**
   * Sentry instruments `fetch` and `scheduled` (isolation scope, error
   * capture, flush on waitUntil). Without a DSN the client is a no-op and
   * the handlers run unchanged. Tracing stays with the Effect OTLP tracer
   * (`skipOpenTelemetrySetup` in `sentryWorkerOptions`).
   */
  sentry: (env) =>
    sentryWorkerOptions({
      dsn: env.SENTRY_DSN,
      environment: env.STAGE,
      release: __APP_VERSION__,
    }),
});
