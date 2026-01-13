import * as Sentry from "@sentry/react-native";

import { integrations } from "@gmacko/config";

export interface SentryNativeConfig {
  dsn: string;
  environment?: string;
  debug?: boolean;
  tracesSampleRate?: number;
}

export function initSentryNative(config: SentryNativeConfig): void {
  if (!integrations.sentry) {
    return;
  }

  const environment = config.environment ?? "development";
  const isProduction = environment === "production";

  Sentry.init({
    dsn: config.dsn,
    environment,
    debug: config.debug ?? !isProduction,
    tracesSampleRate: config.tracesSampleRate ?? (isProduction ? 0.1 : 1.0),
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
