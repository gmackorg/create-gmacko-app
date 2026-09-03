/**
 * Sentry for the legacy Next.js app over `@sentry/nextjs`. This is the
 * former `@gmacko/monitoring/web`, kept here because that entry now targets
 * the Workers web app (`@sentry/react` in the browser, `@sentry/cloudflare`
 * on the Worker). Deleted with apps/nextjs in Phase 8.
 */
import { integrations } from "@gmacko/config";
import * as Sentry from "@sentry/nextjs";

export interface SentryWebConfig {
  dsn: string;
  environment?: string;
  debug?: boolean;
  tracesSampleRate?: number;
  replaysOnErrorSampleRate?: number;
  replaysSessionSampleRate?: number;
}

function detectEnvironment(): string {
  if (process.env.DEPLOY_ENV) {
    return process.env.DEPLOY_ENV;
  }
  return process.env.NODE_ENV ?? "development";
}

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
    tracesSampleRate: config.tracesSampleRate ?? (isProduction ? 0.1 : 1.0),
    replaysOnErrorSampleRate: config.replaysOnErrorSampleRate ?? 1.0,
    replaysSessionSampleRate:
      config.replaysSessionSampleRate ?? (isProduction ? 0.1 : 1.0),
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
    ],
  });
}

export function captureException(error: unknown): void {
  if (!integrations.sentry) {
    // oxlint-disable-next-line no-console -- the fallback when Sentry is disabled
    console.error("[Sentry disabled]", error);
    return;
  }
  Sentry.captureException(error);
}

export function captureMessage(message: string): void {
  if (!integrations.sentry) {
    // oxlint-disable-next-line no-console -- the fallback when Sentry is disabled
    console.log("[Sentry disabled]", message);
    return;
  }
  Sentry.captureMessage(message);
}

export { Sentry };
