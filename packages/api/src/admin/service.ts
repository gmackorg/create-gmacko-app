/**
 * The admin services: launch controls (write side), the waitlist review
 * queue, first-run bootstrap, and user/workspace management. The two
 * read-check-write paths of the legacy router (`completeBootstrap`,
 * `reviewWaitlistEntry`) ran in Postgres transactions; on D1 they are
 * guarded writes inside one batch: every statement carries the
 * precondition in its WHERE clause, the batch is atomic, and a statement
 * that changed zero rows (read back from the batch's RETURNING) means
 * another actor won, which is a `Conflict`.
 */
import { type BatchItem, Database, type DatabaseError } from "@gmacko/db";
import {
  applicationSettings,
  user,
  waitlistEntry,
  workspace,
  workspaceInviteAllowlist,
  workspaceMembership,
} from "@gmacko/db/schema";
import {
  AdminStats,
  AdminWorkspace,
  ApplicationSettings,
  ApplicationSettingsId,
  BootstrapCompleted,
  BootstrapStatus,
  type CompleteBootstrap,
  LaunchControls,
  type ListUsersQuery,
  type ReviewWaitlistEntry,
  type UpdateLaunchControls,
  type UpdateUserRole,
  UserList,
} from "@gmacko/domain/admin";
import { User, UserId } from "@gmacko/domain/auth";
import { Conflict, NotFound } from "@gmacko/domain/errors";
import {
  type PlatformPrimitives,
  WaitlistEntry,
  WaitlistEntryId,
  Workspace,
  WorkspaceId,
} from "@gmacko/domain/settings";
import { asc, count, eq, exists, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { toAnnouncementTone } from "../settings/service";

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type SettingsRow = typeof applicationSettings.$inferSelect;
const toSettings = (row: SettingsRow): ApplicationSettings =>
  new ApplicationSettings({
    id: ApplicationSettingsId.make(row.id),
    setupCompletedAt: row.setupCompletedAt,
    setupCompletedByUserId:
      row.setupCompletedByUserId === null
        ? null
        : UserId.make(row.setupCompletedByUserId),
    initialWorkspaceId:
      row.initialWorkspaceId === null
        ? null
        : WorkspaceId.make(row.initialWorkspaceId),
    maintenanceMode: row.maintenanceMode,
    signupEnabled: row.signupEnabled,
    announcementMessage: row.announcementMessage,
    announcementTone: toAnnouncementTone(row.announcementTone),
    allowedEmailDomains: row.allowedEmailDomains,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

type WaitlistRow = typeof waitlistEntry.$inferSelect;
const toWaitlistEntry = (row: WaitlistRow): WaitlistEntry =>
  new WaitlistEntry({
    id: WaitlistEntryId.make(row.id),
    email: row.email,
    source: row.source,
    status: row.status,
    message: row.message,
    referralCode: row.referralCode,
    reviewedByUserId:
      row.reviewedByUserId === null ? null : UserId.make(row.reviewedByUserId),
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

type UserRow = typeof user.$inferSelect;
export const toUser = (row: UserRow): User =>
  new User({
    id: UserId.make(row.id),
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    image: row.image ?? null,
    role: row.role ?? "user",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

type WorkspaceRow = typeof workspace.$inferSelect;
const toWorkspace = (row: WorkspaceRow): Workspace =>
  new Workspace({
    id: WorkspaceId.make(row.id),
    name: row.name,
    slug: row.slug,
    ownerUserId: UserId.make(row.ownerUserId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

export const slugifyWorkspaceName = (name: string): string => {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "workspace";
};

// ---------------------------------------------------------------------------
// Launch controls (write side; the public read side is settings/service.ts)
// ---------------------------------------------------------------------------

export interface LaunchControlsShape {
  readonly get: Effect.Effect<LaunchControls, DatabaseError>;
  /**
   * Upserts the singleton row, touching only the fields sent. On an empty
   * table the first write inserts the row with the patch over the column
   * defaults (so `{}` yields the defaults), guarded so two first writers
   * cannot create two singletons.
   */
  readonly update: (
    patch: UpdateLaunchControls,
  ) => Effect.Effect<ApplicationSettings, DatabaseError>;
}

/** The `application_settings` columns an `UpdateLaunchControls` patch may set. */
interface LaunchControlsFields {
  maintenanceMode?: UpdateLaunchControls["maintenanceMode"];
  signupEnabled?: UpdateLaunchControls["signupEnabled"];
  announcementMessage?: UpdateLaunchControls["announcementMessage"];
  announcementTone?: UpdateLaunchControls["announcementTone"];
  allowedEmailDomains?: Array<string>;
}

/** The launch controls' column defaults, as read when no row exists yet. */
const launchDefaults = {
  maintenanceMode: false,
  signupEnabled: true,
  announcementMessage: null,
  announcementTone: "info",
  allowedEmailDomains: [],
} as const;

export class LaunchControlsService extends Context.Service<
  LaunchControlsService,
  LaunchControlsShape
>()("@gmacko/api/LaunchControls") {
  static layer = (
    primitives: PlatformPrimitives,
  ): Layer.Layer<LaunchControlsService, never, Database> =>
    Layer.effect(LaunchControlsService)(
      Effect.map(Database, ({ db, first }) => {
        const singleton = db.select().from(applicationSettings).limit(1);
        return LaunchControlsService.of({
          get: Effect.all([
            singleton,
            db.select({ n: count() }).from(waitlistEntry),
          ]).pipe(
            Effect.map(
              ([[settings], [waitlist]]) =>
                new LaunchControls({
                  maintenanceMode:
                    settings?.maintenanceMode ?? launchDefaults.maintenanceMode,
                  signupEnabled:
                    settings?.signupEnabled ?? launchDefaults.signupEnabled,
                  announcementMessage:
                    settings?.announcementMessage ??
                    launchDefaults.announcementMessage,
                  announcementTone: toAnnouncementTone(
                    settings?.announcementTone ??
                      launchDefaults.announcementTone,
                  ),
                  allowedEmailDomains:
                    settings?.allowedEmailDomains ??
                    launchDefaults.allowedEmailDomains,
                  platformPrimitives: primitives,
                  waitlistCount: waitlist?.n ?? 0,
                }),
            ),
          ),
          update: (patch) =>
            Effect.gen(function* () {
              // Only the fields the patch carries. Omission is load-bearing
              // twice below: `{ ...launchDefaults, ...fields }` must not let
              // an `undefined` value overwrite a default, and the `set()`
              // must not name a column the caller did not send.
              const fields: LaunchControlsFields = {};
              if (patch.maintenanceMode !== undefined) {
                fields.maintenanceMode = patch.maintenanceMode;
              }
              if (patch.signupEnabled !== undefined) {
                fields.signupEnabled = patch.signupEnabled;
              }
              if (patch.announcementMessage !== undefined) {
                fields.announcementMessage = patch.announcementMessage;
              }
              if (patch.announcementTone !== undefined) {
                fields.announcementTone = patch.announcementTone;
              }
              if (patch.allowedEmailDomains !== undefined) {
                fields.allowedEmailDomains = [...patch.allowedEmailDomains];
              }
              const [existing] = yield* singleton;
              if (existing === undefined) {
                // First write: one guarded INSERT … SELECT carrying the patch
                // over the defaults, only while the table is still empty, so
                // two first writers cannot create two singletons and an empty
                // patch still yields the defaults row. Values are bound as
                // the driver stores them (0/1 booleans, JSON text, epoch ms):
                // `insert().select()` bypasses the column mappers.
                const row = { ...launchDefaults, ...fields };
                const [inserted] = yield* db
                  .insert(
                    applicationSettings,
                    "id",
                    "maintenanceMode",
                    "signupEnabled",
                    "announcementMessage",
                    "announcementTone",
                    "allowedEmailDomains",
                    "createdAt",
                  )
                  .select(
                    sql`select ${crypto.randomUUID()}, ${row.maintenanceMode ? 1 : 0}, ${row.signupEnabled ? 1 : 0}, ${row.announcementMessage}, ${row.announcementTone}, ${JSON.stringify(row.allowedEmailDomains)}, ${Date.now()} where not exists (select 1 from ${applicationSettings})`,
                  )
                  .returning();
                if (inserted !== undefined) return toSettings(inserted);
                // Lost the race: the other writer's row exists now; patch it.
              }
              return yield* first(
                db
                  .update(applicationSettings)
                  .set({ ...fields, updatedAt: new Date() })
                  .where(
                    sql`${applicationSettings.id} = (select ${applicationSettings.id} from ${applicationSettings} limit 1)`,
                  )
                  .returning(),
                () => new Error("application_settings update returned no row"),
              ).pipe(Effect.orDie, Effect.map(toSettings));
            }),
        });
      }),
    );
}

// ---------------------------------------------------------------------------
// Waitlist review
// ---------------------------------------------------------------------------

export interface WaitlistReviewShape {
  /** Every entry, oldest first. */
  readonly list: Effect.Effect<ReadonlyArray<WaitlistEntry>, DatabaseError>;
  /**
   * Sets the status with `WHERE status != <new>` as the guard (zero rows ⇒
   * `Conflict("waitlist-status-changed")`). Approving while application
   * settings name an initial workspace also allowlists the email there, in
   * the same batch, conditioned on the same guard and on no allowlist row
   * for (workspace, email) existing yet: an email invited by hand is
   * approved without touching its invite.
   */
  readonly review: (
    reviewerId: string,
    entryId: WaitlistEntryId,
    input: ReviewWaitlistEntry,
  ) => Effect.Effect<WaitlistEntry, NotFound | Conflict | DatabaseError>;
}

export class WaitlistReview extends Context.Service<
  WaitlistReview,
  WaitlistReviewShape
>()("@gmacko/api/WaitlistReview") {
  static layer: Layer.Layer<WaitlistReview, never, Database> = Layer.effect(
    WaitlistReview,
  )(
    Effect.map(Database, ({ db, first, batch }) =>
      WaitlistReview.of({
        list: db
          .select()
          .from(waitlistEntry)
          .orderBy(asc(waitlistEntry.createdAt), asc(waitlistEntry.id))
          .pipe(Effect.map((rows) => rows.map(toWaitlistEntry))),
        review: (reviewerId, entryId, input) =>
          Effect.gen(function* () {
            const notFound = () =>
              new NotFound({ resource: "waitlistEntry", id: entryId });
            const byId = db
              .select()
              .from(waitlistEntry)
              .where(eq(waitlistEntry.id, entryId))
              .limit(1);
            const entry = yield* first(byId, notFound);
            const [settings] = yield* db
              .select({
                initialWorkspaceId: applicationSettings.initialWorkspaceId,
              })
              .from(applicationSettings)
              .limit(1);

            // The guard, shared by every statement of the batch.
            const notYet = sql`exists (select 1 from ${waitlistEntry} where ${waitlistEntry.id} = ${entryId} and ${waitlistEntry.status} != ${input.status})`;
            const update = db
              .update(waitlistEntry)
              .set({
                status: input.status,
                reviewedByUserId: reviewerId,
                reviewedAt: new Date(),
              })
              .where(
                sql`${waitlistEntry.id} = ${entryId} and ${waitlistEntry.status} != ${input.status}`,
              )
              .returning({ id: waitlistEntry.id });
            const workspaceId = settings?.initialWorkspaceId ?? null;
            // Idempotent on the allowlist: an existing (workspace, email)
            // row, however it got there, is left as it is.
            const notListed = sql`not exists (select 1 from ${workspaceInviteAllowlist} where ${workspaceInviteAllowlist.workspaceId} = ${workspaceId} and ${workspaceInviteAllowlist.email} = ${entry.email})`;
            const allowlist =
              input.status === "approved" && workspaceId !== null
                ? db
                    .insert(
                      workspaceInviteAllowlist,
                      "id",
                      "workspaceId",
                      "email",
                      "role",
                      "invitedByUserId",
                      "createdAt",
                    )
                    .select(
                      sql`select ${crypto.randomUUID()}, ${workspaceId}, ${entry.email}, 'member', ${reviewerId}, ${Date.now()} where ${notYet} and ${notListed}`,
                    )
                : null;

            const items: ReadonlyArray<BatchItem> =
              allowlist === null ? [update] : [allowlist, update];
            const results = yield* batch(items);
            const changed = results[results.length - 1] ?? [];
            if (changed.length === 0) {
              return yield* new Conflict({ reason: "waitlist-status-changed" });
            }
            return toWaitlistEntry(yield* first(byId, notFound));
          }),
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export interface BootstrapShape {
  readonly status: Effect.Effect<BootstrapStatus, DatabaseError>;
  /**
   * First-come, first-served: creates the workspace, its owner membership,
   * promotes the caller to platform admin and marks setup complete, as one
   * batch whose every statement is conditioned on "no workspace exists and
   * setup is not complete". Zero rows on the first statement means another
   * caller won: `Conflict("bootstrap-already-completed")` when setup is
   * complete, `Conflict("bootstrap-already-started")` when only a workspace
   * exists.
   */
  readonly complete: (
    userId: string,
    input: CompleteBootstrap,
  ) => Effect.Effect<BootstrapCompleted, Conflict | DatabaseError>;
}

export class Bootstrap extends Context.Service<Bootstrap, BootstrapShape>()(
  "@gmacko/api/Bootstrap",
) {
  static layer: Layer.Layer<Bootstrap, never, Database> = Layer.effect(
    Bootstrap,
  )(
    Effect.map(Database, ({ db, first, batch }) => {
      const settingsRow = db.select().from(applicationSettings).limit(1);
      const anyWorkspace = db
        .select({ id: workspace.id })
        .from(workspace)
        .limit(1);

      const conflict: Effect.Effect<never, Conflict | DatabaseError> =
        Effect.flatMap(settingsRow, ([settings]) =>
          Effect.fail(
            new Conflict({
              reason: settings?.setupCompletedAt
                ? "bootstrap-already-completed"
                : "bootstrap-already-started",
            }),
          ),
        );

      return Bootstrap.of({
        status: Effect.all([settingsRow, anyWorkspace]).pipe(
          Effect.map(([[settings], workspaces]) => {
            const completedAt = settings?.setupCompletedAt ?? null;
            return new BootstrapStatus({
              isInitialized: completedAt !== null,
              requiresSetup: completedAt === null,
              hasExistingWorkspace: workspaces.length > 0,
              setupCompletedAt: completedAt,
              initialWorkspaceId:
                settings?.initialWorkspaceId === undefined ||
                settings.initialWorkspaceId === null
                  ? null
                  : WorkspaceId.make(settings.initialWorkspaceId),
            });
          }),
        ),
        complete: (userId, input) =>
          Effect.gen(function* () {
            // Cheap early answer; the batch below is the actual guard.
            const [settings] = yield* settingsRow;
            if (settings?.setupCompletedAt) {
              return yield* new Conflict({
                reason: "bootstrap-already-completed",
              });
            }
            if ((yield* anyWorkspace).length > 0) {
              return yield* new Conflict({
                reason: "bootstrap-already-started",
              });
            }

            const workspaceId = crypto.randomUUID();
            const now = Date.now();
            const untouched = sql`not exists (select 1 from ${workspace}) and not exists (select 1 from ${applicationSettings} where ${applicationSettings.setupCompletedAt} is not null)`;
            const won = exists(
              db
                .select({ id: workspace.id })
                .from(workspace)
                .where(eq(workspace.id, workspaceId)),
            );

            const createWorkspace = db
              .insert(
                workspace,
                "id",
                "name",
                "slug",
                "ownerUserId",
                "createdAt",
              )
              .select(
                sql`select ${workspaceId}, ${input.workspaceName}, ${slugifyWorkspaceName(input.workspaceName)}, ${userId}, ${now} where ${untouched}`,
              )
              .returning({ id: workspace.id });
            const createMembership = db
              .insert(
                workspaceMembership,
                "id",
                "workspaceId",
                "userId",
                "role",
                "createdAt",
              )
              .select(
                sql`select ${crypto.randomUUID()}, ${workspaceId}, ${userId}, 'owner', ${now} where exists (select 1 from ${workspace} where ${workspace.id} = ${workspaceId})`,
              );
            const promote = db
              .update(user)
              .set({ role: "admin" })
              .where(sql`${user.id} = ${userId} and ${won}`);
            // Both settings statements go in the batch, each guarded so
            // exactly one takes effect: the update when a row exists, the
            // insert when the table is empty *at batch time*. Choosing one
            // from the `settingsRow` read above would race a first
            // `updateLaunchControls` landing in between: the insert's guard
            // would then make it a no-op and the workspace would be created
            // with setup never marked complete.
            const completeSettings = db
              .update(applicationSettings)
              .set({
                setupCompletedAt: new Date(now),
                setupCompletedByUserId: userId,
                initialWorkspaceId: workspaceId,
              })
              .where(
                sql`${applicationSettings.setupCompletedAt} is null and ${won}`,
              );
            const createSettings = db
              .insert(
                applicationSettings,
                "id",
                "setupCompletedAt",
                "setupCompletedByUserId",
                "initialWorkspaceId",
                "createdAt",
              )
              .select(
                sql`select ${crypto.randomUUID()}, ${now}, ${userId}, ${workspaceId}, ${now} where not exists (select 1 from ${applicationSettings}) and ${won}`,
              );

            const results = yield* batch([
              createWorkspace,
              createMembership,
              promote,
              completeSettings,
              createSettings,
            ]);
            if (results[0].length === 0) return yield* conflict;

            const [createdSettings, createdWorkspace] = yield* Effect.all([
              first(
                db
                  .select()
                  .from(applicationSettings)
                  .where(
                    eq(applicationSettings.initialWorkspaceId, workspaceId),
                  )
                  .limit(1),
                () => new Error("bootstrap: settings row missing after batch"),
              ),
              first(
                db
                  .select()
                  .from(workspace)
                  .where(eq(workspace.id, workspaceId)),
                () => new Error("bootstrap: workspace row missing after batch"),
              ),
            ]).pipe(Effect.orDie);
            return new BootstrapCompleted({
              settings: toSettings(createdSettings),
              workspace: toWorkspace(createdWorkspace),
            });
          }),
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// Users, workspaces, stats
// ---------------------------------------------------------------------------

export interface AdminUsersShape {
  readonly stats: Effect.Effect<AdminStats, DatabaseError>;
  /** Every workspace with its membership count, oldest first. */
  readonly listWorkspaces: Effect.Effect<
    ReadonlyArray<AdminWorkspace>,
    DatabaseError
  >;
  readonly listUsers: (
    query: ListUsersQuery,
  ) => Effect.Effect<UserList, DatabaseError>;
  readonly getUser: (
    userId: UserId,
  ) => Effect.Effect<User, NotFound | DatabaseError>;
  /** `Conflict("self-demotion")` when an admin removes their own role. */
  readonly updateRole: (
    actorId: string,
    userId: UserId,
    input: UpdateUserRole,
  ) => Effect.Effect<User, NotFound | Conflict | DatabaseError>;
}

export class AdminUsers extends Context.Service<AdminUsers, AdminUsersShape>()(
  "@gmacko/api/AdminUsers",
) {
  static layer: Layer.Layer<AdminUsers, never, Database> = Layer.effect(
    AdminUsers,
  )(
    Effect.map(Database, ({ db, first }) =>
      AdminUsers.of({
        stats: Effect.all([
          db.select({ n: count() }).from(user),
          db.select({ n: count() }).from(user).where(eq(user.role, "admin")),
          db.select({ n: count() }).from(workspace),
        ]).pipe(
          Effect.map(([[users], [admins], [workspaces]]) => {
            const totalUsers = users?.n ?? 0;
            const adminUsers = admins?.n ?? 0;
            return new AdminStats({
              totalUsers,
              totalWorkspaces: workspaces?.n ?? 0,
              adminUsers,
              regularUsers: totalUsers - adminUsers,
            });
          }),
        ),
        listWorkspaces: db
          .select({
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
            ownerUserId: workspace.ownerUserId,
            createdAt: workspace.createdAt,
            membershipCount: count(workspaceMembership.id),
          })
          .from(workspace)
          .leftJoin(
            workspaceMembership,
            eq(workspaceMembership.workspaceId, workspace.id),
          )
          .groupBy(workspace.id)
          .orderBy(asc(workspace.createdAt), asc(workspace.id))
          .pipe(
            Effect.map((rows) =>
              rows.map(
                (row) =>
                  new AdminWorkspace({
                    id: WorkspaceId.make(row.id),
                    name: row.name,
                    slug: row.slug,
                    ownerUserId: UserId.make(row.ownerUserId),
                    membershipCount: row.membershipCount,
                    createdAt: row.createdAt,
                  }),
              ),
            ),
          ),
        listUsers: (query) =>
          Effect.all([
            db
              .select()
              .from(user)
              .orderBy(asc(user.createdAt), asc(user.id))
              .limit(query.limit)
              .offset(query.offset),
            db.select({ n: count() }).from(user),
          ]).pipe(
            Effect.map(
              ([rows, [total]]) =>
                new UserList({
                  users: rows.map(toUser),
                  total: total?.n ?? 0,
                  hasMore: query.offset + rows.length < (total?.n ?? 0),
                }),
            ),
          ),
        getUser: (userId) =>
          first(
            db.select().from(user).where(eq(user.id, userId)).limit(1),
            () => new NotFound({ resource: "user", id: userId }),
          ).pipe(Effect.map(toUser)),
        updateRole: (actorId, userId, input) =>
          Effect.gen(function* () {
            if (userId === actorId && input.role !== "admin") {
              return yield* new Conflict({ reason: "self-demotion" });
            }
            return yield* first(
              db
                .update(user)
                .set({ role: input.role, updatedAt: new Date() })
                .where(eq(user.id, userId))
                .returning(),
              () => new NotFound({ resource: "user", id: userId }),
            ).pipe(Effect.map(toUser));
          }),
      }),
    ),
  );
}
