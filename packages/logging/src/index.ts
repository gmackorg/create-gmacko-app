/**
 * `@gmacko/logging`: one JSON line per event on the console, which Workers
 * Logs and Logpush ingest, over Effect's logger.
 *
 * Two ways in, one sink:
 *
 * - Effect code logs with `Effect.logInfo(...)` and friends; `Logging.layer`
 *   installs the sink and the minimum level, and `Effect.annotateLogs`
 *   (request id, user id, endpoint) lands on every line the fiber writes.
 * - Plain code (a package with no Effect boundary, a legacy Node app) keeps
 *   the pino-style surface: `createLogger({ module }).info(fields, msg)`.
 *   Each call runs through the same Effect logger on a private runtime, so
 *   the line shape and the redaction are identical; what it cannot see is
 *   the annotations of an enclosing Effect fiber.
 *
 * Nothing here reads `process.env`: the format and level are options,
 * chosen by the runtime that installs the layer (the Worker uses JSON; a
 * Node dev server may pick `pretty`). No worker threads, no transports.
 */
import {
  Cause,
  Effect,
  type LogLevel as EffectLogLevel,
  Layer,
  Logger,
  ManagedRuntime,
  References,
} from "effect";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

/** One emitted event, before serialisation. */
export interface LogRecord {
  readonly level: LogLevel;
  readonly time: string;
  readonly msg: string;
  readonly fields: Readonly<Record<string, unknown>>;
  /** Present when the event was logged under a span. */
  readonly traceId?: string | undefined;
  readonly spanId?: string | undefined;
  /** Effect's pretty-printed cause, when one was attached. */
  readonly cause?: string | undefined;
}

export interface LoggingOptions {
  /** `json` (default): one JSON object per line. `pretty`: a plain readable line for a terminal. */
  readonly format?: "json" | "pretty" | undefined;
  /** Events below this level are dropped. Default `info`. */
  readonly level?: LogLevel | undefined;
  /**
   * Fields whose values are replaced with `[REDACTED]`. A bare name matches
   * a top-level field; `*.name` matches that field one level down; `a.b`
   * matches the exact path. Defaults to `defaultRedactPaths`.
   */
  readonly redact?: ReadonlyArray<string> | undefined;
  /** Fields on every line (service, version, stage). */
  readonly base?: Readonly<Record<string, unknown>> | undefined;
  /** Where lines go; defaults to the console, split by level. */
  readonly sink?: ((line: string, record: LogRecord) => void) | undefined;
}

export const defaultRedactPaths: ReadonlyArray<string> = [
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
];

const REDACTED = "[REDACTED]";

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

const toSeverity: Record<LogLevel, EffectLogLevel.Severity> = {
  trace: "Trace",
  debug: "Debug",
  info: "Info",
  warn: "Warn",
  error: "Error",
  fatal: "Fatal",
};

const fromEffectLevel = (level: EffectLogLevel.LogLevel): LogLevel => {
  switch (level) {
    case "Trace":
      return "trace";
    case "Debug":
      return "debug";
    case "Warn":
      return "warn";
    case "Error":
      return "error";
    case "Fatal":
      return "fatal";
    default:
      return "info";
  }
};

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Error) &&
  !(value instanceof Date);

/**
 * A copy of `fields` with the redacted paths replaced. Errors and dates are
 * left as they are; only plain objects are descended into.
 */
export const redact = (
  fields: Readonly<Record<string, unknown>>,
  paths: ReadonlyArray<string>,
): Record<string, unknown> => {
  const top = new Set<string>();
  const nested = new Set<string>();
  const exact = new Map<string, Set<string>>();
  for (const path of paths) {
    const dot = path.indexOf(".");
    if (dot === -1) top.add(path);
    else if (path.startsWith("*.")) nested.add(path.slice(2));
    else {
      const parent = path.slice(0, dot);
      const child = path.slice(dot + 1);
      let set = exact.get(parent);
      if (set === undefined) {
        set = new Set();
        exact.set(parent, set);
      }
      set.add(child);
    }
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (top.has(key)) {
      out[key] = REDACTED;
      continue;
    }
    if (isPlainObject(value)) {
      const copy: Record<string, unknown> = {};
      const exactHere = exact.get(key);
      for (const [name, inner] of Object.entries(value)) {
        copy[name] =
          nested.has(name) || exactHere?.has(name) ? REDACTED : inner;
      }
      out[key] = copy;
      continue;
    }
    out[key] = value;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

const errorToJson = (error: Error): Record<string, unknown> => ({
  name: error.name,
  message: error.message,
  ...(error.stack === undefined ? {} : { stack: error.stack }),
  ...("cause" in error && error.cause !== undefined
    ? { cause: toJsonValue(error.cause) }
    : {}),
});

const toJsonValue = (value: unknown): unknown => {
  if (value instanceof Error) return errorToJson(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol" || typeof value === "function")
    return String(value);
  return value;
};

const replacer = (_key: string, value: unknown): unknown => toJsonValue(value);

/** The JSON line for a record: `{"level","time","msg",...fields,"traceId"?,"spanId"?,"cause"?}`. */
export const formatJsonLine = (record: LogRecord): string =>
  JSON.stringify(
    {
      level: record.level,
      time: record.time,
      msg: record.msg,
      ...record.fields,
      ...(record.traceId === undefined ? {} : { traceId: record.traceId }),
      ...(record.spanId === undefined ? {} : { spanId: record.spanId }),
      ...(record.cause === undefined ? {} : { cause: record.cause }),
    },
    replacer,
  );

const formatValue = (value: unknown): string => {
  if (typeof value === "string") return /\s/.test(value) ? `"${value}"` : value;
  if (value instanceof Error)
    return value.stack ?? `${value.name}: ${value.message}`;
  return JSON.stringify(value, replacer) ?? String(value);
};

/** `HH:MM:ss LEVEL [module] msg key=value ...` — plain text, no colours. */
export const formatPrettyLine = (record: LogRecord): string => {
  const { module: moduleName, ...rest } = record.fields;
  const clock = record.time.slice(11, 19);
  const head = `${clock} ${record.level.toUpperCase().padEnd(5)}`;
  const scope = typeof moduleName === "string" ? ` [${moduleName}]` : "";
  const pairs = Object.entries(rest)
    .map(([key, value]) => ` ${key}=${formatValue(value)}`)
    .join("");
  const cause = record.cause === undefined ? "" : `\n${record.cause}`;
  return `${head}${scope} ${record.msg}${pairs}${cause}`;
};

/* oxlint-disable no-console -- this sink is the console */
const consoleSink = (line: string, record: LogRecord): void => {
  switch (record.level) {
    case "error":
    case "fatal":
      console.error(line);
      return;
    case "warn":
      console.warn(line);
      return;
    default:
      console.info(line);
  }
};
/* oxlint-enable no-console */

// ---------------------------------------------------------------------------
// The Effect logger
// ---------------------------------------------------------------------------

/**
 * Splits Effect's message list: the first string is the message, every
 * plain object contributes fields, anything else is collected under `data`.
 */
const splitMessage = (
  message: unknown,
): { readonly msg: string; readonly fields: Record<string, unknown> } => {
  const parts = Array.isArray(message) ? message : [message];
  let msg: string | undefined;
  const fields: Record<string, unknown> = {};
  const rest: unknown[] = [];
  for (const part of parts) {
    if (typeof part === "string" && msg === undefined) msg = part;
    else if (isPlainObject(part)) Object.assign(fields, part);
    else if (part instanceof Error && !("err" in fields)) fields.err = part;
    else rest.push(part);
  }
  if (rest.length > 0) fields.data = rest.length === 1 ? rest[0] : rest;
  return { msg: msg ?? "", fields };
};

/** The sink as an Effect `Logger`, for `Logger.layer`. */
export const makeLogger = (
  options: LoggingOptions = {},
): Logger.Logger<unknown, void> => {
  const format = options.format ?? "json";
  const paths = options.redact ?? defaultRedactPaths;
  const base = options.base ?? {};
  const sink = options.sink ?? consoleSink;
  const render = format === "pretty" ? formatPrettyLine : formatJsonLine;
  return Logger.make(({ message, logLevel, cause, fiber, date }) => {
    const { msg, fields } = splitMessage(message);
    const annotations = fiber.getRef(References.CurrentLogAnnotations);
    const span = fiber.currentSpan;
    const record: LogRecord = {
      level: fromEffectLevel(logLevel),
      time: date.toISOString(),
      msg,
      fields: redact({ ...base, ...annotations, ...fields }, paths),
      traceId: span?.traceId,
      spanId: span?.spanId,
      cause: cause.reasons.length > 0 ? Cause.pretty(cause) : undefined,
    };
    sink(render(record), record);
  });
};

/**
 * `Logging.layer(options)`: replaces the default loggers with this sink and
 * sets the minimum level. An exporter that should also receive the lines
 * (the OTLP logger) is layered on top with `mergeWithExisting`.
 */
export const Logging = {
  layer: (options: LoggingOptions = {}): Layer.Layer<never> =>
    Layer.mergeAll(
      Logger.layer([makeLogger(options)], { mergeWithExisting: false }),
      Layer.succeed(References.MinimumLogLevel)(
        toSeverity[options.level ?? "info"],
      ),
    ),
  /** Request/user context for every line the effect logs. */
  withContext:
    (context: LogContext) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
      Effect.annotateLogs(effect, context),
};

// ---------------------------------------------------------------------------
// The plain (non-Effect) surface
// ---------------------------------------------------------------------------

type LogMethod = (objOrMsg: unknown, msg?: string) => void;

export interface Logger extends Record<LogLevel, LogMethod> {
  /** A logger with more bound fields. */
  child(bindings: LogContext): Logger;
  /** The fields bound to this logger. */
  bindings(): Readonly<Record<string, unknown>>;
}

let runtime = ManagedRuntime.make(Logging.layer());

/**
 * Chooses the format, level and redaction for every `createLogger` logger
 * (the Effect path is configured by providing `Logging.layer` instead).
 * Node entry points that want readable output call
 * `configureLogging({ format: "pretty", level: "debug" })` once at start.
 */
export const configureLogging = (options: LoggingOptions): void => {
  const previous = runtime;
  runtime = ManagedRuntime.make(Logging.layer(options));
  void previous.dispose();
};

const makePlainLogger = (
  bindings: Readonly<Record<string, unknown>>,
): Logger => {
  const method =
    (level: LogLevel): LogMethod =>
    (objOrMsg, msg) => {
      const [fields, message] =
        typeof objOrMsg === "string"
          ? [{}, objOrMsg]
          : [(objOrMsg ?? {}) as Record<string, unknown>, msg ?? ""];
      runtime.runSync(
        Effect.logWithLevel(toSeverity[level])(message, fields).pipe(
          Effect.annotateLogs(bindings),
        ),
      );
    };
  return {
    trace: method("trace"),
    debug: method("debug"),
    info: method("info"),
    warn: method("warn"),
    error: method("error"),
    fatal: method("fatal"),
    child: (more) => makePlainLogger({ ...bindings, ...more }),
    bindings: () => bindings,
  };
};

/** A logger with `context` bound to every line (`{ module: "payments" }`). */
export const createLogger = (context: LogContext = {}): Logger =>
  makePlainLogger(context);

/** The root logger, no bound fields. */
export const logger: Logger = makePlainLogger({});

/** A logger bound to a request id (plus anything else known about the request). */
export const createRequestLogger = (
  requestId: string,
  additionalContext: LogContext = {},
): Logger => createLogger({ requestId, ...additionalContext });

/** A unique request id: `req_<time36>_<random>`. */
export const generateRequestId = (): string =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
