/**
 * The app as an OAuth 2.1 authorization server for its remote MCP endpoint
 * (`@better-auth/oauth-provider`). An MCP client registers itself (dynamic
 * client registration, no credentials), sends the user through
 * `/api/auth/oauth2/authorize` with PKCE and `resource=<app>/mcp`, and gets
 * an opaque access token that is:
 *
 * - pinned to one workspace: after sign-in the user picks it on
 *   `/oauth/workspace` (the plugin's `postLogin` step); the pick lands in
 *   `oauth_workspace_selection` and `consentReferenceId` turns it into the
 *   consent's — and so every token's — `referenceId`;
 * - limited to the scopes the user ticked on `/oauth/consent`, drawn from the
 *   OAuth-grantable part of the scope catalog (`OAUTH_SCOPES`); the key-only
 *   scopes are not in the plugin's scope list or the resource's allowed
 *   scopes, so no request can obtain them;
 * - bound to the `/mcp` resource, and stored as `sha256(token)` hex like a
 *   `gmk_` key (minus the `gmo_` prefix), so `OAuthTokens` (oauth-tokens.ts)
 *   can verify it with one indexed read without going through the plugin.
 *
 * A token records the better-auth session that approved it. When that
 * session expires the token stops working (the plugin's own rule, mirrored
 * by `OAuthTokens`); signing out deletes the session row, which clears the
 * reference (`ON DELETE SET NULL`) and leaves the token to its own expiry.
 */
import {
  oauthProvider,
  oauthProviderAuthServerMetadata,
} from "@better-auth/oauth-provider";
import type { PlainDatabase } from "@gmacko/db";
import {
  oauthWorkspaceSelection,
  workspaceMembership,
} from "@gmacko/db/schema";
import { OAUTH_SCOPES } from "@gmacko/domain/scopes";
import { and, eq } from "drizzle-orm";

import { sha256Hex } from "./api-keys";

/** `refresh_token` grants are issued only to a client that asked for this scope. */
const OFFLINE_ACCESS = "offline_access";

/** Prefix on every access token the provider issues; `gmk_` is an API key. */
export const OAUTH_ACCESS_TOKEN_PREFIX = "gmo_";
export const OAUTH_REFRESH_TOKEN_PREFIX = "gmr_";

/** The browser pages the plugin redirects to (apps/web/src/routes/oauth.*). */
export const OAUTH_PAGES = {
  signIn: "/oauth/sign-in",
  workspace: "/oauth/workspace",
  consent: "/oauth/consent",
} as const;

/**
 * RFC 8414 authorization-server metadata, for the `/.well-known` routes: the
 * issuer is `<app>/api/auth`, so clients look for it at
 * `/.well-known/oauth-authorization-server/api/auth` (and, older MCP
 * clients, at the bare path).
 */
export const authorizationServerMetadata = oauthProviderAuthServerMetadata;

/** The protected resource the provider issues tokens for. */
export const mcpResource = (baseUrl: string): string =>
  new URL("/mcp", baseUrl).toString();

/**
 * The session's workspace pick, when the user is still a member of it.
 * A pick whose membership is gone reads as no pick, so the flow sends the
 * user back to choose again rather than pinning a workspace they left.
 */
export const selectedWorkspace = async (
  db: PlainDatabase,
  session: { readonly id: string; readonly userId: string },
): Promise<string | null> => {
  const [row] = await db
    .select({ workspaceId: oauthWorkspaceSelection.workspaceId })
    .from(oauthWorkspaceSelection)
    .innerJoin(
      workspaceMembership,
      and(
        eq(
          workspaceMembership.workspaceId,
          oauthWorkspaceSelection.workspaceId,
        ),
        eq(workspaceMembership.userId, oauthWorkspaceSelection.userId),
      ),
    )
    .where(
      and(
        eq(oauthWorkspaceSelection.sessionId, session.id),
        eq(oauthWorkspaceSelection.userId, session.userId),
      ),
    );
  return row?.workspaceId ?? null;
};

export const oauthProviderPlugin = (options: {
  readonly baseUrl: string;
  readonly db: PlainDatabase;
}) => {
  const scopes = [...OAUTH_SCOPES, OFFLINE_ACCESS];
  const mcp = mcpResource(options.baseUrl);
  return oauthProvider({
    loginPage: OAUTH_PAGES.signIn,
    consentPage: OAUTH_PAGES.consent,
    // Not an OIDC provider: no `openid`, so no id tokens or userinfo.
    scopes,
    grantTypes: ["authorization_code", "refresh_token"],
    // MCP clients register themselves and carry no credentials to do it.
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    // Desktop MCP clients (Claude Code, Cursor) register an
    // `http://127.0.0.1:<port>` callback without `application_type`; infer
    // `native` for loopback and custom-scheme redirects so they can, while
    // https web clients keep the web rules.
    clientRegistrationDefaultApplicationType: "infer",
    clientRegistrationDefaultScopes: scopes,
    clientRegistrationAllowedScopes: scopes,
    resources: [{ identifier: mcp, name: "MCP", allowedScopes: scopes }],
    // Clients are linked to the resources they may request tokens for; every
    // registered client gets the one resource there is.
    clientRegistrationDefaultResources: [mcp],
    // Opaque tokens, verified in this Worker: nothing to sign, no JWKS to
    // rotate, and revoking a grant takes effect on the next request.
    disableJwtPlugin: true,
    prefix: {
      opaqueAccessToken: OAUTH_ACCESS_TOKEN_PREFIX,
      refreshToken: OAUTH_REFRESH_TOKEN_PREFIX,
    },
    // Same storage as `gmk_` keys: sha256 hex. The plugin hashes the token
    // without its prefix, at issuance and at every lookup.
    storeTokens: { hash: (token) => sha256Hex(token) },
    postLogin: {
      page: OAUTH_PAGES.workspace,
      // Every fresh authorization asks which workspace; the continuation
      // after the pick goes on only when the pick is still a membership.
      shouldRedirect: async ({ session, isContinuation }) =>
        !isContinuation ||
        (await selectedWorkspace(options.db, session)) === null,
      consentReferenceId: async ({ session }) => {
        const workspaceId = await selectedWorkspace(options.db, session);
        // The plugin's contract: fail here when the reference is required.
        if (workspaceId === null) {
          throw new Error("no workspace selected for this authorization");
        }
        return workspaceId;
      },
    },
  });
};
