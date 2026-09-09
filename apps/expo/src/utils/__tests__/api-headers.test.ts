import { describe, expect, it } from "vitest";

import { headersFromCredentials } from "../api-headers";

const noToken = () => null;

describe("headersFromCredentials", () => {
  it("sends the stored session cookie on every call", async () => {
    const headers = headersFromCredentials(
      async () => "better-auth.session_token=abc; better-auth.session_data=xyz",
      noToken,
    );
    await expect(headers()).resolves.toEqual({
      cookie: "better-auth.session_token=abc; better-auth.session_data=xyz",
    });
  });

  it("sends the device-paired token as a bearer, beside any cookie", async () => {
    await expect(
      headersFromCredentials(
        () => null,
        () => "paired-token",
      )(),
    ).resolves.toEqual({ authorization: "Bearer paired-token" });
    await expect(
      headersFromCredentials(
        () => "better-auth.session_token=abc",
        () => "paired-token",
      )(),
    ).resolves.toEqual({
      cookie: "better-auth.session_token=abc",
      authorization: "Bearer paired-token",
    });
  });

  it("sends nothing while signed out (empty, null or undefined credentials)", async () => {
    await expect(headersFromCredentials(() => "", noToken)()).resolves.toEqual(
      {},
    );
    await expect(
      headersFromCredentials(
        () => null,
        () => "",
      )(),
    ).resolves.toEqual({});
    await expect(
      headersFromCredentials(
        async () => undefined,
        () => undefined,
      )(),
    ).resolves.toEqual({});
  });
});
