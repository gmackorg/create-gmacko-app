/**
 * `Observability.layer`: with an endpoint it exports spans and log lines
 * over OTLP/HTTP (JSON) to `<endpoint>/v1/{traces,logs}` and
 * `flushTelemetry` drains them; the console sink keeps receiving the same
 * log lines. Without an endpoint the layer is the console logger plus a bare
 * `Flusher`, so the same flush is a safe no-op. The sink is a Node http
 * server on an ephemeral port.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { LogRecord } from "@gmacko/logging";
import { Effect, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { flushAfter, flushTelemetry, Observability } from "../index";

interface Captured {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

const captured: Captured[] = [];

const sink = (): Server =>
  createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      captured.push({
        method: req.method ?? "",
        path: new URL(req.url ?? "/", "http://sink").pathname,
        headers: req.headers,
        body,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });

interface OtlpAttribute {
  readonly key: string;
  readonly value: { readonly stringValue?: string };
}
interface OtlpSpan {
  readonly name: string;
  readonly attributes?: ReadonlyArray<OtlpAttribute>;
}
interface OtlpTraces {
  readonly resourceSpans: ReadonlyArray<{
    readonly resource: { readonly attributes: ReadonlyArray<OtlpAttribute> };
    readonly scopeSpans: ReadonlyArray<{
      readonly spans: ReadonlyArray<OtlpSpan>;
    }>;
  }>;
}
interface OtlpLogs {
  readonly resourceLogs: ReadonlyArray<{
    readonly scopeLogs: ReadonlyArray<{
      readonly logRecords: ReadonlyArray<{
        readonly body?: {
          readonly stringValue?: string;
          readonly arrayValue?: {
            readonly values: ReadonlyArray<{ readonly stringValue?: string }>;
          };
        };
        readonly attributes?: ReadonlyArray<OtlpAttribute>;
      }>;
    }>;
  }>;
}

const posts = (path: string) =>
  captured.filter((r) => r.method === "POST" && r.path === path);

describe("Observability", () => {
  const server = sink();
  let endpoint: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );

  it("exports a span and a log line to the OTLP endpoint on flush, and still logs to the console sink", async () => {
    const lines: LogRecord[] = [];
    const runtime = ManagedRuntime.make(
      Observability.layer({
        endpoint,
        headers: { "x-otlp-test": "phase-7" },
        serviceName: "gmacko-web-test",
        serviceVersion: "0.0.0-test",
        logging: { sink: (_line, record) => lines.push(record) },
      }),
    );
    try {
      await runtime.runPromise(
        Effect.logInfo("inside", { step: 1 }).pipe(
          Effect.annotateLogs("request.id", "r1"),
          Effect.withSpan("observability.test", {
            attributes: { "test.case": "export" },
          }),
        ),
      );
      expect(captured).toHaveLength(0);
      await runtime.runPromise(flushTelemetry);
    } finally {
      await runtime.dispose();
    }

    const traces = posts("/v1/traces");
    expect(traces.length).toBeGreaterThanOrEqual(1);
    expect(traces[0]?.headers["x-otlp-test"]).toBe("phase-7");
    expect(traces[0]?.headers["content-type"]).toContain("application/json");
    const spans = traces.flatMap((request) =>
      (JSON.parse(request.body) as OtlpTraces).resourceSpans.flatMap((rs) => {
        const service = rs.resource.attributes.find(
          (a) => a.key === "service.name",
        )?.value.stringValue;
        return rs.scopeSpans.flatMap((ss) =>
          ss.spans.map((span) => ({ service, span })),
        );
      }),
    );
    const exported = spans.find((s) => s.span.name === "observability.test");
    expect(exported?.service).toBe("gmacko-web-test");
    expect(
      exported?.span.attributes?.find((a) => a.key === "test.case")?.value
        .stringValue,
    ).toBe("export");

    const logs = posts("/v1/logs").flatMap((request) =>
      (JSON.parse(request.body) as OtlpLogs).resourceLogs.flatMap((rl) =>
        rl.scopeLogs.flatMap((sl) => sl.logRecords),
      ),
    );
    // Effect sends a multi-part message (`"inside", { step: 1 }`) as an array body.
    const bodyText = (r: (typeof logs)[number]) =>
      r.body?.stringValue ??
      r.body?.arrayValue?.values.map((v) => v.stringValue ?? "").join(" ") ??
      "";
    const record = logs.find((r) => bodyText(r).includes("inside"));
    expect(record).toBeDefined();
    expect(
      record?.attributes?.find((a) => a.key === "request.id")?.value
        .stringValue,
    ).toBe("r1");

    // The console sink saw the same line, with the base fields.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "info",
      msg: "inside",
      fields: {
        service: "gmacko-web-test",
        version: "0.0.0-test",
        "request.id": "r1",
        step: 1,
      },
    });
    expect(lines[0]?.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("with no endpoint: console logging only, no export, flush is a no-op", async () => {
    const before = captured.length;
    const lines: LogRecord[] = [];
    const runtime = ManagedRuntime.make(
      Observability.layer({
        endpoint: undefined,
        serviceName: "gmacko-web-test",
        serviceVersion: "0.0.0-test",
        logging: { sink: (_line, record) => lines.push(record) },
      }),
    );
    try {
      await runtime.runPromise(
        Effect.logInfo("quiet").pipe(Effect.withSpan("observability.noop")),
      );
      await runtime.runPromise(flushTelemetry);
    } finally {
      await runtime.dispose();
    }
    expect(captured.length).toBe(before);
    expect(lines.map((l) => l.msg)).toEqual(["quiet"]);
  });
});

describe("flushAfter", () => {
  it("flushes after the response, and after a failure", async () => {
    const order: string[] = [];
    const flush = async () => {
      order.push("flush");
    };
    const ok = flushAfter(async (n: number) => {
      order.push(`respond ${n}`);
      return n * 2;
    }, flush);
    await expect(ok(2)).resolves.toBe(4);
    const failing = flushAfter(async () => {
      order.push("throw");
      throw new Error("boom");
    }, flush);
    await expect(failing()).rejects.toThrow("boom");
    expect(order).toEqual(["respond 2", "flush", "throw", "flush"]);
  });
});
