import { describe, expect, it } from "vitest";

import { makeHeaders } from "../api-headers";

describe("makeHeaders", () => {
  it("sends the stored session cookie on every call", async () => {
    const headers = makeHeaders(
      async () => "better-auth.session_token=abc; better-auth.session_data=xyz",
    );
    await expect(headers()).resolves.toEqual({
      cookie: "better-auth.session_token=abc; better-auth.session_data=xyz",
    });
  });

  it("sends nothing while signed out (empty, null or undefined cookie)", async () => {
    await expect(makeHeaders(() => "")()).resolves.toEqual({});
    await expect(makeHeaders(() => null)()).resolves.toEqual({});
    await expect(makeHeaders(async () => undefined)()).resolves.toEqual({});
  });
});
