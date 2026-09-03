/**
 * `AppConfig.fromBindings`: the magic-link bypass is a development-only
 * switch. Anywhere else it must stop the Worker at load, not silently turn
 * into a sign-in bypass.
 */
import { describe, expect, it } from "vitest";

import { AppConfig } from "../config";

const base = { AUTH_SECRET: "test-secret-that-is-long-enough-for-better-auth" };

describe("AppConfig.fromBindings", () => {
  it("honours BYPASS_MAGIC_LINK in development", () => {
    for (const value of ["true", "1"]) {
      const config = AppConfig.fromBindings({
        ...base,
        STAGE: "development",
        BYPASS_MAGIC_LINK: value,
      });
      expect(config.stage).toBe("development");
      expect(config.auth.bypassMagicLink).toBe(true);
    }
  });

  it("defaults the bypass to off", () => {
    const config = AppConfig.fromBindings({ ...base, STAGE: "development" });
    expect(config.auth.bypassMagicLink).toBe(false);
    for (const stage of ["preview", "staging", "production"]) {
      expect(
        AppConfig.fromBindings({
          ...base,
          STAGE: stage,
          BYPASS_MAGIC_LINK: "0",
        }).auth.bypassMagicLink,
      ).toBe(false);
    }
  });

  it("fails at load when BYPASS_MAGIC_LINK is set on any other stage", () => {
    for (const stage of ["preview", "staging", "production"]) {
      expect(() =>
        AppConfig.fromBindings({
          ...base,
          STAGE: stage,
          BYPASS_MAGIC_LINK: "true",
        }),
      ).toThrow(
        `BYPASS_MAGIC_LINK is set but STAGE is "${stage}": the magic-link bypass is allowed only when STAGE=development`,
      );
    }
  });

  it("rejects an unknown STAGE", () => {
    expect(() => AppConfig.fromBindings({ ...base, STAGE: "prod" })).toThrow();
  });
});
