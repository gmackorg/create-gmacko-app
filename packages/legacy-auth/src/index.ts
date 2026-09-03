import { expo } from "@better-auth/expo";
import { db } from "@gmacko/legacy-db/client";
import type { WorkspaceRole } from "@gmacko/legacy-db/schema";
import { createLogger } from "@gmacko/logging";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, oAuthProxy } from "better-auth/plugins";

const log = createLogger({ module: "auth" });

export function isPlatformAdminRole(
  role: "user" | "admin" | null | undefined,
): role is "admin" {
  return role === "admin";
}

export function canManageWorkspace(
  role: WorkspaceRole | null | undefined,
): boolean {
  return role === "owner" || role === "admin";
}

export function initAuth<
  TExtraPlugins extends BetterAuthPlugin[] = [],
>(options: {
  baseUrl: string;
  productionUrl: string;
  secret: string | undefined;

  githubClientId: string;
  githubClientSecret: string;
  googleClientId: string;
  googleClientSecret: string;
  appleClientId?: string;
  appleClientSecret?: string;
  appleBundleIdentifier?: string;
  githubUrl?: string;
  githubApiUrl?: string;
  googleUrl?: string;
  googleTokenUrl?: string;
  appleUrl?: string;
  bypassMagicLink?: boolean;
  sendMagicLinkEmail?: (params: {
    email: string;
    url: string;
  }) => Promise<void>;
  extraPlugins?: TExtraPlugins;
}) {
  const ghUrl = options.githubUrl ?? "https://github.com";
  const googleUrl = options.googleUrl ?? "https://accounts.google.com";
  const appleUrl = options.appleUrl ?? "https://appleid.apple.com";

  const config = {
    database: drizzleAdapter(db, {
      provider: "pg",
    }),
    baseURL: options.baseUrl,
    secret: options.secret,
    plugins: [
      oAuthProxy({
        productionURL: options.productionUrl,
      }),
      expo(),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          if (options.bypassMagicLink) {
            log.info({ email, url }, "magic link generated (bypass mode)");
            return;
          }
          if (options.sendMagicLinkEmail) {
            await options.sendMagicLinkEmail({ email, url });
          }
        },
      }),
      ...(options.extraPlugins ?? []),
    ],
    // better-auth 1.7.2 (published) only honours `authorizationEndpoint` on the
    // built-in social providers; the `tokenEndpoint` / `userInfoEndpoint` /
    // `jwksEndpoint` overrides came from the unmerged upstream PR #8814 that
    // the old pkg.pr.new pin tracked. Token and user-info calls therefore go to
    // the real GitHub/Google/Apple hosts, so the emulate-based GitHub/Google
    // flows are no longer supported for this legacy package. The Effect
    // rewrite (@gmacko/auth) uses the genericOAuth plugin instead, whose
    // tokenUrl/userInfoUrl are configurable.
    socialProviders: {
      github: {
        clientId: options.githubClientId,
        clientSecret: options.githubClientSecret,
        authorizationEndpoint: `${ghUrl}/login/oauth/authorize`,
      },
      google: {
        clientId: options.googleClientId,
        clientSecret: options.googleClientSecret,
        authorizationEndpoint: `${googleUrl}/o/oauth2/v2/auth`,
      },
      ...(options.appleClientId && options.appleClientSecret
        ? {
            apple: {
              clientId: options.appleClientId,
              clientSecret: options.appleClientSecret,
              appBundleIdentifier: options.appleBundleIdentifier,
              authorizationEndpoint: `${appleUrl}/auth/authorize`,
            },
          }
        : {}),
    },
    trustedOrigins: ["expo://", appleUrl, "https://gmacko.localhost"],
    onAPIError: {
      onError(error, ctx) {
        log.error({ err: error, context: ctx }, "better-auth API error");
      },
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
/** This package's `BetterAuthPlugin`; apps cast framework plugins to it (see apps/nextjs). */
export type AuthPlugin = BetterAuthPlugin;
export type Session = Auth["$Infer"]["Session"];
