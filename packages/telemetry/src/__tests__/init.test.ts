import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("initTelemetry", () => {
  beforeEach(() => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318");
    vi.stubEnv("OTEL_SERVICE_NAME", "test-service");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exports initTelemetry function", async () => {
    const { initTelemetry } = await import("../init.js");
    expect(initTelemetry).toBeTypeOf("function");
  });

  it("does not throw when endpoint is invalid", async () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "not-a-url");
    const { initTelemetry } = await import("../init.js");
    expect(() => initTelemetry()).not.toThrow();
  });

  it("is a no-op when OTEL_ENABLED is false", async () => {
    vi.stubEnv("OTEL_ENABLED", "false");
    const { initTelemetry } = await import("../init.js");
    expect(() => initTelemetry()).not.toThrow();
  });
});
