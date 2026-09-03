/**
 * The sink emits one JSON line per event with the pino-style shape
 * (`level`, `time`, `msg`, bound fields, redaction), from both the plain
 * `createLogger` surface and Effect's own `Effect.log*` under
 * `Logging.layer`; the Effect path also carries log annotations and the
 * current span's ids.
 */
import { Effect, Layer, Logger, ManagedRuntime } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configureLogging,
  createLogger,
  createRequestLogger,
  formatPrettyLine,
  generateRequestId,
  Logging,
  type LogRecord,
  redact,
} from "../index";

interface Line {
  readonly level: string;
  readonly time: string;
  readonly msg: string;
  readonly [key: string]: unknown;
}

const capture = () => {
  const lines: Line[] = [];
  const records: LogRecord[] = [];
  return {
    lines,
    records,
    sink: (line: string, record: LogRecord) => {
      lines.push(JSON.parse(line) as Line);
      records.push(record);
    },
  };
};

afterEach(() => {
  configureLogging({});
  vi.restoreAllMocks();
});

describe("createLogger", () => {
  it("emits a JSON line with level, time, msg and the bound fields", () => {
    const { lines, sink } = capture();
    configureLogging({ sink });
    const log = createLogger({ module: "payments" });
    log.info({ orderId: "o1", amount: 12 }, "checkout created");
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.level).toBe("info");
    expect(line.msg).toBe("checkout created");
    expect(line.module).toBe("payments");
    expect(line.orderId).toBe("o1");
    expect(line.amount).toBe(12);
    expect(new Date(line.time).toISOString()).toBe(line.time);
  });

  it("accepts a bare message and serialises errors", () => {
    const { lines, sink } = capture();
    configureLogging({ sink });
    const log = createLogger({ module: "email" });
    log.warn("provider disabled");
    log.error({ err: new Error("boom") }, "send failed");
    expect(lines[0]?.msg).toBe("provider disabled");
    expect(lines[0]?.level).toBe("warn");
    expect(lines[1]?.level).toBe("error");
    expect(lines[1]?.err).toMatchObject({ name: "Error", message: "boom" });
  });

  it("redacts the default paths at the top level and one level down", () => {
    const { lines, sink } = capture();
    configureLogging({ sink });
    createLogger().info(
      {
        password: "hunter2",
        token: "t",
        user: { apiKey: "k", name: "ann" },
        headers: { authorization: "Bearer x" },
      },
      "redaction",
    );
    const line = lines[0]!;
    expect(line.password).toBe("[REDACTED]");
    expect(line.token).toBe("[REDACTED]");
    expect(line.user).toEqual({ apiKey: "[REDACTED]", name: "ann" });
    // `authorization` is a top-level path only; nested it stays.
    expect(line.headers).toEqual({ authorization: "Bearer x" });
  });

  it("child loggers merge bindings; bindings() reports them", () => {
    const { lines, sink } = capture();
    configureLogging({ sink });
    const log = createLogger({ module: "api" });
    const child = log.child({ requestId: "r1" });
    expect(child.bindings()).toEqual({ module: "api", requestId: "r1" });
    child.debug("dropped at info");
    child.info("kept");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ module: "api", requestId: "r1" });
  });

  it("honours the configured level and base fields", () => {
    const { lines, sink } = capture();
    configureLogging({
      sink,
      level: "debug",
      base: { service: "gmacko-web", stage: "staging" },
    });
    createLogger().debug("now visible");
    expect(lines[0]).toMatchObject({
      level: "debug",
      service: "gmacko-web",
      stage: "staging",
    });
  });

  it("writes to the console, split by level, when no sink is given", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    createLogger({ module: "x" }).info("hello");
    createLogger({ module: "x" }).fatal("bye");
    expect(info).toHaveBeenCalledTimes(1);
    expect(JSON.parse(info.mock.calls[0]?.[0] as string)).toMatchObject({
      level: "info",
      msg: "hello",
      module: "x",
    });
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("request loggers bind the request id; ids are unique", () => {
    const { lines, sink } = capture();
    configureLogging({ sink });
    createRequestLogger("req_1", { path: "/x" }).info("in");
    expect(lines[0]).toMatchObject({ requestId: "req_1", path: "/x" });
    expect(generateRequestId()).not.toBe(generateRequestId());
    expect(generateRequestId()).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);
  });
});

describe("Logging.layer (Effect path)", () => {
  it("carries log annotations and the span ids onto the line", async () => {
    const { lines, sink } = capture();
    const runtime = ManagedRuntime.make(Logging.layer({ sink }));
    try {
      await runtime.runPromise(
        Effect.logInfo("handled", { status: 200 }).pipe(
          Effect.annotateLogs({ "request.id": "r9", "user.id": "u1" }),
          Effect.withSpan("posts.list"),
        ),
      );
    } finally {
      await runtime.dispose();
    }
    const line = lines[0]!;
    expect(line.msg).toBe("handled");
    expect(line.status).toBe(200);
    expect(line["request.id"]).toBe("r9");
    expect(line["user.id"]).toBe("u1");
    expect(line.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(line.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("withContext annotates, redaction applies, and the cause is attached", async () => {
    const { lines, records, sink } = capture();
    const runtime = ManagedRuntime.make(Logging.layer({ sink }));
    try {
      await runtime.runPromise(
        Effect.logError("db failed", { secret: "s3" }).pipe(
          Logging.withContext({ requestId: "r1" }),
        ),
      );
      await runtime.runPromise(
        Effect.fail(new Error("nope")).pipe(
          Effect.catchCause((cause) => Effect.logWarning("caught", cause)),
        ),
      );
    } finally {
      await runtime.dispose();
    }
    expect(lines[0]).toMatchObject({
      level: "error",
      requestId: "r1",
      secret: "[REDACTED]",
    });
    expect(lines[1]?.level).toBe("warn");
    expect(records[1]?.cause).toContain("nope");
  });

  it("replaces the default logger rather than adding to it", async () => {
    const { lines, sink } = capture();
    const seen: unknown[] = [];
    const other = Logger.make(({ message }) => {
      seen.push(message);
    });
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(Logger.layer([other]), Logging.layer({ sink })),
    );
    try {
      await runtime.runPromise(Effect.logInfo("once"));
    } finally {
      await runtime.dispose();
    }
    expect(lines).toHaveLength(1);
    expect(seen).toHaveLength(0);
  });
});

describe("formats", () => {
  it("pretty prints a plain readable line", () => {
    const line = formatPrettyLine({
      level: "info",
      time: "2026-09-03T10:11:12.000Z",
      msg: "started",
      fields: { module: "web", port: 3001, note: "two words" },
    });
    expect(line).toBe(
      '10:11:12 INFO  [web] started port=3001 note="two words"',
    );
  });

  it("redact handles exact paths", () => {
    expect(
      redact({ auth: { secret: "x", other: 1 }, b: 2 }, ["auth.secret"]),
    ).toEqual({ auth: { secret: "[REDACTED]", other: 1 }, b: 2 });
  });
});
