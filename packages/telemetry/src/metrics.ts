import { metrics } from "@opentelemetry/api";

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
