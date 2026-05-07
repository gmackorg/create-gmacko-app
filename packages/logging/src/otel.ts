let traceApi: typeof import("@opentelemetry/api") | null = null;
let loadAttempted = false;

function loadTraceApi() {
  if (loadAttempted) return;
  loadAttempted = true;
  try {
    traceApi = require("@opentelemetry/api");
  } catch {
    // Not installed — mixin is a no-op
  }
}

export function getOtelMixin(): Record<string, string> {
  loadTraceApi();
  if (!traceApi) return {};

  const span = traceApi.trace.getActiveSpan();
  if (!span) return {};

  const ctx = span.spanContext();
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
  };
}
