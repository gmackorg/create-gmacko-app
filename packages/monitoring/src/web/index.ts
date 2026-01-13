import * as Sentry from "@sentry/nextjs";

import { integrations } from "@gmacko/config";

export interface SentryWebConfig {
  dsn: string;
  environment?: string;
  debug?: boolean;
  tracesSampleRate?: number;
  replaysOnErrorSampleRate?: number;
  replaysSessionSampleRate?: number;
}

/**
 * Detect environment from Vercel or fallback to NODE_ENV
 */
function detectEnvironment(): string {
  // Vercel provides VERCEL_ENV: 'production' | 'preview' | 'development'
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === "preview"
      ? "staging"
      : process.env.VERCEL_ENV;
  }
  return process.env.NODE_ENV ?? "development";
}

/**
 * Initialize Sentry for Next.js (web)
 * Only initializes if sentry integration is enabled
 */
export function initSentryWeb(config: SentryWebConfig): void {
  if (!integrations.sentry) {
    return;
  }

  const environment = config.environment ?? detectEnvironment();
  const isProduction = environment === "production";

  Sentry.init({
    dsn: config.dsn,
    environment,
    debug: config.debug ?? !isProduction,

    // Sample rates - lower in production for cost
    tracesSampleRate: config.tracesSampleRate ?? (isProduction ? 0.1 : 1.0),
    replaysOnErrorSampleRate: config.replaysOnErrorSampleRate ?? 1.0,
    replaysSessionSampleRate:
      config.replaysSessionSampleRate ?? (isProduction ? 0.1 : 1.0),

    // Filter out noisy errors
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
    ],
  });
}

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
