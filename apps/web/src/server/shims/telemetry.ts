/**
 * TODO(migration Phase 6): delete with packages/telemetry's Node SDK setup.
 *
 * Worker shim for `@gmacko/telemetry`. The real package pulls in
 * `@opentelemetry/sdk-node` and `@opentelemetry/host-metrics`, which call
 * `process.cpuUsage()` at module scope and fail on workerd. The Vite config
 * swaps this module in for the ssr environment only (see `workerShims` in
 * vite.config.ts). It keeps the same export surface on top of the pure-JS
 * `@opentelemetry/api`, whose no-op providers are fine until the Effect
 * tracer lands.
 */
import {
  type Attributes,
  metrics,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";

export { type Attributes, metrics, SpanStatusCode, trace };

interface AppMetrics {
  trpcDuration: ReturnType<
    ReturnType<typeof metrics.getMeter>["createHistogram"]
  >;
  trpcErrors: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]>;
  authSessionValidations: ReturnType<
    ReturnType<typeof metrics.getMeter>["createCounter"]
  >;
  authOauthExchanges: ReturnType<
    ReturnType<typeof metrics.getMeter>["createCounter"]
  >;
  healthStatus: ReturnType<ReturnType<typeof metrics.getMeter>["createGauge"]>;
}

let instance: AppMetrics | null = null;

export function getMetrics(): AppMetrics {
  if (instance) return instance;
  const meter = metrics.getMeter("@gmacko/telemetry");
  instance = {
    trpcDuration: meter.createHistogram("trpc.procedure.duration", {
      description: "Duration of tRPC procedure execution",
      unit: "ms",
    }),
    trpcErrors: meter.createCounter("trpc.procedure.errors", {
      description: "Count of tRPC procedure errors",
    }),
    authSessionValidations: meter.createCounter("auth.session.validations", {
      description: "Count of session validation attempts",
    }),
    authOauthExchanges: meter.createCounter("auth.oauth.exchanges", {
      description: "Count of OAuth token exchanges",
    }),
    healthStatus: meter.createGauge("app.health.status", {
      description: "Application health status (1=healthy, 0=degraded)",
    }),
  };
  return instance;
}

/** No-op on Workers: there is no Node SDK to start. */
export function initTelemetry(): void {}

const tracer = trace.getTracer("@gmacko/telemetry");

export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Attributes,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    } finally {
      span.end();
    }
  });
}
