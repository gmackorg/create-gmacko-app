/**
 * `makeWorker(parts)`: the Worker's exported handler from its parts, so the
 * wrapper can be tested on workerd without TanStack Start's server entry
 * (which only the Cloudflare Vite plugin can build). `worker.ts` is the
 * one-line composition with the real parts.
 *
 * - `fetch` is passed through; Sentry instruments it (isolation scope,
 *   error capture, flush on `waitUntil`).
 * - `scheduled` runs `parts.scheduled` and then, success or failure, hands
 *   `parts.flush` (the telemetry flush) to the controller's `waitUntil`,
 *   so a cron tick's spans and logs are exported even though nothing else
 *   keeps the isolate alive afterwards.
 * - `sentry(env)` builds the SDK options from the bindings; with no DSN the
 *   client is a no-op and both handlers run unchanged.
 */
import type { Sentry } from "@gmacko/monitoring/web/server";
import { withSentry } from "@gmacko/monitoring/web/server";

export interface WorkerParts<Env> {
  readonly fetch: (
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ) => Response | Promise<Response>;
  /** The cron tick; runs on the app's runtime. */
  readonly scheduled: (controller: ScheduledController) => Promise<void>;
  /** Drains the telemetry exporters; always settles (`flushTelemetry`). */
  readonly flush: () => Promise<void>;
  readonly sentry: (env: Env) => Sentry.CloudflareOptions | undefined;
}

export const makeWorker = <Env>(
  parts: WorkerParts<Env>,
): ExportedHandler<Env> =>
  withSentry<Env>(parts.sentry, {
    fetch: (request, env, ctx) => parts.fetch(request, env, ctx),
    scheduled: async (controller, _env, ctx) => {
      try {
        await parts.scheduled(controller);
      } finally {
        ctx.waitUntil(parts.flush());
      }
    },
  } satisfies ExportedHandler<Env>);
