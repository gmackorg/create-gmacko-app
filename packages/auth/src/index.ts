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
  bypassMagicLink?: boolean;
  sendMagicLinkEmail?: (params: {
    email: string;
    url: string;
  }) => Promise<void>;
  extraPlugins?: TExtraPlugins;
}) {
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
      },
      google: {
        clientId: options.googleClientId,
        clientSecret: options.googleClientSecret,
      },
      ...(options.appleClientId && options.appleClientSecret
        ? {
            apple: {
              clientId: options.appleClientId,
              clientSecret: options.appleClientSecret,
              appBundleIdentifier: options.appleBundleIdentifier,
            },
          }
        : {}),
    },
    trustedOrigins: [
      "expo://",
      "https://appleid.apple.com",
      "https://gmacko.localhost",
    ],
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
