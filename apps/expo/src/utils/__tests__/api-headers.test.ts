import { describe, expect, it } from "vitest";

import { headersFromCookie } from "../api-headers";

describe("headersFromCookie", () => {
  it("sends the stored session cookie on every call", async () => {
    const headers = headersFromCookie(
      async () => "better-auth.session_token=abc; better-auth.session_data=xyz",
    );
    await expect(headers()).resolves.toEqual({
      cookie: "better-auth.session_token=abc; better-auth.session_data=xyz",
    });
  });

  it("sends nothing while signed out (empty, null or undefined cookie)", async () => {
    await expect(headersFromCookie(() => "")()).resolves.toEqual({});
    await expect(headersFromCookie(() => null)()).resolves.toEqual({});
    await expect(headersFromCookie(async () => undefined)()).resolves.toEqual(
      {},
    );
  });
});
