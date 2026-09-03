/**
 * The app's `Auth` layer: `@gmacko/auth` options derived from `AppConfig`,
 * built over `Database.plain`. TanStack Start's cookie plugin is added here
 * because it is a framework concern, not an auth-package one.
 */
import { type AuthOptions, logMagicLink, type MagicLink } from "@gmacko/auth";
import { Auth } from "@gmacko/auth/service";
import type { Database } from "@gmacko/db";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { Effect, Layer } from "effect";

import { AppConfig, type AppConfigShape } from "./config";

/**
 * TODO(Phase 6): deliver through the Resend-backed email service. Until then
 * a magic-link request outside development fails. The recipient is logged as
 * a structured field, never put in the error message: better-auth reports the
 * message to its error sink and it may end up in a response.
 */
const emailNotWired = async (link: MagicLink): Promise<void> => {
  // oxlint-disable-next-line no-console -- TODO(Phase 6): route through the Effect logger once the auth instance is built inside the runtime
  console.error(
    JSON.stringify({
      msg: "magic link not sent: email delivery is not configured",
      email: link.email,
    }),
  );
  throw new Error(
    "magic link email delivery is not configured; set BYPASS_MAGIC_LINK=true in development",
  );
};

export const makeAuthOptions = (
  config: AppConfigShape,
  overrides?: { readonly magicLink?: AuthOptions["magicLink"] },
): AuthOptions => ({
  baseUrl: config.auth.baseUrl,
  productionUrl: config.auth.productionUrl,
  secret: config.auth.secret,
  allowedOrigins: config.allowedOrigins,
  github: config.auth.github,
  google: config.auth.google,
  apple: config.auth.apple,
  magicLink: overrides?.magicLink ?? {
    send: config.auth.bypassMagicLink ? logMagicLink : emailNotWired,
  },
  extraPlugins: [tanstackStartCookies()],
});

export const AuthLive: Layer.Layer<Auth, never, Database | AppConfig> =
  Layer.unwrap(
    Effect.map(AppConfig, (config) => Auth.layer(makeAuthOptions(config))),
  );
