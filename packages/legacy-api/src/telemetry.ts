/**
 * The OpenTelemetry API surface the tRPC middleware uses: the tracer and
 * the tRPC metrics, over the global providers the legacy Next.js app
 * installs (`apps/nextjs/src/telemetry/init.ts`). Formerly
 * `@gmacko/telemetry`, which is now the Worker's Effect OTLP layer. Deleted
 * with the legacy stack in Phase 8.
 */
import { metrics, SpanStatusCode, trace } from "@opentelemetry/api";

export { SpanStatusCode, trace };

type Meter = ReturnType<typeof metrics.getMeter>;

interface AppMetrics {
  trpcDuration: ReturnType<Meter["createHistogram"]>;
  trpcErrors: ReturnType<Meter["createCounter"]>;
}

let instance: AppMetrics | null = null;

export function getMetrics(): AppMetrics {
  if (instance) return instance;
  const meter = metrics.getMeter("@gmacko/legacy-api");
  instance = {
    trpcDuration: meter.createHistogram("trpc.procedure.duration", {
      description: "Duration of tRPC procedure execution",
      unit: "ms",
    }),
    trpcErrors: meter.createCounter("trpc.procedure.errors", {
      description: "Count of tRPC procedure errors",
    }),
  };
  return instance;
}
