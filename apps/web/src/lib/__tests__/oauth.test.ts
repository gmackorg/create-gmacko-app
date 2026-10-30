/**
 * The pure helpers behind the OAuth pages: which parameters the provider
 * signed, the client's original request without them, and how a request's
 * scopes split between checkboxes and pass-through values.
 */
import { describe, expect, it } from "vitest";

import {
  authorizeUrl,
  redirectHost,
  requestedScopes,
  signedOAuthQuery,
} from "../oauth";

const signed = new URLSearchParams([
  ["client_id", "c1"],
  ["redirect_uri", "http://127.0.0.1:5555/cb"],
  ["scope", "posts:write profile:read offline_access api_keys:manage"],
  ["state", "s"],
  ["exp", "1"],
  ["ba_iat", "2"],
  ["ba_param", "ba_iat"],
  ["ba_param", "ba_param"],
  ["ba_param", "client_id"],
  ["ba_param", "exp"],
  ["ba_param", "redirect_uri"],
  ["ba_param", "scope"],
  ["ba_param", "state"],
  ["sig", "abc"],
  ["utm_source", "mail"],
]).toString();

describe("signedOAuthQuery", () => {
  it("keeps the signature and the signed parameters, drops the rest", () => {
    const kept = new URLSearchParams(signedOAuthQuery(`?${signed}`));
    expect(kept.get("sig")).toBe("abc");
    expect(kept.get("client_id")).toBe("c1");
    expect(kept.getAll("ba_param")).toHaveLength(7);
    expect(kept.has("utm_source")).toBe(false);
  });
});

describe("authorizeUrl", () => {
  it("restarts the client's request without the provider's signing parameters", () => {
    const url = new URL(authorizeUrl(signed), "https://app.example");
    expect(url.pathname).toBe("/api/auth/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("c1");
    expect(url.searchParams.get("state")).toBe("s");
    for (const name of ["sig", "exp", "ba_iat", "ba_param", "ba_pl"]) {
      expect(url.searchParams.has(name), name).toBe(false);
    }
  });
});

describe("requestedScopes", () => {
  it("offers only OAuth-grantable catalog scopes and pre-ticks the reads", () => {
    expect(requestedScopes(signed)).toEqual({
      offered: ["posts:write", "profile:read"],
      preselected: ["profile:read"],
      // A key-only scope is neither offered nor passed through.
      passthrough: ["offline_access"],
    });
  });
});

describe("redirectHost", () => {
  it("names the redirect URI's host, or says it is unknown", () => {
    expect(redirectHost(signed)).toBe("127.0.0.1:5555");
    expect(redirectHost("client_id=c1")).toBe("an unknown address");
  });
});
