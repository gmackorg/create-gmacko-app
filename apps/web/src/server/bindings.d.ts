/**
 * Secrets and optional vars that are not in wrangler.jsonc (set per stage
 * with `wrangler secret put`, or by emulate's `.env` in development), so
 * `wrangler types` cannot know about them. Everything here is read only by
 * `AppConfig.fromBindings` and the Sentry wrapper.
 */
declare namespace Cloudflare {
  interface Env {
    APP_URL?: string;
    PORTLESS_URL?: string;
    ALLOWED_ORIGINS?: string;
    AUTH_SECRET?: string;
    AUTH_GITHUB_ID?: string;
    AUTH_GITHUB_SECRET?: string;
    AUTH_GOOGLE_ID?: string;
    AUTH_GOOGLE_SECRET?: string;
    AUTH_APPLE_ID?: string;
    AUTH_APPLE_SECRET?: string;
    AUTH_APPLE_BUNDLE_ID?: string;
    AUTH_GITHUB_URL?: string;
    AUTH_GITHUB_API_URL?: string;
    AUTH_GOOGLE_URL?: string;
    AUTH_GOOGLE_TOKEN_URL?: string;
    AUTH_APPLE_URL?: string;
    BYPASS_MAGIC_LINK?: string;
    OTEL_EXPORTER_OTLP_ENDPOINT?: string;
    OTEL_EXPORTER_OTLP_HEADERS?: string;
    SENTRY_DSN?: string;
  }
}

/** Injected by Vite (`define`) from apps/web/package.json. */
declare const __APP_VERSION__: string;
