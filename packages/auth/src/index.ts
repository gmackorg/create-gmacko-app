/**
 * better-auth on Cloudflare D1 (drizzle sqlite adapter), built from explicit
 * options and an injected promise-drizzle instance so nothing here reads the
 * environment or opens a database at import time.
 */
import { expo } from "@better-auth/expo";
import type { PlainDatabase } from "@gmacko/db";
import type { UserRole, WorkspaceRole } from "@gmacko/db/schema";
import * as schema from "@gmacko/db/schema";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { magicLink } from "better-auth/plugins/magic-link";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";

export function isPlatformAdminRole(
  role: UserRole | null | undefined,
): role is "admin" {
  return role === "admin";
}

export function canManageWorkspace(
  role: WorkspaceRole | null | undefined,
): boolean {
  return role === "owner" || role === "admin";
}

export interface OAuthClient {
  readonly clientId: string;
  readonly clientSecret: string;
}

/** The shape every better-auth plugin has; see `AuthOptions.extraPlugins`. */
export interface AuthPluginLike {
  readonly id: string;
  readonly version?: string | undefined;
}

export interface MagicLink {
  readonly email: string;
  readonly url: string;
  readonly token: string;
}

export interface AuthOptions {
  /** Public origin this instance serves (cookies, callbacks). */
  readonly baseUrl: string;
  /** Origin registered with the OAuth providers; `oAuthProxy` relays previews to it. */
  readonly productionUrl: string;
  readonly secret: string | undefined;
  /** Origins allowed to send credentials (the app URL, the Expo dev origin). */
  readonly allowedOrigins: ReadonlyArray<string>;
  /** `url`/`apiUrl` default to github.com; emulate overrides them (AUTH_GITHUB_URL, AUTH_GITHUB_API_URL). */
  readonly github: OAuthClient & {
    readonly url?: string | undefined;
    readonly apiUrl?: string | undefined;
  };
  /** `url`/`tokenUrl` default to Google; emulate overrides them (AUTH_GOOGLE_URL, AUTH_GOOGLE_TOKEN_URL). */
  readonly google: OAuthClient & {
    readonly url?: string | undefined;
    readonly tokenUrl?: string | undefined;
  };
  /** Built-in provider; only the authorization endpoint is overridable in 1.7.2 (AUTH_APPLE_URL). */
  readonly apple?:
    | (OAuthClient & {
        readonly bundleIdentifier?: string | undefined;
        readonly url?: string | undefined;
      })
    | undefined;
  readonly magicLink: {
    /** Delivers the link; `logMagicLink` is the bypass used in development. */
    readonly send: (link: MagicLink) => Promise<void>;
  };
  /**
   * Framework plugins the app adds (e.g. `tanstackStartCookies()`). Typed
   * loosely on purpose: pnpm installs one `better-auth` copy per distinct
   * peer set, so a plugin created in an app resolves to a different copy of
   * `@better-auth/core` than this package and its `HookEndpointContext` is
   * nominally incompatible. Structurally the objects are identical.
   */
  readonly extraPlugins?: ReadonlyArray<AuthPluginLike> | undefined;
  /** Sink for better-auth API errors; defaults to `console.error`. */
  readonly onError?: ((error: unknown) => void) | undefined;
}

/**
 * Bypass delivery: prints the link instead of emailing it. TODO(Phase 6):
 * route through the Effect logger once the auth instance is built inside a
 * runtime that can hand a logger callback in.
 */
export const logMagicLink = async (link: MagicLink): Promise<void> => {
  // oxlint-disable-next-line no-console -- deliberate bypass sink
  console.info(
    JSON.stringify({
      msg: "magic link generated (bypass mode)",
      email: link.email,
      url: link.url,
    }),
  );
};

interface GithubProfile {
  readonly id: number;
  readonly login: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly avatar_url: string | null;
}

interface GithubEmail {
  readonly email: string;
  readonly primary: boolean;
  readonly verified: boolean;
}

/**
 * The generic plugin's default user-info fetch expects OIDC claims
 * (`picture`, `email_verified`); GitHub returns `avatar_url` and may hide the
 * email, so mirror what the built-in provider does with `/user/emails`.
 */
const githubUserInfo =
  (apiUrl: string) => async (tokens: { accessToken?: string | undefined }) => {
    // No token, no identity: never call the API with an empty bearer.
    if (!tokens.accessToken) return null;
    const headers = {
      authorization: `Bearer ${tokens.accessToken}`,
      "user-agent": "gmacko-auth",
    };
    const profileResponse = await fetch(`${apiUrl}/user`, { headers });
    if (!profileResponse.ok) return null;
    const profile = (await profileResponse.json()) as GithubProfile;
    let email = profile.email;
    let emailVerified = email !== null;
    if (!email) {
      const emailsResponse = await fetch(`${apiUrl}/user/emails`, { headers });
      if (emailsResponse.ok) {
        const emails =
          (await emailsResponse.json()) as ReadonlyArray<GithubEmail>;
        const primary = emails.find((e) => e.primary) ?? emails[0];
        email = primary?.email ?? null;
        emailVerified = primary?.verified ?? false;
      }
    }
    if (!email) return null;
    return {
      id: String(profile.id),
      email,
      emailVerified,
      name: profile.name ?? profile.login,
      image: profile.avatar_url ?? undefined,
    };
  };

export function makeAuth(options: AuthOptions, db: PlainDatabase) {
  const githubUrl = options.github.url ?? "https://github.com";
  const githubApiUrl = options.github.apiUrl ?? "https://api.github.com";
  const googleUrl = options.google.url ?? "https://accounts.google.com";
  const googleTokenUrl =
    options.google.tokenUrl ?? "https://oauth2.googleapis.com/token";
  const appleUrl = options.apple?.url ?? "https://appleid.apple.com";
  const onError =
    options.onError ??
    ((error: unknown) => {
      // oxlint-disable-next-line no-console -- default sink until the Effect logger is threaded through
      console.error("better-auth API error", error);
    });

  const config = {
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
      // D1 has no interactive transactions; the adapter must never call
      // `db.transaction`. (This is also the adapter's default.)
      transaction: false,
    }),
    baseURL: options.baseUrl,
    secret: options.secret,
    user: {
      additionalFields: {
        // Mirrors `user.role` in @gmacko/db's auth-schema so the session's
        // user carries it and `auth generate` keeps the column.
        role: {
          type: ["user", "admin"],
          required: false,
          defaultValue: "user",
          input: false,
        },
      },
    },
    session: {
      // The signed cookie serves `getSession` for up to 5 minutes without a
      // D1 read. Anything that gates on `user.role` (admin routes, the
      // AdminOnly middleware) or on a revoked session must read fresh:
      // `getSession({ headers, query: { disableCookieCache: true } })`.
      // TODO(Phase 3): the Authentication/AdminOnly middlewares do this.
      cookieCache: { enabled: true, maxAge: 300 },
    },
    plugins: [
      oAuthProxy({ productionURL: options.productionUrl }),
      expo(),
      magicLink({
        sendMagicLink: ({ email, url, token }) =>
          options.magicLink.send({ email, url, token }),
      }),
      // GitHub and Google as generic providers (first-class social providers
      // since 1.7.0, signed in through `/sign-in/social`): unlike the built-in
      // providers, every endpoint is configurable, which is what lets emulate
      // stand in for them locally.
      genericOAuth({
        config: [
          {
            providerId: "github",
            clientId: options.github.clientId,
            clientSecret: options.github.clientSecret,
            authorizationUrl: `${githubUrl}/login/oauth/authorize`,
            tokenUrl: `${githubUrl}/login/oauth/access_token`,
            userInfoUrl: `${githubApiUrl}/user`,
            getUserInfo: githubUserInfo(githubApiUrl),
            scopes: ["read:user", "user:email"],
            // GitHub's authorization server ignores PKCE; emulate rejects
            // unknown token parameters, so match the built-in provider.
            pkce: false,
          },
          {
            providerId: "google",
            clientId: options.google.clientId,
            clientSecret: options.google.clientSecret,
            authorizationUrl: `${googleUrl}/o/oauth2/v2/auth`,
            tokenUrl: googleTokenUrl,
            // User info comes from the id_token claims (the plugin decodes it
            // before falling back to a userinfo endpoint).
            scopes: ["openid", "email", "profile"],
            prompt: "select_account",
          },
        ],
      }),
      ...((options.extraPlugins ?? []) as ReadonlyArray<BetterAuthPlugin>),
    ],
    socialProviders: options.apple
      ? {
          apple: {
            clientId: options.apple.clientId,
            clientSecret: options.apple.clientSecret,
            appBundleIdentifier: options.apple.bundleIdentifier,
            ...(options.apple.url
              ? { authorizationEndpoint: `${appleUrl}/auth/authorize` }
              : {}),
          },
        }
      : {},
    trustedOrigins: [
      "expo://",
      ...options.allowedOrigins,
      ...(options.apple ? [appleUrl] : []),
    ],
    onAPIError: {
      onError(error) {
        onError(error);
      },
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof makeAuth>;
export type Session = Auth["$Infer"]["Session"];
export type User = Session["user"];
