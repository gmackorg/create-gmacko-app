/**
 * `OAuthConnections`: "Connected apps" in Settings — the user's OAuth
 * consents (one per client and pinned workspace), and revoking one. A
 * revocation deletes the consent and revokes every access and refresh token
 * issued for that client in that workspace, in one batch, so the next MCP
 * call is a 401 and the app has to be connected again.
 */
import { Database, type DatabaseError } from "@gmacko/db";
import {
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  workspace,
} from "@gmacko/db/schema";
import { NotFound } from "@gmacko/domain/errors";
import {
  OAuthConnection,
  OAuthConnectionWorkspace,
} from "@gmacko/domain/oauth";
import { toScopes } from "@gmacko/domain/scopes";
import { WorkspaceId } from "@gmacko/domain/settings";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Context, Effect, Layer, Option, Schema } from "effect";

export interface OAuthConnectionsShape {
  readonly list: (
    userId: string,
  ) => Effect.Effect<ReadonlyArray<OAuthConnection>, DatabaseError>;
  /** `NotFound` unless `id` is one of the caller's consents. */
  readonly revoke: (
    userId: string,
    id: string,
  ) => Effect.Effect<void, NotFound | DatabaseError>;
}

/** better-auth keeps `scopes` as JSON text (packages/db auth-schema.ts header). */
const decodeStrings = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(Schema.String)),
);

export class OAuthConnections extends Context.Service<
  OAuthConnections,
  OAuthConnectionsShape
>()("@gmacko/api/OAuthConnections") {
  static layer: Layer.Layer<OAuthConnections, never, Database> = Layer.effect(
    OAuthConnections,
  )(
    Effect.map(Database, ({ db, batch }) =>
      OAuthConnections.of({
        list: (userId) =>
          db
            .select({
              id: oauthConsent.id,
              clientId: oauthConsent.clientId,
              clientName: oauthClient.name,
              workspaceId: workspace.id,
              workspaceName: workspace.name,
              scopes: oauthConsent.scopes,
              createdAt: oauthConsent.createdAt,
            })
            .from(oauthConsent)
            .innerJoin(
              oauthClient,
              eq(oauthClient.clientId, oauthConsent.clientId),
            )
            .leftJoin(workspace, eq(workspace.id, oauthConsent.referenceId))
            .where(eq(oauthConsent.userId, userId))
            .orderBy(desc(oauthConsent.createdAt), desc(oauthConsent.id))
            .pipe(
              Effect.map((rows) =>
                rows.map(
                  (row) =>
                    new OAuthConnection({
                      id: row.id,
                      clientId: row.clientId,
                      clientName: row.clientName,
                      workspace:
                        row.workspaceId === null || row.workspaceName === null
                          ? null
                          : new OAuthConnectionWorkspace({
                              id: WorkspaceId.make(row.workspaceId),
                              name: row.workspaceName,
                            }),
                      scopes: toScopes(
                        Option.getOrElse(decodeStrings(row.scopes), () => []),
                      ),
                      createdAt: row.createdAt,
                    }),
                ),
              ),
            ),
        revoke: (userId, id) =>
          Effect.gen(function* () {
            const [consent] = yield* db
              .select({
                clientId: oauthConsent.clientId,
                referenceId: oauthConsent.referenceId,
              })
              .from(oauthConsent)
              .where(
                and(eq(oauthConsent.id, id), eq(oauthConsent.userId, userId)),
              )
              .limit(1);
            if (consent === undefined) {
              return yield* new NotFound({ resource: "oauthConnection", id });
            }
            const reference =
              consent.referenceId === null
                ? isNull(oauthAccessToken.referenceId)
                : eq(oauthAccessToken.referenceId, consent.referenceId);
            const refreshReference =
              consent.referenceId === null
                ? isNull(oauthRefreshToken.referenceId)
                : eq(oauthRefreshToken.referenceId, consent.referenceId);
            const now = new Date();
            yield* batch([
              db
                .update(oauthAccessToken)
                .set({ revoked: now })
                .where(
                  and(
                    eq(oauthAccessToken.userId, userId),
                    eq(oauthAccessToken.clientId, consent.clientId),
                    reference,
                    isNull(oauthAccessToken.revoked),
                  ),
                ),
              db
                .update(oauthRefreshToken)
                .set({ revoked: now })
                .where(
                  and(
                    eq(oauthRefreshToken.userId, userId),
                    eq(oauthRefreshToken.clientId, consent.clientId),
                    refreshReference,
                    isNull(oauthRefreshToken.revoked),
                  ),
                ),
              db.delete(oauthConsent).where(eq(oauthConsent.id, id)),
            ]);
          }),
      }),
    ),
  );
}
