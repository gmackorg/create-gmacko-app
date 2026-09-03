/**
 * `fromBindings`: the validated, typed view of the Worker bindings as
 * `@gmacko/api`'s `AppConfig`. Built once in `runtime.ts` from
 * `cloudflare:workers` env (and from a literal object in tests); nothing
 * else reads bindings or `process.env`.
 */
import { type AppConfigShape, defaultFeatures } from "@gmacko/api";
import { Stage as StageSchema } from "@gmacko/domain/health";
import { Schema } from "effect";

export { AppConfig, type AppConfigShape, type Stage } from "@gmacko/api";

const Optional = Schema.optional(Schema.String);

/**
 * The bindings this app reads. Secrets are optional at the type level so a
 * bare local checkout boots; TODO(Phase 7): require the provider secrets in
 * staging/production and fail fast at deploy time.
 */
export const Bindings = Schema.Struct({
  STAGE: StageSchema,
  APP_URL: Optional,
  PORTLESS_URL: Optional,
  /** Comma-separated extra origins allowed to send credentials. */
  ALLOWED_ORIGINS: Optional,
  AUTH_SECRET: Optional,
  AUTH_GITHUB_ID: Optional,
  AUTH_GITHUB_SECRET: Optional,
  AUTH_GOOGLE_ID: Optional,
  AUTH_GOOGLE_SECRET: Optional,
  AUTH_APPLE_ID: Optional,
  AUTH_APPLE_SECRET: Optional,
  AUTH_APPLE_BUNDLE_ID: Optional,
  AUTH_GITHUB_URL: Optional,
  AUTH_GITHUB_API_URL: Optional,
  AUTH_GOOGLE_URL: Optional,
  AUTH_GOOGLE_TOKEN_URL: Optional,
  AUTH_APPLE_URL: Optional,
  BYPASS_MAGIC_LINK: Optional,
  OTEL_EXPORTER_OTLP_ENDPOINT: Optional,
  /** `key=value,key2=value2`, as the OTel spec defines it. */
  OTEL_EXPORTER_OTLP_HEADERS: Optional,
});
export type Bindings = typeof Bindings.Type;

const truthy = (value: string | undefined): boolean =>
  value === "1" || value === "true";

const parseHeaders = (value: string | undefined): Record<string, string> =>
  Object.fromEntries(
    (value ?? "")
      .split(",")
      .map((pair) => pair.trim())
      .filter((pair) => pair.includes("="))
      .map((pair) => {
        const index = pair.indexOf("=");
        return [pair.slice(0, index).trim(), pair.slice(index + 1).trim()];
      }),
  );

const origins = (...urls: ReadonlyArray<string | undefined>) =>
  Array.from(
    new Set(
      urls
        .filter((url): url is string => !!url)
        .flatMap((url) => url.split(","))
        .map((url) => url.trim())
        .filter((url) => url.length > 0)
        .map((url) => new URL(url).origin),
    ),
  );

/**
 * Decodes bindings; throws on an invalid STAGE, or on a magic-link bypass
 * outside development, so a misconfigured Worker fails at load rather than
 * on its first request.
 */
export const fromBindings = (
  bindings: unknown,
  options?: { readonly version?: string | undefined },
): AppConfigShape => {
  const env = Schema.decodeUnknownSync(Bindings)(bindings);
  const baseUrl = env.PORTLESS_URL ?? env.APP_URL ?? "http://localhost:3001";
  const productionUrl = env.APP_URL ?? baseUrl;
  const bypassMagicLink = truthy(env.BYPASS_MAGIC_LINK);
  if (bypassMagicLink && env.STAGE !== "development") {
    // The bypass prints sign-in links to the log instead of emailing them,
    // which is a full auth bypass for anyone who can read the log. Never
    // outside development.
    throw new Error(
      `BYPASS_MAGIC_LINK is set but STAGE is "${env.STAGE}": the magic-link bypass is allowed only when STAGE=development. Unset BYPASS_MAGIC_LINK for this stage.`,
    );
  }
  return {
    stage: env.STAGE,
    version: options?.version ?? "0.0.0",
    appUrl: productionUrl,
    allowedOrigins: origins(baseUrl, productionUrl, env.ALLOWED_ORIGINS),
    auth: {
      secret: env.AUTH_SECRET,
      baseUrl,
      productionUrl,
      bypassMagicLink,
      github: {
        clientId: env.AUTH_GITHUB_ID ?? "",
        clientSecret: env.AUTH_GITHUB_SECRET ?? "",
        url: env.AUTH_GITHUB_URL,
        apiUrl: env.AUTH_GITHUB_API_URL,
      },
      google: {
        clientId: env.AUTH_GOOGLE_ID ?? "",
        clientSecret: env.AUTH_GOOGLE_SECRET ?? "",
        url: env.AUTH_GOOGLE_URL,
        tokenUrl: env.AUTH_GOOGLE_TOKEN_URL,
      },
      apple:
        env.AUTH_APPLE_ID && env.AUTH_APPLE_SECRET
          ? {
              clientId: env.AUTH_APPLE_ID,
              clientSecret: env.AUTH_APPLE_SECRET,
              bundleIdentifier: env.AUTH_APPLE_BUNDLE_ID,
              url: env.AUTH_APPLE_URL,
            }
          : undefined,
    },
    otlp: {
      endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
      headers: parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    },
    features: defaultFeatures,
  };
};
