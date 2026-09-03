/**
 * Node OpenTelemetry SDK bootstrap for the legacy Next.js app. This is the
 * former `@gmacko/telemetry` `initTelemetry`, kept here because that package
 * is now the Worker's fetch-based OTLP layer (Effect) and no longer ships a
 * Node SDK. Deleted with apps/nextjs in Phase 8.
 */
import { integrations } from "@gmacko/config";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HostMetrics } from "@opentelemetry/host-metrics";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";

let initialized = false;

export function initTelemetry(): void {
  if (initialized) return;
  if (!integrations.forgegraph) return;
  const env = process.env;
  if (env.OTEL_ENABLED === "false") return;

  const endpoint =
    env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    (env.FG_APP ? "https://otlp.forgegraf.com" : "");
  if (!endpoint) return;

  initialized = true;

  try {
    const serviceName =
      env.FG_APP || env.OTEL_SERVICE_NAME || env.SERVICE_NAME || "gmacko-app";

    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
        env.FG_STAGE || env.NODE_ENV || "development",
      [ATTR_SERVICE_VERSION]:
        env.FG_COMMIT_HASH || env.npm_package_version || "0.0.0",
      ...(env.FG_NODE && { "host.name": env.FG_NODE }),
    });

    const sdk = new NodeSDK({
      resource,
      traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis: 60_000,
      }),
      instrumentations: [new HttpInstrumentation(), new FetchInstrumentation()],
    });

    sdk.start();
    new HostMetrics().start();

    const shutdown = () => {
      sdk.shutdown().catch(() => {});
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  } catch (error) {
    // oxlint-disable-next-line no-console -- the SDK is not up, so nothing else can report this
    console.error("[telemetry] Failed to initialize OTel SDK:", error);
  }
}
