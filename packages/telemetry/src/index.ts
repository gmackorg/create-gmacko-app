export {
  type Attributes,
  metrics,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
export { initTelemetry } from "./init.js";
export { getMetrics } from "./metrics.js";
export { withSpan } from "./span.js";
