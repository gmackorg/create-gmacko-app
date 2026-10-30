import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

import { NotFound } from "../errors";
import { Session } from "../security";
import { OAuthWorkspaceChoice, SelectOAuthWorkspace } from "./models";

/**
 * The browser half of authorizing an OAuth client (the remote MCP
 * endpoint's clients). better-auth's OAuth provider owns `/api/auth/oauth2/*`;
 * these endpoints back the pages it redirects to. Every one is `Session`
 * only: they act on the signed-in browser session, never on a bearer.
 *
 * `selectWorkspace` records the workspace the grant being authorized will be
 * pinned to (`oauth_workspace_selection`, keyed by the session); a workspace
 * the caller is not a member of is `NotFound`, so the endpoint never
 * confirms that someone else's workspace exists.
 */
export class OAuthApi extends HttpApiGroup.make("oauth")
  .add(
    HttpApiEndpoint.get("workspaces", "/workspaces", {
      success: OAuthWorkspaceChoice,
    }).middleware(Session),
  )
  .add(
    HttpApiEndpoint.put("selectWorkspace", "/workspace", {
      payload: SelectOAuthWorkspace,
      success: OAuthWorkspaceChoice,
      error: NotFound,
    }).middleware(Session),
  )
  .prefix("/oauth") {}
