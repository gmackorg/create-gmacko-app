/**
 * `OAuthWorkspaces`: the workspace picker behind `/oauth/workspace`, the
 * step of authorizing an OAuth client (the MCP endpoint's) where the user
 * pins the grant to one workspace. The pick is stored per browser session in
 * `oauth_workspace_selection`; `@gmacko/auth`'s OAuth provider reads it back
 * (re-checking the membership) when the user consents.
 */
import { Database, type DatabaseError } from "@gmacko/db";
import {
  oauthWorkspaceSelection,
  workspace,
  workspaceMembership,
} from "@gmacko/db/schema";
import { NotFound } from "@gmacko/domain/errors";
import { OAuthWorkspace, OAuthWorkspaceChoice } from "@gmacko/domain/oauth";
import { WorkspaceMemberRole } from "@gmacko/domain/security";
import { WorkspaceId } from "@gmacko/domain/settings";
import { and, asc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, Schema } from "effect";

export interface OAuthWorkspacesShape {
  /** The caller's memberships, earliest first, and this session's current pick. */
  readonly choice: (
    userId: string,
    sessionId: string,
  ) => Effect.Effect<OAuthWorkspaceChoice, DatabaseError>;
  /** `NotFound` unless the caller is a member of `workspaceId`. */
  readonly select: (
    userId: string,
    sessionId: string,
    workspaceId: string,
  ) => Effect.Effect<OAuthWorkspaceChoice, NotFound | DatabaseError>;
}

/** `role` is `text` in D1; a value outside the contract is not a membership. */
const decodeRole = Schema.decodeUnknownOption(WorkspaceMemberRole);

export class OAuthWorkspaces extends Context.Service<
  OAuthWorkspaces,
  OAuthWorkspacesShape
>()("@gmacko/api/OAuthWorkspaces") {
  static layer: Layer.Layer<OAuthWorkspaces, never, Database> = Layer.effect(
    OAuthWorkspaces,
  )(
    Effect.map(Database, ({ db }) => {
      const memberships = (userId: string) =>
        db
          .select({
            id: workspace.id,
            name: workspace.name,
            role: workspaceMembership.role,
          })
          .from(workspaceMembership)
          .innerJoin(
            workspace,
            eq(workspace.id, workspaceMembership.workspaceId),
          )
          .where(eq(workspaceMembership.userId, userId))
          .orderBy(
            asc(workspaceMembership.createdAt),
            asc(workspaceMembership.id),
          )
          .pipe(
            Effect.map((rows) =>
              rows.flatMap((row) =>
                Option.match(decodeRole(row.role), {
                  onNone: () => [],
                  onSome: (role) => [
                    new OAuthWorkspace({
                      id: WorkspaceId.make(row.id),
                      name: row.name,
                      role,
                    }),
                  ],
                }),
              ),
            ),
          );

      const choice = (userId: string, sessionId: string) =>
        Effect.gen(function* () {
          const workspaces = yield* memberships(userId);
          const [pick] = yield* db
            .select({ workspaceId: oauthWorkspaceSelection.workspaceId })
            .from(oauthWorkspaceSelection)
            .where(
              and(
                eq(oauthWorkspaceSelection.sessionId, sessionId),
                eq(oauthWorkspaceSelection.userId, userId),
              ),
            );
          const selected =
            workspaces.find((w) => w.id === pick?.workspaceId)?.id ?? null;
          return new OAuthWorkspaceChoice({ workspaces, selected });
        });

      return OAuthWorkspaces.of({
        choice,
        select: (userId, sessionId, workspaceId) =>
          Effect.gen(function* () {
            const workspaces = yield* memberships(userId);
            if (!workspaces.some((w) => w.id === workspaceId)) {
              return yield* new NotFound({
                resource: "workspace",
                id: workspaceId,
              });
            }
            yield* db
              .insert(oauthWorkspaceSelection)
              .values({ sessionId, userId, workspaceId })
              .onConflictDoUpdate({
                target: oauthWorkspaceSelection.sessionId,
                set: { userId, workspaceId, updatedAt: new Date() },
              });
            return yield* choice(userId, sessionId);
          }),
      });
    }),
  );
}
