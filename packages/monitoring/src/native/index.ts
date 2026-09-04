import { integrations } from "@gmacko/config";
import * as Sentry from "@sentry/react-native";

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
 * Capture an exception; logs to the console when Sentry is off. Callers hand
 * over an `Error` — a React error boundary's `componentDidCatch` argument, or
 * the one it stored — not a raw caught value; parse a caught value into an
 * `Error` before reporting it so the Sentry issue has a type and a stack.
 */
export function captureExceptionNative(error: Error): void {
  if (!integrations.sentry) {
    console.error("[Sentry disabled]", error);
    return;
  }
  Sentry.captureException(error);
}

export { Sentry as SentryNative };
