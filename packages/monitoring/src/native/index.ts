import * as Sentry from "@sentry/react-native";

import { integrations } from "@gmacko/config";

export interface SentryNativeConfig {
  dsn: string;
  environment?: string;
  debug?: boolean;
}

/**
 * Initialize Sentry for React Native / Expo
 * Only initializes if sentry integration is enabled
 */
export function initSentryNative(config: SentryNativeConfig): void {
  if (!integrations.sentry) {
    return;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    debug: config.debug ?? false,

    // Recommended settings
    tracesSampleRate: 1.0,
  });
}

/**
 * Wrap React Native root component with Sentry
 */
export const withSentry = Sentry.wrap;

/**
 * Capture exception manually
 */
export function captureExceptionNative(error: unknown): void {
  if (!integrations.sentry) {
    console.error("[Sentry disabled]", error);
    return;
  }
  Sentry.captureException(error);
}

export { Sentry as SentryNative };
