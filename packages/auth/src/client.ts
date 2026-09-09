/**
 * Framework-agnostic better-auth client. Apps wrap it with their framework
 * entry (`better-auth/react`) and reuse `authClientPlugins` so the plugin set
 * stays in one place.
 *
 * GitHub and Google are registered server-side through the generic OAuth
 * plugin, which since better-auth 1.7 makes them ordinary social providers:
 * sign in with `signIn.social({ provider: "github" })`. There is no separate
 * `genericOAuthClient` / `signIn.oauth2` in 1.7.2.
 */
import { createAuthClient as createBetterAuthClient } from "better-auth/client";
import {
  deviceAuthorizationClient,
  magicLinkClient,
} from "better-auth/client/plugins";

/** Magic link, plus the device grant (`authClient.device.*`) behind mobile pairing. */
export const authClientPlugins = () => [
  magicLinkClient(),
  deviceAuthorizationClient(),
];

/**
 * `baseURL` is always passed, `undefined` included: the client resolves it
 * with `getBaseURL(options?.baseURL, …) ?? resolvePublicAuthUrl(…) ?? "/api/auth"`,
 * which reads an absent key and an explicit `undefined` identically, so
 * omitting it would only hide the field from the signature.
 */
export const createAuthClient = (options?: {
  readonly baseURL?: string | undefined;
}) =>
  createBetterAuthClient({
    baseURL: options?.baseURL,
    plugins: authClientPlugins(),
  });

export type AuthClient = ReturnType<typeof createAuthClient>;
