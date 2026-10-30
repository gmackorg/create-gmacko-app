import { Schema } from "effect";

import { WorkspaceId } from "../models/ids";
import { WorkspaceMemberRole } from "../roles";
import { Scope } from "../scopes";

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

/** The workspace a connection is pinned to, as Settings shows it. */
export class OAuthConnectionWorkspace extends Schema.Class<OAuthConnectionWorkspace>(
  "OAuthConnectionWorkspace",
)({
  id: WorkspaceId,
  name: Schema.String,
}) {}

/**
 * One app connected through OAuth (an MCP client): the user's consent for
 * that client in one workspace. `workspace` is `null` when the workspace has
 * since been deleted (its tokens no longer authenticate). `scopes` lists the
 * catalog scopes granted; `offline_access` is not a permission and is left
 * out.
 */
export class OAuthConnection extends Schema.Class<OAuthConnection>(
  "OAuthConnection",
)({
  id: Schema.String,
  clientId: Schema.String,
  clientName: Schema.NullOr(Schema.String),
  workspace: Schema.NullOr(OAuthConnectionWorkspace),
  scopes: Schema.Array(Scope),
  createdAt: Schema.Date,
}) {}
