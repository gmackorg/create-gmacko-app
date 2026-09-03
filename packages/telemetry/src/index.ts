/**
 * `@gmacko/telemetry`: traces, metrics and logs for the Worker, over fetch.
 *
 * `Observability.layer(options)` installs the JSON console logger
 * (@gmacko/logging) and, when an OTLP endpoint is configured, Effect's
 * OTLP/HTTP exporters for all three signals (`effect/unstable/observability`,
 * fetch-based, so they run on workerd). Either way the layer provides
 * `OtlpExporter.Flusher`, so `flushTelemetry` is always safe to run: with
 * nothing registered, `flush` is a no-op.
 *
 * Workers freeze the isolate between requests, so interval-based export
 * cannot be relied on; every request ends with a flush handed to
 * `waitUntil` (`flushAfter` wraps a handler with that). No Node SDK, no
 * host metrics, no `process.env`: the endpoint and headers are options,
 * read once by the app from its bindings.
 */
import { Logging, type LoggingOptions } from "@gmacko/logging";
import { Duration, Effect, Layer, Metric } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { Otlp, OtlpExporter } from "effect/unstable/observability";

export interface ObservabilityOptions {
  /** OTLP/HTTP base URL (`…/v1/{traces,logs,metrics}` are appended); unset → export off. */
  readonly endpoint: string | undefined;
  /** Extra request headers for the collector (auth tokens). */
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly serviceName: string;
  readonly serviceVersion: string;
  /** Console logger options; `base` defaults to the service name and version. */
  readonly logging?: LoggingOptions | undefined;
}

const loggingLayer = (options: ObservabilityOptions): Layer.Layer<never> =>
  Logging.layer({
    base: {
      service: options.serviceName,
      version: options.serviceVersion,
    },
    ...options.logging,
  });

export const Observability = {
  /**
   * The console logger plus, with an endpoint, the OTLP exporters. The
   * OTLP logger is layered over the console sink with `mergeWithExisting`,
   * so a line goes to both.
   */
  layer: (options: ObservabilityOptions): Layer.Layer<OtlpExporter.Flusher> => {
    const logging = loggingLayer(options);
    if (!options.endpoint) {
      return Layer.mergeAll(OtlpExporter.layerFlusher, logging);
    }
    return Layer.mergeAll(
      Otlp.layerJson({
        baseUrl: options.endpoint,
        resource: {
          serviceName: options.serviceName,
          serviceVersion: options.serviceVersion,
        },
        headers: options.headers ?? {},
        loggerMergeWithExisting: true,
        tracerExportInterval: Duration.seconds(1),
        loggerExportInterval: Duration.seconds(1),
        metricsExportInterval: Duration.seconds(10),
        shutdownTimeout: Duration.seconds(3),
      }),
      // The same module-level constant the Otlp layers depend on: one
      // shared registry, so one `flush` drains all three signals.
      OtlpExporter.layerFlusher,
    ).pipe(Layer.provide(FetchHttpClient.layer), Layer.provideMerge(logging));
  },
};

/** Drains every registered exporter; a no-op when export is off. */
export const flushTelemetry: Effect.Effect<void, never, OtlpExporter.Flusher> =
  Effect.flatMap(OtlpExporter.Flusher, (flusher) => flusher.flush);

/**
 * Wraps a request handler so `flush` runs after every response, success or
 * failure. On Workers `flush` hands `flushTelemetry` to `waitUntil` (through
 * the app's `Background` service) so the export outlives the response.
 */
export const flushAfter =
  <Args extends ReadonlyArray<unknown>, R>(
    respond: (...args: Args) => Promise<R>,
    flush: () => Promise<unknown>,
  ) =>
  async (...args: Args): Promise<R> => {
    try {
      return await respond(...args);
    } finally {
      await flush();
    }
  };

/**
 * Milliseconds per API endpoint; the endpoint boundary in @gmacko/api
 * records one sample per call with the attribute `endpoint` =
 * `group.endpoint`.
 */
export const httpServerDuration = Metric.histogram("http.server.duration", {
  description: "API endpoint duration in milliseconds",
  boundaries: Metric.exponentialBoundaries({ start: 1, factor: 2, count: 14 }),
});

export { OtlpExporter };
