import { Schema } from "effect";
import { Model } from "effect/unstable/schema";

import { ApiKeyScope, WorkspaceMemberRole } from "../roles";
import { Theme, WaitlistSource, WaitlistStatus } from "./enums";
import {
  ApiKeyId,
  InviteId,
  UserId,
  UserPreferencesId,
  WaitlistEntryId,
  WorkspaceId,
  WorkspaceMembershipId,
} from "./ids";

/**
 * `user_preferences`. The contract's `UserPreferences` is NOT this model's
 * `json` variant: `getPreferences` answers the defaults without writing a
 * row, so the contract's `id`, `createdAt` and `updatedAt` are nullable while
 * the columns are not. The model is the row; the contract keeps its own shape.
 */
export class UserPreferencesModel extends Model.Class<UserPreferencesModel>(
  "UserPreferencesModel",
)({
  id: Model.GeneratedByApp(UserPreferencesId),
  userId: UserId,
  theme: Theme,
  language: Schema.String,
  timezone: Schema.String,
  emailNotifications: Schema.Boolean,
  pushNotifications: Schema.Boolean,
  createdAt: Model.GeneratedByApp(Schema.Date),
  updatedAt: Model.GeneratedByApp(Schema.NullOr(Schema.Date)),
}) {}

/**
 * `api_keys`. `userId`, `keyHash` and `revokedAt` are `Model.Sensitive`: the
 * database variants carry them, every JSON variant drops them, which is what
 * makes `ApiKeyModel.json` exactly the key as listed.
 */
export class ApiKeyModel extends Model.Class<ApiKeyModel>("ApiKeyModel")({
  id: Model.GeneratedByApp(ApiKeyId),
  userId: Model.Sensitive(UserId),
  name: Schema.String,
  keyHash: Model.Sensitive(Schema.String),
  /** First 12 characters of the key, for recognising it in a list. */
  keyPrefix: Schema.String,
  permissions: Schema.Array(ApiKeyScope),
  lastUsedAt: Schema.NullOr(Schema.Date),
  expiresAt: Schema.NullOr(Schema.Date),
  createdAt: Model.GeneratedByApp(Schema.Date),
  revokedAt: Model.Sensitive(Schema.NullOr(Schema.Date)),
}) {}

/** `workspace`. */
export class WorkspaceModel extends Model.Class<WorkspaceModel>(
  "WorkspaceModel",
)({
  id: Model.GeneratedByApp(WorkspaceId),
  name: Schema.String,
  slug: Schema.String,
  ownerUserId: UserId,
  createdAt: Model.GeneratedByApp(Schema.Date),
  updatedAt: Model.GeneratedByApp(Schema.NullOr(Schema.Date)),
}) {}

/** `workspace_membership`. */
export class WorkspaceMembershipModel extends Model.Class<WorkspaceMembershipModel>(
  "WorkspaceMembershipModel",
)({
  id: Model.GeneratedByApp(WorkspaceMembershipId),
  workspaceId: WorkspaceId,
  userId: UserId,
  role: WorkspaceMemberRole,
  createdAt: Model.GeneratedByApp(Schema.Date),
  updatedAt: Model.GeneratedByApp(Schema.NullOr(Schema.Date)),
}) {}

/**
 * `workspace_invite_allowlist`: the email may sign up and joins the workspace
 * with `role`.
 */
export class WorkspaceInviteModel extends Model.Class<WorkspaceInviteModel>(
  "WorkspaceInviteModel",
)({
  id: Model.GeneratedByApp(InviteId),
  workspaceId: WorkspaceId,
  email: Schema.String,
  role: WorkspaceMemberRole,
  invitedByUserId: UserId,
  createdAt: Model.GeneratedByApp(Schema.Date),
  updatedAt: Model.GeneratedByApp(Schema.NullOr(Schema.Date)),
}) {}

/** `waitlist_entry`: one row per (email, source). */
export class WaitlistEntryModel extends Model.Class<WaitlistEntryModel>(
  "WaitlistEntryModel",
)({
  id: Model.GeneratedByApp(WaitlistEntryId),
  email: Schema.String,
  source: WaitlistSource,
  status: WaitlistStatus,
  message: Schema.NullOr(Schema.String),
  referralCode: Schema.NullOr(Schema.String),
  reviewedByUserId: Schema.NullOr(UserId),
  reviewedAt: Schema.NullOr(Schema.Date),
  createdAt: Model.GeneratedByApp(Schema.Date),
  updatedAt: Model.GeneratedByApp(Schema.NullOr(Schema.Date)),
}) {}
