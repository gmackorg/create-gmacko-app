import { expo } from "@better-auth/expo";
import { db } from "@gmacko/db/client";
import type { WorkspaceRole } from "@gmacko/db/schema";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, oAuthProxy } from "better-auth/plugins";

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
  const ghApiUrl = options.githubApiUrl ?? "https://api.github.com";
  const googleUrl = options.googleUrl ?? "https://accounts.google.com";
  const googleTokenUrl =
    options.googleTokenUrl ?? "https://oauth2.googleapis.com/token";
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
            console.log(`[auth] Magic link for ${email}: ${url}`);
            return;
          }
          if (options.sendMagicLinkEmail) {
            await options.sendMagicLinkEmail({ email, url });
          }
        },
      }),
      ...(options.extraPlugins ?? []),
    ],
    socialProviders: {
      github: {
        clientId: options.githubClientId,
        clientSecret: options.githubClientSecret,
        authorizationEndpoint: `${ghUrl}/login/oauth/authorize`,
        tokenEndpoint: `${ghUrl}/login/oauth/access_token`,
        userInfoEndpoint: `${ghApiUrl}/user`,
      },
      google: {
        clientId: options.googleClientId,
        clientSecret: options.googleClientSecret,
        authorizationEndpoint: `${googleUrl}/o/oauth2/v2/auth`,
        tokenEndpoint: googleTokenUrl,
      },
      ...(options.appleClientId && options.appleClientSecret
        ? {
            apple: {
              clientId: options.appleClientId,
              clientSecret: options.appleClientSecret,
              appBundleIdentifier: options.appleBundleIdentifier,
              authorizationEndpoint: `${appleUrl}/auth/authorize`,
              tokenEndpoint: `${appleUrl}/auth/token`,
              jwksEndpoint: `${appleUrl}/auth/keys`,
            },
          }
        : {}),
    },
    trustedOrigins: ["expo://", appleUrl, "https://gmacko.localhost"],
    onAPIError: {
      onError(error, ctx) {
        console.error("BETTER AUTH API ERROR", error, ctx);
      },
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
