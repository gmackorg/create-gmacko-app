/**
 * `RequestContext`: the reads an incoming request may need about its caller,
 * each performed at most once for that request no matter how many API
 * dispatches, middlewares or handlers ask.
 *
 * - `session`: better-auth `getSession` on the raw headers (served from the
 *   signed cookie cache when the browser sent it);
 * - `user` / `role`: the `user` row read from the database, deliberately
 *   bypassing the cookie cache — an admin decision must not trust a cookie
 *   that may be five minutes stale (docs/API_AUTH.md, rule 5);
 * - `memberships` / `workspace`: the caller's `workspace_membership` rows and
 *   the "current workspace" resolved from them (see `resolveWorkspace`). A
 *   row whose `role` is outside `WorkspaceMemberRole` (the column is `text`)
 *   is not a membership: it is logged and ignored, so an unknown role grants
 *   nothing rather than failing the request.
 *
 * How it travels. `HttpRouter.toWebHandler` returns `handler(request,
 * context?)` and merges `context` into the request fiber's services
 * (HttpEffect.js `toWebHandlerWith`). The outermost entry — apps/web's SSR
 * render, or a test — builds the context once with `RequestContext.make` and
 * passes `Context.make(RequestContext, ...)` to every in-process dispatch;
 * the middlewares read it with `RequestContext.current` and, when a request
 * arrives without one (a direct API call), build their own and provide it
 * downstream so inner middlewares and the handler share it.
 */
import { Database, type DatabaseError } from "@gmacko/db";
import {
  applicationSettings,
  user,
  workspaceMembership,
} from "@gmacko/db/schema";
import {
  type User,
  type UserId,
  type UserRole,
  type WorkspaceId,
  WorkspaceMemberRole,
  WorkspaceMembership,
  type WorkspaceMembershipId,
} from "@gmacko/domain";
import { asc, eq } from "drizzle-orm";
import { Cache, Context, Effect, Option } from "effect";

import type { Session as AuthSession } from "./index";
import { Auth } from "./service";
import { toUser } from "./user";

/** The caller's current workspace; `role: null` when they see it without belonging to it. */
export interface WorkspaceScope {
  readonly workspaceId: WorkspaceId;
  readonly role: WorkspaceMemberRole | null;
}

export interface RequestContextShape {
  /** better-auth's session for the request's cookies, or `null` when anonymous. */
  readonly session: Effect.Effect<AuthSession | null>;
  /** The `user` row, from the database. */
  readonly user: (userId: string) => Effect.Effect<User | null, DatabaseError>;
  /** `user.role` from the database; `null` when the user no longer exists. */
  readonly role: (
    userId: string,
  ) => Effect.Effect<UserRole | null, DatabaseError>;
  /** Every membership, earliest first. */
  readonly memberships: (
    userId: string,
  ) => Effect.Effect<ReadonlyArray<WorkspaceMembership>, DatabaseError>;
  /** The current workspace per `resolveWorkspace`, or `null` when there is none. */
  readonly workspace: (
    userId: string,
  ) => Effect.Effect<WorkspaceScope | null, DatabaseError>;
}

/**
 * The legacy `getWorkspaceScope` rule, kept explicit: when application
 * settings name an initial workspace, that is the current one (with the
 * caller's role in it, or `null` when they are not a member); otherwise the
 * caller's earliest membership; otherwise nothing.
 */
export const resolveWorkspace = (
  initialWorkspaceId: string | null,
  memberships: ReadonlyArray<WorkspaceMembership>,
): WorkspaceScope | null => {
  if (initialWorkspaceId !== null) {
    const membership = memberships.find(
      (row) => row.workspaceId === initialWorkspaceId,
    );
    return {
      workspaceId: initialWorkspaceId as WorkspaceId,
      role: membership?.role ?? null,
    };
  }
  const first = memberships[0];
  return first === undefined
    ? null
    : { workspaceId: first.workspaceId, role: first.role };
};

/** Bounded per request: a request rarely asks about more than one user. */
const CAPACITY = 16;

const isMemberRole = (value: string): value is WorkspaceMemberRole =>
  (WorkspaceMemberRole.literals as ReadonlyArray<string>).includes(value);

export class RequestContext extends Context.Service<
  RequestContext,
  RequestContextShape
>()("@gmacko/auth/RequestContext") {
  /** Builds the memoised reads for one request's headers. Performs no I/O itself. */
  static make = (
    headers: Headers,
  ): Effect.Effect<RequestContextShape, never, Auth | Database> =>
    Effect.gen(function* () {
      const auth = yield* Auth;
      const { db } = yield* Database;

      const session = yield* Effect.cached(auth.session(headers));

      const users = yield* Cache.make({
        capacity: CAPACITY,
        lookup: (userId: string) =>
          db
            .select()
            .from(user)
            .where(eq(user.id, userId))
            .limit(1)
            .pipe(
              Effect.map((rows) =>
                rows[0] === undefined ? null : toUser(rows[0]),
              ),
            ),
      });

      const memberships = yield* Cache.make({
        capacity: CAPACITY,
        lookup: (userId: string) =>
          db
            .select()
            .from(workspaceMembership)
            .where(eq(workspaceMembership.userId, userId))
            .orderBy(
              asc(workspaceMembership.createdAt),
              asc(workspaceMembership.id),
            )
            .pipe(
              Effect.flatMap((rows) => {
                // Fail closed: `WorkspaceMembership` validates `role`, and a
                // stored value it does not know must grant nothing, not 500.
                const known = rows.filter((row) => isMemberRole(row.role));
                const ignored = rows.length - known.length;
                const memberships = known.map(
                  (row) =>
                    new WorkspaceMembership({
                      id: row.id as WorkspaceMembershipId,
                      workspaceId: row.workspaceId as WorkspaceId,
                      userId: row.userId as UserId,
                      role: row.role,
                      createdAt: row.createdAt,
                      updatedAt: row.updatedAt,
                    }),
                );
                return ignored === 0
                  ? Effect.succeed(memberships)
                  : Effect.logWarning(
                      `workspace_membership: ignored ${ignored} row(s) of user ${userId} with a role outside WorkspaceMemberRole`,
                    ).pipe(Effect.as(memberships));
              }),
            ),
      });

      const initialWorkspaceId = yield* Effect.cached(
        db
          .select({
            initialWorkspaceId: applicationSettings.initialWorkspaceId,
          })
          .from(applicationSettings)
          .limit(1)
          .pipe(Effect.map((rows) => rows[0]?.initialWorkspaceId ?? null)),
      );

      const workspaces = yield* Cache.make({
        capacity: CAPACITY,
        lookup: (userId: string) =>
          Effect.map(
            Effect.all([initialWorkspaceId, Cache.get(memberships, userId)]),
            ([initial, rows]) => resolveWorkspace(initial, rows),
          ),
      });

      return {
        session,
        user: (userId) => Cache.get(users, userId),
        role: (userId) =>
          Effect.map(Cache.get(users, userId), (found) => found?.role ?? null),
        memberships: (userId) => Cache.get(memberships, userId),
        workspace: (userId) => Cache.get(workspaces, userId),
      };
    });

  /** The request's context when the caller provided one; `None` otherwise. */
  static current: Effect.Effect<Option.Option<RequestContextShape>> =
    Effect.serviceOption(RequestContext);

  /** `current`, or a fresh context for `headers` when the request came without one. */
  static forRequest = (
    headers: Headers,
  ): Effect.Effect<RequestContextShape, never, Auth | Database> =>
    Effect.flatMap(
      RequestContext.current,
      Option.match({
        onNone: () => RequestContext.make(headers),
        onSome: Effect.succeed,
      }),
    );
}
