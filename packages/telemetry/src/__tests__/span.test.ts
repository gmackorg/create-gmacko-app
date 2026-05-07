import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("withSpan", () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeAll(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  it("creates a span with the given name", async () => {
    const { withSpan } = await import("../span.js");
    await withSpan("test-span", async () => "result");
    const spans = exporter.getFinishedSpans();
    expect(spans.some((s) => s.name === "test-span")).toBe(true);
  });

  it("returns the callback result", async () => {
    const { withSpan } = await import("../span.js");
    const result = await withSpan("return-span", async () => 42);
    expect(result).toBe(42);
  });

  it("records exception on error and re-throws", async () => {
    const { withSpan } = await import("../span.js");
    exporter.reset();
    await expect(
      withSpan("error-span", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const spans = exporter.getFinishedSpans();
    const errorSpan = spans.find((s) => s.name === "error-span");
    expect(errorSpan?.status.code).toBe(2); // SpanStatusCode.ERROR
  });

  it("sets custom attributes", async () => {
    const { withSpan } = await import("../span.js");
    exporter.reset();
    await withSpan("attr-span", async () => "ok", { "custom.key": "value" });
    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === "attr-span");
    expect(span?.attributes["custom.key"]).toBe("value");
  });
});
