/**
 * OTLP export for traces, logs and metrics over fetch, so it runs on workerd.
 *
 * TODO(Phase 7): move to packages/telemetry/src/workers.ts once that package
 * is rebuilt on Effect; this is the Spike C seed.
 *
 * Export is on only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Either way the
 * layer provides `OtlpExporter.Flusher`, so `flushTelemetry` is always safe to
 * call: with no exporters registered, `flush` is a no-op.
 *
 * Workers freeze the isolate between requests, so the interval-based export
 * cannot be relied on; every request ends with a `flush` handed to
 * `waitUntil` through the `Background` service (see `runtime.ts`).
 */
import { Background } from "@gmacko/api";
import { Duration, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { Otlp, OtlpExporter } from "effect/unstable/observability";

export interface ObservabilityOptions {
  readonly endpoint: string | undefined;
  readonly headers: Readonly<Record<string, string>>;
  readonly serviceName: string;
  readonly serviceVersion: string;
}

export const Observability = {
  layer: (options: ObservabilityOptions): Layer.Layer<OtlpExporter.Flusher> => {
    if (!options.endpoint) return OtlpExporter.layerFlusher;
    return Layer.mergeAll(
      Otlp.layerJson({
        baseUrl: options.endpoint,
        resource: {
          serviceName: options.serviceName,
          serviceVersion: options.serviceVersion,
        },
        headers: options.headers,
        // Console logging stays on; OTLP is an additional sink.
        loggerMergeWithExisting: true,
        tracerExportInterval: Duration.seconds(1),
        loggerExportInterval: Duration.seconds(1),
        metricsExportInterval: Duration.seconds(10),
        shutdownTimeout: Duration.seconds(3),
      }),
      // The same module-level constant the Otlp layers depend on, so this is
      // the one shared registry and one `flush` drains all three signals.
      OtlpExporter.layerFlusher,
    ).pipe(Layer.provide(FetchHttpClient.layer));
  },
};

/** Drains pending exports after the response, on `waitUntil`. */
export const flushTelemetry: Effect.Effect<
  void,
  never,
  Background | OtlpExporter.Flusher
> = Effect.flatMap(Background, (background) =>
  background.run(
    Effect.flatMap(OtlpExporter.Flusher, (flusher) => flusher.flush),
  ),
);
