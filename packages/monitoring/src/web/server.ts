/**
 * `@gmacko/monitoring/web/server`: Sentry for the Worker (`@sentry/cloudflare`).
 * `withSentry(options, handler)` wraps the exported handler so `fetch`,
 * `scheduled` and queue handlers get an isolation scope, error capture and
 * a flush on `waitUntil`. With no DSN the client is a no-op and the
 * handlers run unchanged. Nothing here reads `process.env` or bindings:
 * the app passes what it read from its validated config.
 */
import { integrations } from "@gmacko/config";
import * as Sentry from "@sentry/cloudflare";

export interface SentryWorkerConfig {
  dsn: string | undefined;
  /** Deployment stage; defaults to `development`. */
  environment?: string | undefined;
  /** Release identifier (the build version). */
  release?: string | undefined;
  /** Sentry's own tracing; off by default because the Effect OTLP tracer owns spans. */
  tracesSampleRate?: number | undefined;
}

/**
 * Options for `withSentry`. Tracing stays with the Effect OTLP tracer,
 * hence `skipOpenTelemetrySetup`; the DSN is dropped when the integration
 * is off so the wrapper is a no-op.
 */
export function sentryWorkerOptions(
  config: SentryWorkerConfig,
): Sentry.CloudflareOptions {
  return {
    dsn: integrations.sentry ? config.dsn : undefined,
    environment: config.environment ?? "development",
    release: config.release,
    skipOpenTelemetrySetup: true,
    tracesSampleRate: config.tracesSampleRate ?? 0,
    sendDefaultPii: false,
  };
}

/**
 * Capture an exception from the Worker; logs to the console when Sentry is
 * off. Takes an `Error`: a `catch` binding is `unknown`, so turn it into one
 * at the boundary that caught it, where the expected failure is known.
 */
export function captureException(error: Error): void {
  if (!integrations.sentry) {
    // oxlint-disable-next-line no-console -- the fallback when Sentry is disabled
    console.error("[Sentry disabled]", error);
    return;
  }
  Sentry.captureException(error);
}

export const { withSentry } = Sentry;
export { Sentry };
