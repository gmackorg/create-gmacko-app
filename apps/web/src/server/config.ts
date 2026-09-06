/**
 * `fromBindings`: the validated, typed view of the Worker bindings as
 * `@gmacko/api`'s `AppConfig`. Built once in `runtime.ts` from
 * `cloudflare:workers` env (and from a literal object in tests); nothing
 * else reads bindings or `process.env`.
 */
import {
  type AppConfigShape,
  defaultFeatures,
  type FeatureFlags,
} from "@gmacko/api";
import { Stage as StageSchema } from "@gmacko/domain/health";
import { Schema } from "effect";

export { AppConfig, type AppConfigShape, type Stage } from "@gmacko/api";

const Optional = Schema.optional(Schema.String);

/**
 * The bindings this app reads. Secrets are optional at the type level so a
 * bare local checkout boots; `fromBindings` requires them in staging and
 * production (`requiredSecrets`) and fails at load with the missing list.
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
  /** Stripe's API key; required in staging/production when the Stripe feature is on. */
  STRIPE_SECRET_KEY: Optional,
  /** Stripe's signing secret for `POST /api/webhooks/stripe`; unset → the route answers 503. */
  STRIPE_WEBHOOK_SECRET: Optional,
});
export type Bindings = typeof Bindings.Type;

/** The stages that must carry real secrets; development and PR previews may run bare. */
const STRICT_STAGES: ReadonlySet<string> = new Set(["staging", "production"]);

const OAUTH_PAIRS = [
  ["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"],
  ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"],
  ["AUTH_APPLE_ID", "AUTH_APPLE_SECRET"],
] as const satisfies ReadonlyArray<readonly [keyof Bindings, keyof Bindings]>;

const present = (env: Bindings, key: keyof Bindings): boolean => {
  const value = env[key];
  return value !== undefined && value.length > 0;
};

/**
 * What a strict stage is missing: `AUTH_SECRET`, one complete OAuth pair
 * (half a pair is not a provider), and the Stripe secrets when the Stripe
 * feature is on. Empty when everything is there or the stage is permissive.
 */
export const requiredSecrets = (
  env: Bindings,
  features: Pick<FeatureFlags, "stripe">,
): ReadonlyArray<string> => {
  if (!STRICT_STAGES.has(env.STAGE)) return [];
  const missing: string[] = [];
  if (!present(env, "AUTH_SECRET")) missing.push("AUTH_SECRET");
  if (
    !OAUTH_PAIRS.some(
      ([id, secret]) => present(env, id) && present(env, secret),
    )
  ) {
    const pairs = OAUTH_PAIRS.map((pair) => pair.join("+"));
    missing.push(
      `one OAuth provider pair (${pairs.slice(0, -1).join(", ")} or ${pairs.at(-1)})`,
    );
  }
  if (features.stripe) {
    for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const) {
      if (!present(env, key)) missing.push(key);
    }
  }
  return missing;
};

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
 * Decodes bindings; throws on an invalid STAGE, on a magic-link bypass
 * outside development, or on a secret missing in staging/production, so a
 * misconfigured Worker fails at load (visible in the deploy) rather than
 * on its first request. `features` defaults to what `@gmacko/config`
 * ships; a test flips one.
 */
export const fromBindings = (
  // `bindings` is the Worker's ambient `env` (a literal object in the
  // suites), and the decode this rule asks for is the first line of the
  // body. config.test.ts hands this an unknown STAGE precisely to prove it
  // throws here, so a narrower parameter type would move the check to the
  // wrong side of it.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  bindings: unknown,
  options?: {
    readonly version?: string | undefined;
    readonly features?: Partial<FeatureFlags> | undefined;
  },
): AppConfigShape => {
  const env = Schema.decodeUnknownSync(Bindings)(bindings);
  const features: FeatureFlags = { ...defaultFeatures, ...options?.features };
  const missing = requiredSecrets(env, features);
  if (missing.length > 0) {
    throw new Error(
      `STAGE is "${env.STAGE}" but the Worker is missing: ${missing.join(", ")}. Set them in ForgeGraph and push with \`pnpm secrets:push --stage ${env.STAGE}\`.`,
    );
  }
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
    features,
  };
};

/** What the web app reads beyond `AppConfig`: the Stripe webhook secret and the CSP `connect-src` extras. */
export interface WebConfig {
  readonly stripeWebhookSecret: string | undefined;
  /** Origins the browser may call besides its own: PostHog, Sentry ingest. */
  readonly connectSrc: ReadonlyArray<string>;
}

const originOf = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

export const webFromBindings = (
  // The same boundary as `fromBindings`: `Schema.decodeUnknownSync(Bindings)`
  // on the first line of the body is what turns this input into a type.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  bindings: unknown,
  client: {
    readonly posthogHost: string | undefined;
    readonly sentryDsn: string | undefined;
  },
): WebConfig => {
  const env = Schema.decodeUnknownSync(Bindings)(bindings);
  const connectSrc = [
    originOf(client.posthogHost ?? "https://us.i.posthog.com"),
    originOf(client.sentryDsn),
  ].filter((origin): origin is string => origin !== undefined);
  return {
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    connectSrc: Array.from(new Set(connectSrc)),
  };
};
