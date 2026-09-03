/* oxlint-disable no-console -- this shim is the console sink */
/**
 * TODO(migration Phase 6): delete with packages/logging's pino setup.
 *
 * Worker shim for `@gmacko/logging`. The real package builds a pino logger
 * with a `pino-pretty` worker-thread transport at module scope, which cannot
 * run in workerd. The Vite config swaps this module in for the ssr
 * environment only (see `workerShims` in vite.config.ts). It implements the
 * pino surface the app actually calls: `createLogger(ctx).level(obj?, msg)`.
 */
type Bindings = Record<string, unknown>;

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

type LogMethod = (objOrMsg: unknown, msg?: string) => void;

export interface Logger extends Record<LogLevel, LogMethod> {
  child(bindings: Bindings): Logger;
}

const sinks: Record<LogLevel, (...args: Array<unknown>) => void> = {
  trace: console.debug,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
  fatal: console.error,
};

function makeLogger(bindings: Bindings): Logger {
  const method =
    (level: LogLevel): LogMethod =>
    (objOrMsg, msg) => {
      const [fields, message] =
        typeof objOrMsg === "string"
          ? [{}, objOrMsg]
          : [(objOrMsg ?? {}) as Bindings, msg ?? ""];
      sinks[level](
        JSON.stringify({
          level,
          time: new Date().toISOString(),
          ...bindings,
          ...fields,
          msg: message,
        }),
      );
    };
  return {
    trace: method("trace"),
    debug: method("debug"),
    info: method("info"),
    warn: method("warn"),
    error: method("error"),
    fatal: method("fatal"),
    child: (more) => makeLogger({ ...bindings, ...more }),
  };
}

export function createLogger(context: LogContext = {}): Logger {
  return makeLogger(context);
}

export const logger: Logger = makeLogger({});
