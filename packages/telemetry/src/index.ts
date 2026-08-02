export {
  type Attributes,
  metrics,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
export { initTelemetry } from "./init";
export { getMetrics } from "./metrics";
export { withSpan } from "./span";
