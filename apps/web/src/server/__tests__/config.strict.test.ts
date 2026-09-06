/**
 * `fromBindings` is permissive in development (a bare checkout boots with
 * wrangler.jsonc vars only) and strict in staging/production: the auth
 * secret and at least one OAuth provider pair must be present, plus the
 * Stripe secrets when the Stripe feature is on. A missing key stops the
 * Worker at load with the full list, not on the first sign-in.
 */
import { describe, expect, it } from "vitest";

import { fromBindings } from "../config";

const github = {
  AUTH_GITHUB_ID: "gh-id",
  AUTH_GITHUB_SECRET: "gh-secret",
};
const secret = { AUTH_SECRET: "a-secret-that-is-long-enough-for-better-auth" };

describe("fromBindings: required secrets per stage", () => {
  it("development boots with nothing but STAGE", () => {
    const config = fromBindings({ STAGE: "development" });
    expect(config.stage).toBe("development");
    expect(config.auth.secret).toBeUndefined();
  });

  it("preview is as permissive as development", () => {
    expect(() => fromBindings({ STAGE: "preview" })).not.toThrow();
  });

  for (const stage of ["staging", "production"] as const) {
    it(`${stage} lists every missing key in one error`, () => {
      expect(() => fromBindings({ STAGE: stage })).toThrow(
        /STAGE is "(staging|production)".*missing: AUTH_SECRET, one OAuth provider pair/s,
      );
      expect(() => fromBindings({ STAGE: stage, ...secret })).toThrow(
        /one OAuth provider pair \(AUTH_GITHUB_ID\+AUTH_GITHUB_SECRET, AUTH_GOOGLE_ID\+AUTH_GOOGLE_SECRET or AUTH_APPLE_ID\+AUTH_APPLE_SECRET\)/,
      );
      // Half a pair is not a provider.
      expect(() =>
        fromBindings({ STAGE: stage, ...secret, AUTH_GOOGLE_ID: "g" }),
      ).toThrow(/one OAuth provider pair/);
      // The fix is named.
      expect(() => fromBindings({ STAGE: stage })).toThrow(
        `pnpm secrets:push --stage ${stage}`,
      );
    });

    it(`${stage} boots with the secret and one provider`, () => {
      expect(() =>
        fromBindings({ STAGE: stage, ...secret, ...github }),
      ).not.toThrow();
      expect(() =>
        fromBindings({
          STAGE: stage,
          ...secret,
          AUTH_GOOGLE_ID: "g",
          AUTH_GOOGLE_SECRET: "gs",
        }),
      ).not.toThrow();
      expect(() =>
        fromBindings({
          STAGE: stage,
          ...secret,
          AUTH_APPLE_ID: "a",
          AUTH_APPLE_SECRET: "as",
        }),
      ).not.toThrow();
    });

    it(`${stage} requires the Stripe secrets only when the Stripe feature is on`, () => {
      const bindings = { STAGE: stage, ...secret, ...github };
      expect(() =>
        fromBindings(bindings, { features: { stripe: false } }),
      ).not.toThrow();
      expect(() =>
        fromBindings(bindings, { features: { stripe: true } }),
      ).toThrow(/missing: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET/);
      expect(() =>
        fromBindings(
          {
            ...bindings,
            STRIPE_SECRET_KEY: "sk_test_x",
            STRIPE_WEBHOOK_SECRET: "whsec_x",
          },
          { features: { stripe: true } },
        ),
      ).not.toThrow();
      expect(
        fromBindings(
          {
            ...bindings,
            STRIPE_SECRET_KEY: "sk_test_x",
            STRIPE_WEBHOOK_SECRET: "whsec_x",
          },
          { features: { stripe: true } },
        ).features.stripe,
      ).toBe(true);
    });
  }
});
