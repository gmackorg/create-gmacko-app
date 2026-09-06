/**
 * The settings services: the public launch state and waitlist, the caller's
 * workspace (context, invites), preferences and account deletion. Each is a
 * `Context.Service` whose error union is exactly what the contract declares
 * plus the data layer's `DatabaseError`, which the handler turns into
 * `InternalError` (see boundary.ts). API keys are `@gmacko/auth`'s
 * `ApiKeys`, called from the handlers directly.
 *
 * Multi-statement writes are D1 batches (all or nothing) and read-check-
 * write is a guarded write: the precondition sits in the WHERE clause and
 * zero changed rows is a `Conflict`.
 */
import type { RequestContextShape } from "@gmacko/auth/request-context";
import { Database, type DatabaseError } from "@gmacko/db";
import {
  applicationSettings,
  user,
  userPreferences,
  waitlistEntry,
  workspace,
  workspaceInviteAllowlist,
  workspaceMembership,
} from "@gmacko/db/schema";
import { UserId } from "@gmacko/domain/auth";
import { Conflict, NotFound } from "@gmacko/domain/errors";
import {
  AnnouncementTone,
  type CreateApiKey,
  type CreateInvite,
  InviteAccepted,
  type InviteId,
  LaunchState,
  type Theme,
  Theme as ThemeSchema,
  type UpdatePreferences,
  UserPreferences,
  UserPreferencesId,
  WaitlistEntryId,
  WaitlistSubmission,
  type WaitlistSubmit,
  WorkspaceContext,
  WorkspaceId,
  WorkspaceInvite,
  InviteId as WorkspaceInviteId,
} from "@gmacko/domain/settings";
import { asc, count, eq, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { AppConfig, canAutoCreateAccounts } from "../config";

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

/**
 * The contract's literal sets keyed by their own text, so a `text` column
 * read back from D1 maps to the literal without asserting that it is one.
 */
const announcementTones = new Map<string, AnnouncementTone>(
  AnnouncementTone.literals.map((tone) => [tone, tone] as const),
);
const themes = new Map<string, Theme>(
  ThemeSchema.literals.map((theme) => [theme, theme] as const),
);

/** Free text in D1; the contract's literal set, defaulting to `info`. */
export const toAnnouncementTone = (value: string): AnnouncementTone =>
  announcementTones.get(value) ?? "info";

/** Free text in D1; the contract's literal set, defaulting to `system`. */
export const toTheme = (value: string): Theme => themes.get(value) ?? "system";

type InviteRow = typeof workspaceInviteAllowlist.$inferSelect;
const toInvite = (row: InviteRow): WorkspaceInvite =>
  new WorkspaceInvite({
    id: WorkspaceInviteId.make(row.id),
    workspaceId: WorkspaceId.make(row.workspaceId),
    email: row.email,
    role: row.role,
    invitedByUserId: UserId.make(row.invitedByUserId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

type PreferencesRow = typeof userPreferences.$inferSelect;
const toPreferences = (row: PreferencesRow): UserPreferences =>
  new UserPreferences({
    id: UserPreferencesId.make(row.id),
    userId: UserId.make(row.userId),
    theme: toTheme(row.theme),
    language: row.language,
    timezone: row.timezone,
    emailNotifications: row.emailNotifications,
    pushNotifications: row.pushNotifications,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

// ---------------------------------------------------------------------------
// Launch state (public read side; the admin writes it, see admin/service.ts)
// ---------------------------------------------------------------------------

export interface LaunchShape {
  readonly state: Effect.Effect<LaunchState, DatabaseError>;
}

export class Launch extends Context.Service<Launch, LaunchShape>()(
  "@gmacko/api/Launch",
) {
  static layer: Layer.Layer<Launch, never, Database | AppConfig> = Layer.effect(
    Launch,
  )(
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const { db } = yield* Database;
      return Launch.of({
        state: db
          .select()
          .from(applicationSettings)
          .limit(1)
          .pipe(
            Effect.map(([settings]) => {
              const signupEnabled = settings?.signupEnabled ?? true;
              const announcementMessage = settings?.announcementMessage ?? null;
              return new LaunchState({
                announcementMessage,
                announcementTone: toAnnouncementTone(
                  settings?.announcementTone ?? "info",
                ),
                allowedEmailDomains: settings?.allowedEmailDomains ?? [],
                canAutoCreateAccounts: canAutoCreateAccounts(config.stage),
                inviteOnly: !signupEnabled,
                maintenanceMode: settings?.maintenanceMode ?? false,
                signupEnabled,
                stripeConfigured: config.features.stripe,
                publicAnnouncementVisible: announcementMessage !== null,
                canUseWaitlist: true,
              });
            }),
          ),
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// Waitlist (public submit; review is admin/service.ts)
// ---------------------------------------------------------------------------

export interface WaitlistShape {
  /**
   * One atomic upsert on `(email, source)`. A re-submission replaces the
   * message and referral code with what it carries — omitting them clears
   * the stored ones, so the entry always mirrors the latest submission —
   * but never resets a reviewed entry's status (the legacy handler put it
   * back to `pending`).
   */
  readonly submit: (
    input: WaitlistSubmit,
  ) => Effect.Effect<WaitlistSubmission, DatabaseError>;
}

export class Waitlist extends Context.Service<Waitlist, WaitlistShape>()(
  "@gmacko/api/Waitlist",
) {
  static layer: Layer.Layer<Waitlist, never, Database> = Layer.effect(Waitlist)(
    Effect.map(Database, ({ db, first }) =>
      Waitlist.of({
        submit: (input) =>
          first(
            db
              .insert(waitlistEntry)
              .values({
                email: input.email.trim().toLowerCase(),
                source: input.source,
                status: "pending",
                message: input.message ?? null,
                referralCode: input.referralCode ?? null,
              })
              .onConflictDoUpdate({
                target: [waitlistEntry.email, waitlistEntry.source],
                set: {
                  message: sql`excluded.message`,
                  referralCode: sql`excluded.referral_code`,
                  updatedAt: new Date(),
                },
              })
              .returning({
                id: waitlistEntry.id,
                email: waitlistEntry.email,
                source: waitlistEntry.source,
                status: waitlistEntry.status,
              }),
            () => new Error("waitlist upsert returned no row"),
          ).pipe(
            Effect.orDie,
            Effect.map(
              (row) =>
                new WaitlistSubmission({
                  id: WaitlistEntryId.make(row.id),
                  email: row.email,
                  source: row.source,
                  status: row.status,
                }),
            ),
          ),
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Workspaces: the caller's current workspace and its invite allowlist
// ---------------------------------------------------------------------------

export interface WorkspacesShape {
  /** The legacy `getWorkspaceContext`, over `RequestContext`'s memoised reads. */
  readonly context: (
    userId: string,
    request: RequestContextShape,
  ) => Effect.Effect<WorkspaceContext, DatabaseError>;
  /** The current workspace's allowlist, oldest first; empty without a workspace. */
  readonly listInvites: (
    userId: string,
    request: RequestContextShape,
  ) => Effect.Effect<ReadonlyArray<WorkspaceInvite>, DatabaseError>;
  /** `Conflict("invite-exists")` when the (lower-cased) email is already listed. */
  readonly createInvite: (
    userId: string,
    input: CreateInvite,
    request: RequestContextShape,
  ) => Effect.Effect<WorkspaceInvite, Conflict | DatabaseError>;
  /**
   * Joins the invite's workspace (or keeps an existing membership there) and
   * consumes the invite, as one batch. `NotFound` for an unknown invite or
   * one addressed to another email (never confirms it exists);
   * `Conflict("owner-invite-unsupported")`; `Conflict("already-in-workspace")`
   * when the caller belongs to a different workspace. Two concurrent accepts
   * of the same invite both succeed: the membership insert is `ON CONFLICT
   * DO NOTHING` on (workspace, user), and consuming an already-consumed
   * invite changes nothing.
   */
  readonly acceptInvite: (
    user: { readonly id: string; readonly email: string },
    inviteId: InviteId,
    request: RequestContextShape,
  ) => Effect.Effect<InviteAccepted, NotFound | Conflict | DatabaseError>;
}

const canManage = (role: string | null): boolean =>
  role === "owner" || role === "admin";

export class Workspaces extends Context.Service<Workspaces, WorkspacesShape>()(
  "@gmacko/api/Workspaces",
) {
  static layer: Layer.Layer<Workspaces, never, Database> = Layer.effect(
    Workspaces,
  )(
    Effect.map(Database, ({ db, first, batch }) => {
      const workspaceById = (id: string) =>
        db
          .select()
          .from(workspace)
          .where(eq(workspace.id, id))
          .limit(1)
          .pipe(Effect.map((rows) => rows[0] ?? null));

      return Workspaces.of({
        context: (userId, request) =>
          Effect.gen(function* () {
            const [scope, platformRole] = yield* Effect.all([
              request.workspace(userId),
              request.role(userId),
            ]);
            const current =
              scope === null ? null : yield* workspaceById(scope.workspaceId);
            const counted =
              scope === null
                ? []
                : yield* db
                    .select({ invites: count() })
                    .from(workspaceInviteAllowlist)
                    .where(
                      eq(
                        workspaceInviteAllowlist.workspaceId,
                        scope.workspaceId,
                      ),
                    );
            const invites = counted[0]?.invites ?? 0;
            const role = platformRole ?? "user";
            return new WorkspaceContext({
              workspace:
                current === null
                  ? null
                  : {
                      id: WorkspaceId.make(current.id),
                      name: current.name,
                      slug: current.slug,
                    },
              workspaceRole: scope?.role ?? null,
              platformRole: role,
              canManageWorkspace: canManage(scope?.role ?? null),
              isPlatformAdmin: role === "admin",
              inviteAllowlistCount: invites,
            });
          }),

        listInvites: (userId, request) =>
          Effect.flatMap(request.workspace(userId), (scope) =>
            scope === null
              ? Effect.succeed([])
              : db
                  .select()
                  .from(workspaceInviteAllowlist)
                  .where(
                    eq(workspaceInviteAllowlist.workspaceId, scope.workspaceId),
                  )
                  .orderBy(
                    asc(workspaceInviteAllowlist.createdAt),
                    asc(workspaceInviteAllowlist.id),
                  )
                  .pipe(Effect.map((rows) => rows.map(toInvite))),
          ),

        createInvite: (userId, input, request) =>
          Effect.gen(function* () {
            const scope = yield* request.workspace(userId);
            // WorkspaceRole(admin) ran first; a missing workspace here is a
            // role-check bug, not a client error.
            if (scope === null) {
              return yield* Effect.die(
                new Error(
                  "createInvite: no current workspace after WorkspaceRole",
                ),
              );
            }
            const email = input.email.trim().toLowerCase();
            // Emails are stored lower-cased, so the unique index on
            // (workspace, email) is the case-insensitive duplicate check.
            const rows = yield* db
              .insert(workspaceInviteAllowlist)
              .values({
                workspaceId: scope.workspaceId,
                email,
                role: input.role,
                invitedByUserId: userId,
              })
              .onConflictDoNothing()
              .returning();
            const row = rows[0];
            if (row === undefined) {
              return yield* new Conflict({ reason: "invite-exists" });
            }
            return toInvite(row);
          }),

        acceptInvite: (caller, inviteId, request) =>
          Effect.gen(function* () {
            const notFound = () =>
              new NotFound({ resource: "invite", id: inviteId });
            const invite = yield* first(
              db
                .select()
                .from(workspaceInviteAllowlist)
                .where(eq(workspaceInviteAllowlist.id, inviteId))
                .limit(1),
              notFound,
            );
            if (invite.email.toLowerCase() !== caller.email.toLowerCase()) {
              return yield* notFound();
            }
            if (invite.role === "owner") {
              return yield* new Conflict({
                reason: "owner-invite-unsupported",
              });
            }
            const memberships = yield* request.memberships(caller.id);
            if (memberships.some((m) => m.workspaceId !== invite.workspaceId)) {
              return yield* new Conflict({ reason: "already-in-workspace" });
            }
            const existing = memberships.find(
              (m) => m.workspaceId === invite.workspaceId,
            );
            const consume = db
              .delete(workspaceInviteAllowlist)
              .where(eq(workspaceInviteAllowlist.id, invite.id));
            if (existing === undefined) {
              yield* batch([
                db
                  .insert(workspaceMembership)
                  .values({
                    workspaceId: invite.workspaceId,
                    userId: caller.id,
                    role: invite.role,
                  })
                  .onConflictDoNothing(),
                consume,
              ]);
            } else {
              yield* batch([consume]);
            }
            return new InviteAccepted({
              workspaceId: WorkspaceId.make(invite.workspaceId),
              role: existing?.role ?? invite.role,
            });
          }),
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/** The `user_preferences` columns an `UpdatePreferences` patch may set. */
interface PreferencesFields {
  theme?: Theme;
  language?: string;
  timezone?: string;
  emailNotifications?: boolean;
  pushNotifications?: boolean;
}

export interface PreferencesShape {
  /**
   * The row, or the column defaults without inserting one; then `id`,
   * `createdAt` and `updatedAt` are `null` (the contract: "null until first
   * write"), never a sentinel.
   */
  readonly get: (
    userId: string,
  ) => Effect.Effect<UserPreferences, DatabaseError>;
  /** One upsert touching only the fields sent (plus `updatedAt`). */
  readonly update: (
    userId: string,
    patch: UpdatePreferences,
  ) => Effect.Effect<UserPreferences, DatabaseError>;
}

const defaultPreferences = (userId: string): UserPreferences =>
  new UserPreferences({
    id: null,
    userId: UserId.make(userId),
    theme: "system",
    language: "en",
    timezone: "UTC",
    emailNotifications: true,
    pushNotifications: true,
    createdAt: null,
    updatedAt: null,
  });

export class Preferences extends Context.Service<
  Preferences,
  PreferencesShape
>()("@gmacko/api/Preferences") {
  static layer: Layer.Layer<Preferences, never, Database> = Layer.effect(
    Preferences,
  )(
    Effect.map(Database, ({ db, first }) =>
      Preferences.of({
        get: (userId) =>
          db
            .select()
            .from(userPreferences)
            .where(eq(userPreferences.userId, userId))
            .limit(1)
            .pipe(
              Effect.map(([row]) =>
                row === undefined
                  ? defaultPreferences(userId)
                  : toPreferences(row),
              ),
            ),
        update: (userId, patch) => {
          // Only the columns the caller sent. A key present with an
          // `undefined` value is not the same as an absent key here: the
          // insert below binds every key it is given, so an omitted column
          // takes its default and a sent one does not.
          const fields: PreferencesFields = {};
          if (patch.theme !== undefined) fields.theme = patch.theme;
          if (patch.language !== undefined) fields.language = patch.language;
          if (patch.timezone !== undefined) fields.timezone = patch.timezone;
          if (patch.emailNotifications !== undefined) {
            fields.emailNotifications = patch.emailNotifications;
          }
          if (patch.pushNotifications !== undefined) {
            fields.pushNotifications = patch.pushNotifications;
          }
          return first(
            db
              .insert(userPreferences)
              .values({ userId, ...fields })
              .onConflictDoUpdate({
                target: userPreferences.userId,
                set: { ...fields, updatedAt: new Date() },
              })
              .returning(),
            () => new Error("user_preferences upsert returned no row"),
          ).pipe(Effect.orDie, Effect.map(toPreferences));
        },
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// API keys (the service is @gmacko/auth's `ApiKeys`; this is the call shape)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** The argument `ApiKeys.create` takes, as `toApiKeyCreate` builds it. */
export interface ApiKeyCreateInput {
  readonly name: string;
  readonly permissions: CreateApiKey["permissions"];
  readonly expiresAt: Date | undefined;
}

/**
 * The contract's `expiresInDays` (relative, what a form asks for) as the
 * `expiresAt` instant `ApiKeys.create` stores; `undefined` never expires.
 */
export const toApiKeyCreate = (
  payload: CreateApiKey,
  now: number = Date.now(),
): ApiKeyCreateInput => ({
  name: payload.name,
  permissions: payload.permissions,
  expiresAt:
    payload.expiresInDays === undefined
      ? undefined
      : new Date(now + payload.expiresInDays * DAY_MS),
});

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export interface AccountShape {
  /**
   * One `DELETE FROM user`; the schema cascades sessions, accounts, API keys,
   * preferences, memberships, and the workspaces the user owns (with their
   * memberships, invites, subscription and usage; see docs/API_AUTH.md).
   */
  readonly deleteAccount: (
    userId: string,
  ) => Effect.Effect<void, DatabaseError>;
}

export class Account extends Context.Service<Account, AccountShape>()(
  "@gmacko/api/Account",
) {
  static layer: Layer.Layer<Account, never, Database> = Layer.effect(Account)(
    Effect.map(Database, ({ db, updateWhere }) =>
      Account.of({
        deleteAccount: (userId) =>
          Effect.asVoid(
            updateWhere(db.delete(user).where(eq(user.id, userId))),
          ),
      }),
    ),
  );
}

export const SettingsServicesLive = Layer.mergeAll(
  Launch.layer,
  Waitlist.layer,
  Workspaces.layer,
  Preferences.layer,
  Account.layer,
);
