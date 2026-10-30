/**
 * `OAuthTokens`: verifies the opaque `gmo_` access tokens the OAuth provider
 * (oauth-provider.ts) issues, the way `ApiKeys.authenticate` verifies `gmk_`
 * keys — one indexed read by `sha256(token)` — rather than through the
 * plugin's introspection endpoint, which needs a confidential client.
 *
 * A token authenticates only when all of these hold; any miss is
 * `Unauthorized` (an OAuth client answers it by authorizing again):
 *
 * - it is the token as issued, unexpired and unrevoked, and its client still
 *   exists and is not disabled;
 * - it was issued for `resource` (the token's audience): a token for the
 *   `/mcp` endpoint is not a credential anywhere else;
 * - the session that approved it, when it still has one, has not expired
 *   (the plugin's own rule);
 * - its user still exists, and is still a member of the workspace the grant
 *   is pinned to (`referenceId`): leaving the workspace ends the token on
 *   the next request.
 *
 * The scopes it carries are the consented ones, filtered to the catalog.
 */
import { Database, type DatabaseError } from "@gmacko/db";
import {
  oauthAccessToken,
  oauthClient,
  session,
  user,
  workspaceMembership,
} from "@gmacko/db/schema";
import {
  type Scope,
  toScopes,
  Unauthorized,
  type User,
  WorkspaceId,
  WorkspaceMemberRole,
} from "@gmacko/domain";
import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, Schema } from "effect";

import { hashSecret } from "./api-keys";
import { OAUTH_ACCESS_TOKEN_PREFIX } from "./oauth-provider";
import { toUser } from "./user";

export interface AuthenticatedOAuthToken {
  readonly user: User;
  readonly clientId: string;
  readonly scopes: ReadonlyArray<Scope>;
  /** The workspace the grant is pinned to, and the user's role in it now. */
  readonly workspaceId: WorkspaceId;
  readonly role: WorkspaceMemberRole;
}

export interface OAuthTokensShape {
  readonly authenticate: (
    bearer: string,
    resource: string,
  ) => Effect.Effect<AuthenticatedOAuthToken, Unauthorized | DatabaseError>;
}

/**
 * The protected resource a request is being served for. The `/mcp` endpoint
 * provides it (through the API handler's per-request context, which a
 * caller cannot set) when it dispatches a tool call; a `gmo_` bearer on a
 * request without it — a direct API call — is refused.
 */
export class OAuthResource extends Context.Service<
  OAuthResource,
  { readonly resource: string }
>()("@gmacko/auth/OAuthResource") {}

/** better-auth keeps these as JSON text (packages/db auth-schema.ts header). */
const decodeStrings = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(Schema.String)),
);
const strings = (text: string | null): ReadonlyArray<string> =>
  text === null ? [] : Option.getOrElse(decodeStrings(text), () => []);

const decodeRole = Schema.decodeUnknownOption(WorkspaceMemberRole);

export const isOAuthAccessToken = (bearer: string): boolean =>
  bearer.startsWith(OAUTH_ACCESS_TOKEN_PREFIX);

export class OAuthTokens extends Context.Service<
  OAuthTokens,
  OAuthTokensShape
>()("@gmacko/auth/OAuthTokens") {
  static layer: Layer.Layer<OAuthTokens, never, Database> = Layer.effect(
    OAuthTokens,
  )(
    Effect.map(Database, ({ db }) =>
      OAuthTokens.of({
        authenticate: (bearer, resource) =>
          Effect.gen(function* () {
            if (!isOAuthAccessToken(bearer)) return yield* new Unauthorized();
            const hash = yield* hashSecret(
              bearer.slice(OAUTH_ACCESS_TOKEN_PREFIX.length),
            );
            const [row] = yield* db
              .select({
                token: oauthAccessToken,
                owner: user,
                clientDisabled: oauthClient.disabled,
                sessionExpiresAt: session.expiresAt,
              })
              .from(oauthAccessToken)
              .innerJoin(user, eq(user.id, oauthAccessToken.userId))
              .innerJoin(
                oauthClient,
                eq(oauthClient.clientId, oauthAccessToken.clientId),
              )
              .leftJoin(session, eq(session.id, oauthAccessToken.sessionId))
              .where(eq(oauthAccessToken.token, hash))
              .limit(1);
            if (row === undefined) return yield* new Unauthorized();
            const { token, owner } = row;
            const now = new Date();
            if (token.expiresAt < now || token.revoked !== null) {
              return yield* new Unauthorized();
            }
            if (row.clientDisabled === true) return yield* new Unauthorized();
            if (!strings(token.resources).includes(resource)) {
              return yield* new Unauthorized();
            }
            // A session that is gone (signed out) leaves `sessionId` null;
            // one that is still there must not have expired.
            if (
              token.sessionId !== null &&
              (row.sessionExpiresAt === null || row.sessionExpiresAt < now)
            ) {
              return yield* new Unauthorized();
            }
            if (token.referenceId === null) return yield* new Unauthorized();
            const [membership] = yield* db
              .select({ role: workspaceMembership.role })
              .from(workspaceMembership)
              .where(
                and(
                  eq(workspaceMembership.workspaceId, token.referenceId),
                  eq(workspaceMembership.userId, owner.id),
                ),
              )
              .limit(1);
            const role = decodeRole(membership?.role);
            if (Option.isNone(role)) return yield* new Unauthorized();
            return {
              user: toUser(owner),
              clientId: token.clientId,
              scopes: toScopes(strings(token.scopes)),
              workspaceId: WorkspaceId.make(token.referenceId),
              role: role.value,
            };
          }),
      }),
    ),
  );
}
