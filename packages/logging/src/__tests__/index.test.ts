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
  formatJsonLine,
  formatPrettyLine,
  generateRequestId,
  Logging,
  type LogRecord,
  type LogValue,
  redact,
} from "../index";

/** One parsed JSON line, as the sink wrote it. */
interface Line {
  readonly level: string;
  readonly time: string;
  readonly msg: string;
  readonly [key: string]: LogValue;
}

const capture = () => {
  const lines: Line[] = [];
  const records: LogRecord[] = [];
  return {
    lines,
    records,
    sink: (line: string, record: LogRecord) => {
      // SAFETY: a sink is only ever handed the rendered line, and these suites
      // never set `format: "pretty"`, so `line` is `formatJsonLine` output:
      // `JSON.stringify` of an object whose first three keys are `level`,
      // `time` and `msg`, all strings.
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
    // `*.authorization` (and `*.cookie`, `*.set-cookie`) are defaults: a
    // logged headers object never carries a credential one level down.
    expect(line.headers).toEqual({ authorization: "[REDACTED]" });
  });

  it("redacts cookies and set-cookie one level down by default", () => {
    const { lines, sink } = capture();
    configureLogging({ sink });
    createLogger().info(
      {
        headers: { cookie: "session=abc", "set-cookie": "s=1", host: "x" },
        cookie: "top",
      },
      "cookies",
    );
    expect(lines[0]?.headers).toEqual({
      cookie: "[REDACTED]",
      "set-cookie": "[REDACTED]",
      host: "x",
    });
    expect(lines[0]?.cookie).toBe("[REDACTED]");
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
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({
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

  it("redact descends every dot of a deep path, and `*` matches one level", () => {
    expect(
      redact(
        {
          req: { headers: { authorization: "Bearer x", host: "h" }, id: 1 },
          other: { headers: { authorization: "keep" } },
          deep: { a: { b: { c: "x", d: "y" } } },
        },
        ["req.headers.authorization", "*.a.b.c"],
      ),
    ).toEqual({
      req: { headers: { authorization: "[REDACTED]", host: "h" }, id: 1 },
      other: { headers: { authorization: "keep" } },
      deep: { a: { b: { c: "[REDACTED]", d: "y" } } },
    });
  });

  it("redact leaves a missing or non-object prefix alone", () => {
    expect(
      redact({ a: "flat", b: null, c: [1] }, ["a.b.c", "b.x", "c.0"]),
    ).toEqual({ a: "flat", b: null, c: [1] });
  });

  it("the core keys win over a field of the same name", () => {
    // SAFETY: `formatJsonLine` returns `JSON.stringify` of an object whose
    // first three keys are `level`, `time` and `msg` — the very property this
    // case asserts — so parsing it back yields a `Line`.
    const line = JSON.parse(
      formatJsonLine({
        level: "info",
        time: "2026-09-03T10:11:12.000Z",
        msg: "real",
        fields: { level: "spoofed", time: "never", msg: "fake", extra: 1 },
        traceId: "t",
      }),
    ) as Line;
    expect(line).toEqual({
      level: "info",
      time: "2026-09-03T10:11:12.000Z",
      msg: "real",
      extra: 1,
      traceId: "t",
    });
    expect(Object.keys(line).slice(0, 3)).toEqual(["level", "time", "msg"]);
  });
});
