/**
 * Security headers for every response, as a TanStack Start request
 * middleware (registered in src/start.ts). The Content-Security-Policy uses
 * a per-request nonce: the middleware mints it, hands it down as request
 * context, `getRouter()` (src/router.tsx) sets it as `ssr.nonce`, and Start
 * stamps it on each inline script it streams (hydration data, `ScriptOnce`,
 * the `csp-nonce` meta the client reads it back from). The theme detector
 * script in `ThemeProvider` takes the same nonce through the root route.
 *
 * `securityHeadersFor` is pure so it has a unit test; `securityHeaders`
 * wires it to the request.
 */
import type { Stage } from "@gmacko/domain/health";
import { createMiddleware } from "@tanstack/react-start";

export interface HeaderOptions {
  readonly nonce: string;
  readonly stage: Stage;
  /** Extra `connect-src` origins (PostHog, Sentry ingest), when configured. */
  readonly connectSrc?: ReadonlyArray<string> | undefined;
}

const HSTS = "max-age=31536000; includeSubDomains";

/**
 * Only the policy needs the stage. In development the Vite dev server and
 * emulate run on plain http/ws on localhost, and OAuth avatars come from an
 * emulated GitHub on another local port; everything else is the same policy
 * production gets.
 */
export const contentSecurityPolicy = (options: HeaderOptions): string => {
  const dev = options.stage === "development";
  const connect = ["'self'", ...(options.connectSrc ?? [])];
  if (dev)
    connect.push("ws:", "wss:", "http://localhost:*", "http://127.0.0.1:*");
  const img = ["'self'", "data:", "blob:", "https:"];
  if (dev) img.push("http:");
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // Only the app's own bundles and the SSR inline scripts carrying this
    // request's nonce. Third-party scripts are deliberately not allowed:
    // PostHog (src/providers.tsx) runs with @gmacko/analytics/web's
    // `cspSafeDefaults`, which turn off every feature posthog-js would load
    // by injecting a <script> from its assets host (session replay, surveys,
    // web experiments, exception autocapture); its events go over
    // `connect-src` (the PostHog origin is in `connectSrc`). To enable one of
    // those features later, keep this directive and pass
    // `prepare_external_dependency_script: cspNonceScriptHook()` so the
    // injected script carries the `csp-nonce` meta's value, rather than
    // adding the assets host here.
    `script-src 'self' 'nonce-${options.nonce}'`,
    // React inline `style=` attributes (sonner, tailwind's cascade layers in
    // dev) need inline styles; scripts never do.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img.join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
  if (!dev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
};

/** The headers to set on a response; CSP goes on HTML only, the rest on everything. */
export const securityHeadersFor = (
  options: HeaderOptions,
  contentType: string | null,
): Record<string, string> => {
  const headers: Record<string, string> = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
  if (options.stage !== "development")
    headers["Strict-Transport-Security"] = HSTS;
  if (contentType?.includes("text/html")) {
    headers["Content-Security-Policy"] = contentSecurityPolicy(options);
  }
  return headers;
};

/** A fresh 128-bit nonce, base64 (what CSP expects). */
export const mintNonce = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
};

/** Sets headers on `response`, copying it first when its headers are frozen. */
export const withHeaders = (
  response: Response,
  headers: Readonly<Record<string, string>>,
): Response => {
  let target = response;
  try {
    for (const [name, value] of Object.entries(headers))
      target.headers.set(name, value);
  } catch {
    target = new Response(response.body, response);
    for (const [name, value] of Object.entries(headers))
      target.headers.set(name, value);
  }
  return target;
};

export const securityHeaders = createMiddleware({ type: "request" }).server(
  async ({ next }) => {
    const nonce = mintNonce();
    const result = await next({ context: { nonce } });
    // Loaded here, not at the top: this module is imported by src/start.ts,
    // which the browser bundle also compiles (the `.server` body is stripped
    // there, and with it this import of `cloudflare:workers`).
    const { config, webConfig } = await import("~/server/runtime");
    const headers = securityHeadersFor(
      { nonce, stage: config.stage, connectSrc: webConfig.connectSrc },
      result.response.headers.get("content-type"),
    );
    return { ...result, response: withHeaders(result.response, headers) };
  },
);
