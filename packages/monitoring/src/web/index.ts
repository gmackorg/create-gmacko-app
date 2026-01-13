import * as Sentry from "@sentry/nextjs";

import { integrations } from "@gmacko/config";

export interface SentryWebConfig {
  dsn: string;
  environment?: string;
  debug?: boolean;
}

/**
 * Initialize Sentry for Next.js (web)
 * Only initializes if sentry integration is enabled
 */
export function initSentryWeb(config: SentryWebConfig): void {
  if (!integrations.sentry) {
    return;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment ?? process.env.NODE_ENV,
    debug: config.debug ?? false,

    // Recommended settings for Next.js
    tracesSampleRate: 1.0,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
  });
}

/**
 * Sentry error boundary wrapper for React components
 */
export const SentryErrorBoundary = Sentry.ErrorBoundary;

/**
 * Capture exception manually
 */
export function captureException(error: unknown): void {
  if (!integrations.sentry) {
    console.error("[Sentry disabled]", error);
    return;
  }
  Sentry.captureException(error);
}

/**
 * Capture message manually
 */
export function captureMessage(message: string): void {
  if (!integrations.sentry) {
    console.log("[Sentry disabled]", message);
    return;
  }
  Sentry.captureMessage(message);
}

export { Sentry };
