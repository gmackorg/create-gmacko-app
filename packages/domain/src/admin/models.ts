/**
 * Platform administration: launch controls, the waitlist review queue,
 * first-run bootstrap, and user/workspace management.
 */
import { Effect, Schema } from "effect";

import { User, UserId } from "../auth/models";
import { boundedString, id, stringBetween } from "../primitives";
import { UserRole } from "../roles";
import {
  AnnouncementTone,
  PlatformPrimitives,
  WaitlistStatus,
  Workspace,
  WorkspaceId,
} from "../settings/models";

export const ApplicationSettingsId = id("ApplicationSettingsId");
export type ApplicationSettingsId = typeof ApplicationSettingsId.Type;

/** The single `application_settings` row. */
export class ApplicationSettings extends Schema.Class<ApplicationSettings>(
  "ApplicationSettings",
)({
  id: ApplicationSettingsId,
  setupCompletedAt: Schema.NullOr(Schema.Date),
  setupCompletedByUserId: Schema.NullOr(UserId),
  initialWorkspaceId: Schema.NullOr(WorkspaceId),
  maintenanceMode: Schema.Boolean,
  signupEnabled: Schema.Boolean,
  announcementMessage: Schema.NullOr(Schema.String),
  announcementTone: AnnouncementTone,
  allowedEmailDomains: Schema.Array(Schema.String),
  createdAt: Schema.Date,
  updatedAt: Schema.NullOr(Schema.Date),
}) {}

export class LaunchControls extends Schema.Class<LaunchControls>(
  "LaunchControls",
)({
  maintenanceMode: Schema.Boolean,
  signupEnabled: Schema.Boolean,
  announcementMessage: Schema.NullOr(Schema.String),
  announcementTone: AnnouncementTone,
  allowedEmailDomains: Schema.Array(Schema.String),
  platformPrimitives: PlatformPrimitives,
  waitlistCount: Schema.Int,
}) {}

/** A partial: only the keys sent change; `announcementMessage: null` clears it. */
export class UpdateLaunchControls extends Schema.Class<UpdateLaunchControls>(
  "UpdateLaunchControls",
)({
  maintenanceMode: Schema.optionalKey(Schema.Boolean),
  signupEnabled: Schema.optionalKey(Schema.Boolean),
  announcementMessage: Schema.optionalKey(Schema.NullOr(boundedString(2000))),
  announcementTone: Schema.optionalKey(AnnouncementTone),
  allowedEmailDomains: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
}) {}

export class ReviewWaitlistEntry extends Schema.Class<ReviewWaitlistEntry>(
  "ReviewWaitlistEntry",
)({
  status: WaitlistStatus,
}) {}

export class BootstrapStatus extends Schema.Class<BootstrapStatus>(
  "BootstrapStatus",
)({
  isInitialized: Schema.Boolean,
  /** `!isInitialized`; the web app shows the first-run screen on it. */
  requiresSetup: Schema.Boolean,
  hasExistingWorkspace: Schema.Boolean,
  setupCompletedAt: Schema.NullOr(Schema.Date),
  initialWorkspaceId: Schema.NullOr(WorkspaceId),
}) {}

export class CompleteBootstrap extends Schema.Class<CompleteBootstrap>(
  "CompleteBootstrap",
)({
  workspaceName: stringBetween(2, 120),
}) {}

export class BootstrapCompleted extends Schema.Class<BootstrapCompleted>(
  "BootstrapCompleted",
)({
  settings: ApplicationSettings,
  workspace: Workspace,
}) {}

export class AdminStats extends Schema.Class<AdminStats>("AdminStats")({
  totalUsers: Schema.Int,
  totalWorkspaces: Schema.Int,
  adminUsers: Schema.Int,
  regularUsers: Schema.Int,
}) {}

export class AdminWorkspace extends Schema.Class<AdminWorkspace>(
  "AdminWorkspace",
)({
  id: WorkspaceId,
  name: Schema.String,
  slug: Schema.String,
  ownerUserId: UserId,
  membershipCount: Schema.Int,
  createdAt: Schema.Date,
}) {}

/** `?limit=&offset=`; both optional. */
export const ListUsersQuery = Schema.Struct({
  limit: Schema.Int.pipe(
    Schema.check(
      Schema.isGreaterThanOrEqualTo(1),
      Schema.isLessThanOrEqualTo(100),
    ),
    Schema.withDecodingDefaultKey(Effect.succeed(20)),
  ),
  offset: Schema.Int.pipe(
    Schema.check(Schema.isGreaterThanOrEqualTo(0)),
    Schema.withDecodingDefaultKey(Effect.succeed(0)),
  ),
});
export type ListUsersQuery = typeof ListUsersQuery.Type;

export class UserList extends Schema.Class<UserList>("UserList")({
  users: Schema.Array(User),
  /** `count(*)` over users (the legacy version returned the first id). */
  total: Schema.Int,
  hasMore: Schema.Boolean,
}) {}

export class UpdateUserRole extends Schema.Class<UpdateUserRole>(
  "UpdateUserRole",
)({
  role: UserRole,
}) {}
