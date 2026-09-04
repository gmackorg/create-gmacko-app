import { Schema } from "effect";
import { Model } from "effect/unstable/schema";

import { AnnouncementTone } from "./enums";
import { ApplicationSettingsId, UserId, WorkspaceId } from "./ids";

/** `application_settings`: the single platform row. */
export class ApplicationSettingsModel extends Model.Class<ApplicationSettingsModel>(
  "ApplicationSettingsModel",
)({
  id: Model.GeneratedByApp(ApplicationSettingsId),
  setupCompletedAt: Schema.NullOr(Schema.Date),
  setupCompletedByUserId: Schema.NullOr(UserId),
  initialWorkspaceId: Schema.NullOr(WorkspaceId),
  maintenanceMode: Schema.Boolean,
  signupEnabled: Schema.Boolean,
  announcementMessage: Schema.NullOr(Schema.String),
  announcementTone: AnnouncementTone,
  allowedEmailDomains: Schema.Array(Schema.String),
  createdAt: Model.GeneratedByApp(Schema.Date),
  updatedAt: Model.GeneratedByApp(Schema.NullOr(Schema.Date)),
}) {}
