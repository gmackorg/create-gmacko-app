/**
 * `@gmacko/monitoring/web`: Sentry for the browser side of the web app
 * (`@sentry/react`). The Worker side is `@gmacko/monitoring/web/server`
 * (`@sentry/cloudflare`); the two are separate entry points so the Workers
 * SDK never lands in the browser bundle. Nothing here reads `process.env`:
 * the environment and release are options, taken from the app's validated
 * config.
 */
import { integrations } from "@gmacko/config";
import * as Sentry from "@sentry/react";

export interface SentryWebConfig {
  dsn: string;
  /** Deployment stage; defaults to `development`. */
  environment?: string | undefined;
  /** Release identifier (the build version). */
  release?: string | undefined;
  debug?: boolean | undefined;
  tracesSampleRate?: number | undefined;
  replaysOnErrorSampleRate?: number | undefined;
  replaysSessionSampleRate?: number | undefined;
}

/** Errors every browser emits that carry no signal. */
export const ignoredBrowserErrors: ReadonlyArray<string> = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
];

/**
 * Initialises the browser SDK. A no-op when the Sentry integration is off
 * or no DSN is configured, so the app renders unchanged without one.
 */
export function initSentryWeb(config: SentryWebConfig): void {
  if (!integrations.sentry || !config.dsn) {
    return;
  }

  const environment = config.environment ?? "development";
  const isProduction = environment === "production";

  Sentry.init({
    dsn: config.dsn,
    environment,
    release: config.release,
    debug: config.debug ?? false,
    sendDefaultPii: false,
    tracesSampleRate: config.tracesSampleRate ?? (isProduction ? 0.1 : 1.0),
    replaysOnErrorSampleRate: config.replaysOnErrorSampleRate ?? 1.0,
    replaysSessionSampleRate:
      config.replaysSessionSampleRate ?? (isProduction ? 0.1 : 1.0),
    ignoreErrors: [...ignoredBrowserErrors],
  });
}

/** Capture an exception; logs to the console when Sentry is off. */
export function captureException(error: unknown): void {
  if (!integrations.sentry) {
    // oxlint-disable-next-line no-console -- the fallback when Sentry is disabled
    console.error("[Sentry disabled]", error);
    return;
  }
  Sentry.captureException(error);
}

/** Capture a message; logs to the console when Sentry is off. */
export function captureMessage(message: string): void {
  if (!integrations.sentry) {
    // oxlint-disable-next-line no-console -- the fallback when Sentry is disabled
    console.log("[Sentry disabled]", message);
    return;
  }
  Sentry.captureMessage(message);
}

/** A route-level error boundary for the router's `errorComponent`. */
export const SentryErrorBoundary = Sentry.ErrorBoundary;

export { Sentry };
