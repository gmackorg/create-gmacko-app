/**
 * `Observability.layer`: with an endpoint it exports spans over OTLP/HTTP
 * (JSON) to `<endpoint>/v1/traces` and `flushTelemetry` drains them on the
 * Background service; without one it is the bare `Flusher` so the same flush
 * is a safe no-op. The sink is a Node http server on an ephemeral port.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Effect, Layer, ManagedRuntime } from "effect";
import { OtlpExporter } from "effect/unstable/observability";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Background } from "../background";
import { flushTelemetry, Observability } from "../observability";

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

/** A `Background` whose `waitUntil` promises the test can await. */
const background = () => {
  const pending: Promise<unknown>[] = [];
  return {
    layer: Background.layer((promise) => {
      pending.push(promise);
    }),
    settle: () => Promise.all(pending),
  };
};

interface OtlpSpan {
  readonly name: string;
  readonly attributes?: ReadonlyArray<{
    readonly key: string;
    readonly value: { readonly stringValue?: string };
  }>;
}
interface OtlpTraces {
  readonly resourceSpans: ReadonlyArray<{
    readonly resource: {
      readonly attributes: ReadonlyArray<{
        readonly key: string;
        readonly value: { readonly stringValue?: string };
      }>;
    };
    readonly scopeSpans: ReadonlyArray<{
      readonly spans: ReadonlyArray<OtlpSpan>;
    }>;
  }>;
}

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

  it("exports a span to the OTLP endpoint and flushes it on Background", async () => {
    const { layer, settle } = background();
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        layer,
        Observability.layer({
          endpoint,
          headers: { "x-otlp-test": "spike-c" },
          serviceName: "gmacko-web-test",
          serviceVersion: "0.0.0-test",
        }),
      ),
    );
    try {
      await runtime.runPromise(
        Effect.void.pipe(
          Effect.withSpan("observability.test", {
            attributes: { "test.case": "export" },
          }),
        ),
      );
      expect(captured).toHaveLength(0);
      await runtime.runPromise(flushTelemetry);
      await settle();
    } finally {
      await runtime.dispose();
    }

    const traces = captured.filter(
      (request) => request.method === "POST" && request.path === "/v1/traces",
    );
    expect(traces.length).toBeGreaterThanOrEqual(1);
    const first = traces[0];
    expect(first?.headers["x-otlp-test"]).toBe("spike-c");
    expect(first?.headers["content-type"]).toContain("application/json");

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
    expect(exported).toBeDefined();
    expect(exported?.service).toBe("gmacko-web-test");
    expect(
      exported?.span.attributes?.find((a) => a.key === "test.case")?.value
        .stringValue,
    ).toBe("export");
  });

  it("is the bare Flusher when the endpoint is unset: no export, flush is a no-op", async () => {
    const before = captured.length;
    const options = {
      endpoint: undefined,
      headers: {},
      serviceName: "gmacko-web-test",
      serviceVersion: "0.0.0-test",
    };
    expect(Observability.layer(options)).toBe(OtlpExporter.layerFlusher);

    const { layer, settle } = background();
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(layer, Observability.layer(options)),
    );
    try {
      await runtime.runPromise(
        Effect.void.pipe(Effect.withSpan("observability.noop")),
      );
      await runtime.runPromise(flushTelemetry);
      await settle();
      // `flush` resolves with nothing registered.
      await runtime.runPromise(
        Effect.flatMap(OtlpExporter.Flusher, (flusher) => flusher.flush),
      );
    } finally {
      await runtime.dispose();
    }
    expect(captured.length).toBe(before);
  });
});
