/**
 * The security headers are computed from the stage and a nonce: HSTS only
 * outside development, CSP only on HTML, and the nonce lands in `script-src`
 * so Start's inline scripts (and the theme detector) run under the policy.
 */
import { describe, expect, it } from "vitest";

import {
  contentSecurityPolicy,
  mintNonce,
  securityHeadersFor,
  withHeaders,
} from "../headers";

describe("securityHeadersFor", () => {
  it("sets the frame, referrer and sniffing headers on every response", () => {
    const headers = securityHeadersFor(
      { nonce: "abc", stage: "development" },
      "application/json",
    );
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Content-Security-Policy"]).toBeUndefined();
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
  });

  it("adds HSTS outside development and CSP on HTML", () => {
    for (const stage of ["preview", "staging", "production"] as const) {
      const headers = securityHeadersFor(
        { nonce: "abc", stage },
        "text/html; charset=utf-8",
      );
      expect(headers["Strict-Transport-Security"]).toBe(
        "max-age=31536000; includeSubDomains",
      );
      expect(headers["Content-Security-Policy"]).toContain(
        "script-src 'self' 'nonce-abc'",
      );
      expect(headers["Content-Security-Policy"]).toContain(
        "upgrade-insecure-requests",
      );
      expect(headers["Content-Security-Policy"]).not.toContain("ws:");
    }
  });

  it("opens the dev server's websocket and local origins in development only", () => {
    const dev = contentSecurityPolicy({ nonce: "n", stage: "development" });
    expect(dev).toContain("connect-src 'self' ws: wss: http://localhost:*");
    expect(dev).not.toContain("upgrade-insecure-requests");
    const prod = contentSecurityPolicy({
      nonce: "n",
      stage: "production",
      connectSrc: ["https://us.i.posthog.com"],
    });
    expect(prod).toContain("connect-src 'self' https://us.i.posthog.com;");
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
  });

  it("allows no script origin beyond self and the nonce: PostHog talks over connect-src only", () => {
    const csp = contentSecurityPolicy({
      nonce: "n",
      stage: "production",
      connectSrc: ["https://us.i.posthog.com", "https://o1.ingest.sentry.io"],
    });
    const directive = (name: string) =>
      csp
        .split("; ")
        .find((d) => d.startsWith(`${name} `))
        ?.slice(name.length + 1)
        .split(" ");
    // Exactly these two sources, so a lazily-injected PostHog script (assets
    // host) is refused unless it carries the nonce (cspNonceScriptHook).
    expect(directive("script-src")).toEqual(["'self'", "'nonce-n'"]);
    expect(directive("connect-src")).toEqual([
      "'self'",
      "https://us.i.posthog.com",
      "https://o1.ingest.sentry.io",
    ]);
    expect(csp).not.toContain("us-assets.i.posthog.com");
  });

  it("mints a fresh base64 nonce per call", () => {
    const a = mintNonce();
    const b = mintNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(atob(a)).toHaveLength(16);
  });

  it("copies a response whose headers are immutable", () => {
    const frozen = Response.redirect("https://example.com/", 302);
    const out = withHeaders(frozen, { "X-Frame-Options": "DENY" });
    expect(out.headers.get("X-Frame-Options")).toBe("DENY");
    expect(out.status).toBe(302);
    expect(out.headers.get("location")).toBe("https://example.com/");
  });
});
