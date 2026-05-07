import { describe, expect, it } from "vitest";

describe("getMetrics", () => {
  it("exports getMetrics function", async () => {
    const { getMetrics } = await import("../metrics.js");
    expect(getMetrics).toBeTypeOf("function");
  });

  it("returns an object with expected instruments", async () => {
    const { getMetrics } = await import("../metrics.js");
    const m = getMetrics();
    expect(m).toHaveProperty("trpcDuration");
    expect(m).toHaveProperty("trpcErrors");
    expect(m).toHaveProperty("authSessionValidations");
    expect(m).toHaveProperty("authOauthExchanges");
    expect(m).toHaveProperty("healthStatus");
  });

  it("returns the same instance on repeated calls", async () => {
    const { getMetrics } = await import("../metrics.js");
    expect(getMetrics()).toBe(getMetrics());
  });
});
