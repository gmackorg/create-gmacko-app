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

/**
 * What a log field may hold: everything `JSON.stringify` writes unchanged,
 * plus the three shapes this module converts itself — an `Error` becomes its
 * fields, a `Date` its ISO string, a `bigint` its decimal string.
 *
 * A class instance, a function, a symbol or a circular object is *not* a log
 * value. That is the point of naming the type: the sink serialises to JSON,
 * so a value it cannot represent is a bug at the call site, not at the sink.
 */
export type LogValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined
  | Date
  | Error
  | ReadonlyArray<LogValue>
  | { readonly [key: string]: LogValue };

/** The fields carried by one log event. */
export interface LogFields {
  readonly [key: string]: LogValue;
}

/**
 * A field bag being built. The published contract is the readonly
 * `LogFields`; only the code that assembles a bag needs to write to one.
 */
interface MutableLogFields {
  [key: string]: LogValue;
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  [key: string]: LogValue;
}

/** One emitted event, before serialisation. */
export interface LogRecord {
  readonly level: LogLevel;
  readonly time: string;
  readonly msg: string;
  readonly fields: LogFields;
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
   * a top-level field; `*` in a path matches any one field at that depth
   * (`*.name` is that field one level down); a dotted path (`a.b.c`) is
   * followed segment by segment, so it matches at any depth. Defaults to
   * `defaultRedactPaths`.
   */
  readonly redact?: ReadonlyArray<string> | undefined;
  /** Fields on every line (service, version, stage). */
  readonly base?: LogFields | undefined;
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
  // A logged `headers` object (request or response) carries credentials
  // under these names; `*` covers `headers`, `req.headers`... one level down.
  "*.authorization",
  "*.cookie",
  "*.set-cookie",
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
// Classifying a value
//
// `LogValue` is an untagged union, so redaction and rendering need one place
// that turns a member of it into a named case. These three predicates are
// that place: everything below them branches on the narrowed type instead of
// re-testing the representation. They read the runtime tag
// (`Object.prototype.toString`), which is total — it never throws, and unlike
// a property probe it separates `null`, arrays, dates and errors from a field
// bag in a single comparison.
// ---------------------------------------------------------------------------

/** A field bag: the one shape redaction and field-merging descend into. */
const isFieldBag = (value: LogValue): value is LogFields =>
  Object.prototype.toString.call(value) === "[object Object]";

/** A primitive string; boxed `String` objects are not `LogValue`s. */
const isText = (value: LogValue): value is string =>
  Object.prototype.toString.call(value) === "[object String]";

/** A `bigint` — the one `LogValue` `JSON.stringify` refuses to serialise. */
const isBigInt = (value: LogValue): value is bigint =>
  Object.prototype.toString.call(value) === "[object BigInt]";

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * A path trie: each node's children are keyed by the field name (or `*`
 * for any name); `hit` marks the end of a path.
 */
interface PathNode {
  hit: boolean;
  readonly children: Map<string, PathNode>;
}

const WILDCARD = "*";

const buildTrie = (paths: ReadonlyArray<string>): PathNode => {
  const root: PathNode = { hit: false, children: new Map() };
  for (const path of paths) {
    if (path.length === 0) continue;
    let node = root;
    for (const segment of path.split(".")) {
      let next = node.children.get(segment);
      if (next === undefined) {
        next = { hit: false, children: new Map() };
        node.children.set(segment, next);
      }
      node = next;
    }
    node.hit = true;
  }
  return root;
};

/** The trie nodes reached from `nodes` by one field `name` (exact or `*`). */
const step = (
  nodes: ReadonlyArray<PathNode>,
  name: string,
): ReadonlyArray<PathNode> => {
  const out: PathNode[] = [];
  for (const node of nodes) {
    const exact = node.children.get(name);
    if (exact !== undefined) out.push(exact);
    const any = node.children.get(WILDCARD);
    if (any !== undefined) out.push(any);
  }
  return out;
};

const redactWith = (
  fields: LogFields,
  nodes: ReadonlyArray<PathNode>,
): LogFields => {
  const out: MutableLogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    const here = step(nodes, key);
    if (here.some((node) => node.hit)) {
      out[key] = REDACTED;
    } else if (
      isFieldBag(value) &&
      here.some((node) => node.children.size > 0)
    ) {
      out[key] = redactWith(value, here);
    } else {
      out[key] = value;
    }
  }
  return out;
};

/**
 * A copy of `fields` with the redacted paths replaced. Every dot of a path
 * is followed (`req.headers.authorization` reaches three levels down); a
 * prefix that is missing or not a plain object is left as it is. Errors,
 * dates and arrays are never descended into.
 */
export const redact = (
  fields: LogFields,
  paths: ReadonlyArray<string>,
): LogFields => redactWith(fields, [buildTrie(paths)]);

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

/**
 * An `Error` reduced to log fields. `stack` and `cause` are always present as
 * keys and `JSON.stringify` drops the ones that are `undefined`, so the
 * emitted line carries them only when the error does.
 */
export type LoggedError = {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly cause?: LogValue;
};

const errorToJson = (error: Error): LoggedError => ({
  name: error.name,
  message: error.message,
  stack: error.stack,
  // SAFETY: the standard library types `Error.cause` as `unknown` because any
  // value can be thrown, but the field reached this serialiser through
  // `LogFields`, whose value contract is `LogValue`. Where a caller breaks
  // that contract the cost is a key `JSON.stringify` omits (a function, a
  // symbol), never a throw — `toLogJson` inspects nothing the value must have.
  cause: "cause" in error ? toLogJson(error.cause as LogValue) : undefined,
});

/**
 * The `LogValue` `JSON.stringify` can emit: an `Error` becomes its fields, a
 * `bigint` its decimal string (`JSON.stringify` throws on one). A `Date`
 * needs nothing — `JSON.stringify` calls its `toJSON` before the replacer.
 */
const toLogJson = (value: LogValue): LogValue => {
  if (value instanceof Error) return errorToJson(value);
  if (isBigInt(value)) return value.toString();
  return value;
};

const replacer = (_key: string, value: LogValue): LogValue => toLogJson(value);

/** The keys the record itself owns; a field of the same name is dropped, never spoofs them. */
const CORE_KEYS = new Set([
  "level",
  "time",
  "msg",
  "traceId",
  "spanId",
  "cause",
]);

/** The JSON line for a record: `{"level","time","msg",...fields,"traceId"?,"spanId"?,"cause"?}`. */
export const formatJsonLine = (record: LogRecord): string => {
  const line: MutableLogFields = {
    level: record.level,
    time: record.time,
    msg: record.msg,
  };
  for (const [key, value] of Object.entries(record.fields)) {
    if (!CORE_KEYS.has(key)) line[key] = value;
  }
  if (record.traceId !== undefined) line.traceId = record.traceId;
  if (record.spanId !== undefined) line.spanId = record.spanId;
  if (record.cause !== undefined) line.cause = record.cause;
  return JSON.stringify(line, replacer);
};

const formatValue = (value: LogValue): string => {
  if (isText(value)) return /\s/.test(value) ? `"${value}"` : value;
  if (value instanceof Error)
    return value.stack ?? `${value.name}: ${value.message}`;
  return JSON.stringify(value, replacer) ?? String(value);
};

/** `HH:MM:ss LEVEL [module] msg key=value ...` — plain text, no colours. */
export const formatPrettyLine = (record: LogRecord): string => {
  const { module: moduleName, ...rest } = record.fields;
  const clock = record.time.slice(11, 19);
  const head = `${clock} ${record.level.toUpperCase().padEnd(5)}`;
  const scope = isText(moduleName) ? ` [${moduleName}]` : "";
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

/** What one call to `Effect.log*` said, once its message list is sorted out. */
interface SplitMessage {
  readonly msg: string;
  readonly fields: LogFields;
}

/**
 * Splits Effect's message list: the first string is the message, every
 * field bag contributes fields, anything else is collected under `data`.
 *
 * This is the package's I/O boundary. `Logger.make` hands over whatever the
 * caller passed to `Effect.log*`, so `unknown` is the honest input type at
 * exactly this one signature; the `SplitMessage` it returns is what the rest
 * of the module works with.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters
const splitMessage = (message: unknown): SplitMessage => {
  // SAFETY: the message list holds whatever the caller passed to
  // `Effect.log*`, and this package's published contract is that a logged
  // value is a `LogValue`. Breaking it costs a key that `toLogJson` +
  // `JSON.stringify` drop (a function, a symbol) — the classification below
  // is by runtime tag, so it inspects nothing the value must have.
  const parts = (
    Array.isArray(message) ? message : [message]
  ) as ReadonlyArray<LogValue>;
  let msg: string | undefined;
  const fields: MutableLogFields = {};
  const rest: LogValue[] = [];
  for (const part of parts) {
    if (isText(part) && msg === undefined) msg = part;
    else if (isFieldBag(part)) Object.assign(fields, part);
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
    // SAFETY: Effect types log annotations as `ReadonlyRecord<string,
    // unknown>`. They are the values the app attached with
    // `Effect.annotateLogs`, and `Logging.withContext` — the entry point this
    // package publishes for that — types them as `LogContext`, whose values
    // are `LogValue`s. An annotation attached some other way is serialised by
    // the same `toLogJson` path as any field, so the worst case is a dropped
    // key rather than a throw.
    const annotations = fiber.getRef(
      References.CurrentLogAnnotations,
    ) as LogFields;
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

/**
 * pino's two call shapes: `log.info("sent")`, or `log.info({ userId }, "sent")`
 * when there are fields to carry.
 */
type LogMethod = (
  fieldsOrMessage: LogFields | string,
  message?: string,
) => void;

export interface Logger extends Record<LogLevel, LogMethod> {
  /** A logger with more bound fields. */
  child(bindings: LogContext): Logger;
  /** The fields bound to this logger. */
  bindings(): LogFields;
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

const makePlainLogger = (bindings: LogFields): Logger => {
  const method =
    (level: LogLevel): LogMethod =>
    (fieldsOrMessage, message) => {
      const emit = (fields: LogFields, text: string): void => {
        runtime.runSync(
          Effect.logWithLevel(toSeverity[level])(text, fields).pipe(
            Effect.annotateLogs(bindings),
          ),
        );
      };
      if (isText(fieldsOrMessage)) emit({}, fieldsOrMessage);
      else emit(fieldsOrMessage, message ?? "");
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
