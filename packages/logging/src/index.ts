import pino from "pino";

import { integrations } from "@gmacko/config";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

const isDev = process.env.NODE_ENV !== "production";

/**
 * Create the base pino logger instance
 */
function createBaseLogger() {
  return pino({
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),

    // Add standard fields
    base: {
      env: process.env.NODE_ENV ?? "development",
      service: process.env.SERVICE_NAME ?? "gmacko-app",
      version: process.env.npm_package_version ?? "0.0.0",
    },

    // Timestamp format
    timestamp: pino.stdTimeFunctions.isoTime,

    // Pretty print in development
    transport: isDev
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        }
      : undefined,

    // Redact sensitive fields
    redact: {
      paths: [
        "password",
        "secret",
        "token",
        "apiKey",
        "authorization",
        "cookie",
        "*.password",
        "*.secret",
        "*.token",
        "*.apiKey",
      ],
      censor: "[REDACTED]",
    },
  });
}

const baseLogger = createBaseLogger();

/**
 * Create a child logger with additional context
 */
export function createLogger(context: LogContext = {}) {
  return baseLogger.child(context);
}

/**
 * Default logger instance
 */
export const logger = baseLogger;

/**
 * Request logger middleware context
 */
export function createRequestLogger(
  requestId: string,
  additionalContext: LogContext = {},
) {
  return createLogger({
    requestId,
    ...additionalContext,
  });
}

/**
 * Log and capture error to Sentry if enabled
 */
export function logError(
  error: Error,
  context: LogContext = {},
  captureToSentry = true,
) {
  const errorLogger = createLogger(context);

  errorLogger.error(
    {
      err: error,
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    },
    error.message,
  );

  // Capture to Sentry if enabled
  if (captureToSentry && integrations.sentry) {
    try {
      // Dynamic import to avoid loading Sentry if not enabled
      import("@sentry/nextjs").then(({ captureException }) => {
        captureException(error, {
          extra: context,
        });
      });
    } catch {
      // Sentry not available, just log
    }
  }
}

/**
 * Log API request/response
 */
export function logApiRequest(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  context: LogContext = {},
) {
  const requestLogger = createLogger(context);

  const level: LogLevel =
    statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

  requestLogger[level](
    {
      method,
      path,
      statusCode,
      durationMs,
    },
    `${method} ${path} ${statusCode} ${durationMs}ms`,
  );
}

/**
 * Log database query
 */
export function logDbQuery(
  query: string,
  durationMs: number,
  context: LogContext = {},
) {
  const dbLogger = createLogger({ ...context, component: "database" });

  dbLogger.debug(
    {
      query: query.substring(0, 200), // Truncate long queries
      durationMs,
    },
    `DB query: ${durationMs}ms`,
  );
}

export type { Logger } from "pino";
export { pino };
