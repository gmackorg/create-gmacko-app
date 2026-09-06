/**
 * `AppConfig`: what the services need to know about the deployment, as one
 * typed service. The app builds it once from its bindings (apps/web
 * `fromBindings`, the only reader of `cloudflare:workers` env); tests pass a
 * literal. Nothing in this package reads `process.env`.
 */
import { integrations, saasFeatures } from "@gmacko/config";
import type { Stage } from "@gmacko/domain/health";
import { Context } from "effect";

export type { Stage } from "@gmacko/domain/health";

export interface OAuthClientConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface AuthConfig {
  readonly secret: string | undefined;
  /** Public origin this instance serves (cookies, callbacks). */
  readonly baseUrl: string;
  /** Origin registered with the OAuth providers; `oAuthProxy` relays previews to it. */
  readonly productionUrl: string;
  /** Print magic links to the log instead of emailing them; development only. */
  readonly bypassMagicLink: boolean;
  readonly github: OAuthClientConfig & {
    readonly url?: string | undefined;
    readonly apiUrl?: string | undefined;
  };
  readonly google: OAuthClientConfig & {
    readonly url?: string | undefined;
    readonly tokenUrl?: string | undefined;
  };
  readonly apple?:
    | (OAuthClientConfig & {
        readonly bundleIdentifier?: string | undefined;
        readonly url?: string | undefined;
      })
    | undefined;
}

/**
 * The feature switches the API reads (the rest of `@gmacko/config` is for
 * the apps). Plain booleans so a test can flip one without touching the
 * `as const` module.
 */
export interface FeatureFlags {
  /** `saasFeatures.billing`: the billing panel and its read model. */
  readonly billing: boolean;
  /** `saasFeatures.metering`: usage meters and limits. */
  readonly metering: boolean;
  /** `saasFeatures.collaboration`: workspace invites. */
  readonly collaboration: boolean;
  /** `integrations.stripe`: a payment provider is configured. */
  readonly stripe: boolean;
}

export interface AppConfigShape {
  readonly stage: Stage;
  /** The build's version (Vite `__APP_VERSION__`): telemetry, Sentry, health. */
  readonly version: string;
  /** Public origin of this deployment. */
  readonly appUrl: string;
  /** Origins allowed to send credentials: CORS, better-auth trustedOrigins, cookie rule. */
  readonly allowedOrigins: ReadonlyArray<string>;
  readonly auth: AuthConfig;
  readonly otlp: {
    /** Unset → telemetry export is off. */
    readonly endpoint: string | undefined;
    readonly headers: Readonly<Record<string, string>>;
  };
  readonly features: FeatureFlags;
}

/** The switches as `@gmacko/config` ships them. */
export const defaultFeatures: FeatureFlags = {
  billing: saasFeatures.billing,
  metering: saasFeatures.metering,
  collaboration: saasFeatures.collaboration,
  stripe: integrations.stripe,
};

/**
 * Whether sign-in may create an account without an invite. Replaces the
 * legacy `NODE_ENV !== "production"` rule: only the development stage.
 */
export const canAutoCreateAccounts = (stage: Stage): boolean =>
  stage === "development";

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()(
  "@gmacko/api/AppConfig",
) {}
