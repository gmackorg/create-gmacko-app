import { Schema } from "effect";

import { WorkspaceId } from "../models/ids";
import { WorkspaceMemberRole } from "../roles";

/** One workspace the signed-in user may pin an OAuth grant to. */
export class OAuthWorkspace extends Schema.Class<OAuthWorkspace>(
  "OAuthWorkspace",
)({
  id: WorkspaceId,
  name: Schema.String,
  role: WorkspaceMemberRole,
}) {}

/**
 * What `/oauth/workspace` shows: the caller's memberships, earliest first,
 * and the one this browser session last picked (still a membership), if any.
 */
export class OAuthWorkspaceChoice extends Schema.Class<OAuthWorkspaceChoice>(
  "OAuthWorkspaceChoice",
)({
  workspaces: Schema.Array(OAuthWorkspace),
  selected: Schema.NullOr(WorkspaceId),
}) {}

export class SelectOAuthWorkspace extends Schema.Class<SelectOAuthWorkspace>(
  "SelectOAuthWorkspace",
)({
  workspaceId: WorkspaceId,
}) {}
