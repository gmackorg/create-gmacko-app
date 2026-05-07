import { describe, expect, it } from "vitest";

describe("getOtelMixin", () => {
  it("exports getOtelMixin function", async () => {
    const { getOtelMixin } = await import("../otel.js");
    expect(getOtelMixin).toBeTypeOf("function");
  });

  it("returns empty object when no active span", async () => {
    const { getOtelMixin } = await import("../otel.js");
    const mixin = getOtelMixin();
    expect(mixin).toEqual({});
  });
});
