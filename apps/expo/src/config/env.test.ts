import { describe, expect, it, vi } from "vitest";

import {
  type AppEnvironment,
  collectEnvironmentErrors,
  validateEnvironment,
} from "./env-validation";

function config(overrides: {
  environment: AppEnvironment;
  apiUrl?: string;
  sentryDsn?: string;
  posthogKey?: string;
}) {
  const environment = overrides.environment;
  // `apiUrl` is required on EnvironmentConfig, so a missing one is not a case
  // this helper can express — `??` supplies the default. The observability
  // fields below are optional, and several cases turn on a MISSING value, so
  // those use `in` to honour an explicit `undefined` override.
  return {
    apiUrl: overrides.apiUrl ?? "https://api.example.com",
    environment,
    isDevelopment: environment === "development",
    isPreview: environment === "preview",
    isProduction: environment === "production",
    enableDebugMode: environment !== "production",
    observability: {
      sentryDsn:
        "sentryDsn" in overrides
          ? overrides.sentryDsn
          : "https://key@sentry.io/1",
      posthogKey: "posthogKey" in overrides ? overrides.posthogKey : "phc_test",
      posthogHost: "https://us.i.posthog.com",
    },
  };
}

describe("collectEnvironmentErrors", () => {
  it("is lenient in development", () => {
    expect(
      collectEnvironmentErrors(
        config({
          environment: "development",
          apiUrl: "https://api.yourapp.com",
          sentryDsn: undefined,
          posthogKey: undefined,
        }),
      ),
    ).toEqual([]);
  });

  it("passes a fully-configured production build", () => {
    expect(
      collectEnvironmentErrors(config({ environment: "production" })),
    ).toEqual([]);
  });

  it("rejects the scaffold placeholder host in production", () => {
    const errors = collectEnvironmentErrors(
      config({ environment: "production", apiUrl: "https://api.yourapp.com" }),
    );
    expect(errors.some((e) => e.includes("placeholder"))).toBe(true);
  });

  it("requires HTTPS + Sentry + PostHog in preview", () => {
    const errors = collectEnvironmentErrors(
      config({
        environment: "preview",
        apiUrl: "http://staging.example.com",
        sentryDsn: undefined,
        posthogKey: undefined,
      }),
    );
    expect(errors.some((e) => e.includes("HTTPS"))).toBe(true);
    expect(errors.some((e) => e.includes("Sentry"))).toBe(true);
    expect(errors.some((e) => e.includes("PostHog"))).toBe(true);
  });
});

describe("validateEnvironment", () => {
  it("throws in production when misconfigured", () => {
    expect(() =>
      validateEnvironment(
        config({
          environment: "production",
          apiUrl: "https://api.yourapp.com",
        }),
      ),
    ).toThrow(/misconfigured for the production build/);
  });

  it("does not throw in development, only warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() =>
      validateEnvironment(
        config({
          environment: "development",
          apiUrl: "https://api.yourapp.com",
          sentryDsn: undefined,
          posthogKey: undefined,
        }),
      ),
    ).not.toThrow();
    warn.mockRestore();
  });

  it("does not throw when fully configured", () => {
    expect(() =>
      validateEnvironment(config({ environment: "production" })),
    ).not.toThrow();
  });
});
