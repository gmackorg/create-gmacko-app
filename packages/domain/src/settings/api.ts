import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";

import { Conflict, NotFound } from "../errors";
import { RateLimit, RateLimitScopeAnnotation } from "../middleware";
import { Session, SessionOrKey, WorkspaceRole } from "../security";
import {
  ApiKey,
  ApiKeyCreated,
  ApiKeyId,
  BillingOverview,
  CreateApiKey,
  CreateInvite,
  InviteAccepted,
  InviteId,
  LaunchState,
  PlatformPrimitives,
  UpdatePreferences,
  UserPreferences,
  WaitlistSubmission,
  WaitlistSubmit,
  WorkspaceContext,
  WorkspaceInvite,
} from "./models";

/**
 * The signed-in user's own settings, workspace and billing, plus the public
 * launch state and waitlist. Paths are resource nouns with no group prefix.
 *
 * Credential rules (docs/API_AUTH.md): reads take `SessionOrKey(read)`,
 * mutations `SessionOrKey(write)`; minting and revoking keys takes
 * `SessionOrKey(admin)` so the operator CLI/MCP can manage keys with a key;
 * deleting the account is `Session` only, so a leaked key cannot do it.
 * Role middlewares are declared before the credential one: the credential
 * middleware runs outermost and provides the `CurrentUser` the role check
 * reads. `RateLimit` (contact form, key management) is declared after it,
 * so an over-limit caller is refused before any credential is read.
 */
export class SettingsApi extends HttpApiGroup.make("settings")
  .add(
    HttpApiEndpoint.get("launchState", "/launch-state", {
      success: LaunchState,
    }),
  )
  .add(
    HttpApiEndpoint.post("submitWaitlistEntry", "/waitlist", {
      payload: WaitlistSubmit,
      success: WaitlistSubmission.pipe(HttpApiSchema.status(201)),
    })
      .annotate(RateLimitScopeAnnotation, "contact")
      .middleware(RateLimit),
  )
  .add(
    HttpApiEndpoint.get("workspaceContext", "/workspace", {
      success: WorkspaceContext,
    }).middleware(SessionOrKey("read")),
  )
  .add(
    HttpApiEndpoint.get("platformPrimitives", "/platform-primitives", {
      success: PlatformPrimitives,
    }).middleware(SessionOrKey("read")),
  )
  .add(
    HttpApiEndpoint.get("billingOverview", "/billing", {
      success: BillingOverview,
    }).middleware(SessionOrKey("read")),
  )
  .add(
    HttpApiEndpoint.get("listInvites", "/workspace/invites", {
      success: Schema.Array(WorkspaceInvite),
    })
      .middleware(WorkspaceRole("admin"))
      .middleware(SessionOrKey("read")),
  )
  .add(
    HttpApiEndpoint.post("createInvite", "/workspace/invites", {
      payload: CreateInvite,
      success: WorkspaceInvite.pipe(HttpApiSchema.status(201)),
      error: Conflict,
    })
      .middleware(WorkspaceRole("admin"))
      .middleware(SessionOrKey("write")),
  )
  .add(
    HttpApiEndpoint.post(
      "acceptInvite",
      "/workspace/invites/:inviteId/accept",
      {
        params: { inviteId: InviteId },
        success: InviteAccepted,
        // NotFound also covers an invite addressed to another email, so the
        // endpoint never confirms that an invite exists for someone else.
        error: [NotFound, Conflict],
      },
    ).middleware(SessionOrKey("write")),
  )
  .add(
    HttpApiEndpoint.get("getPreferences", "/preferences", {
      success: UserPreferences,
    }).middleware(SessionOrKey("read")),
  )
  .add(
    HttpApiEndpoint.patch("updatePreferences", "/preferences", {
      payload: UpdatePreferences,
      success: UserPreferences,
    }).middleware(SessionOrKey("write")),
  )
  .add(
    HttpApiEndpoint.get("listApiKeys", "/api-keys", {
      success: Schema.Array(ApiKey),
    }).middleware(SessionOrKey("read")),
  )
  .add(
    HttpApiEndpoint.post("createApiKey", "/api-keys", {
      payload: CreateApiKey,
      success: ApiKeyCreated.pipe(HttpApiSchema.status(201)),
    })
      .middleware(SessionOrKey("admin"))
      .annotate(RateLimitScopeAnnotation, "api-keys")
      .middleware(RateLimit),
  )
  .add(
    HttpApiEndpoint.delete("revokeApiKey", "/api-keys/:id", {
      params: { id: ApiKeyId },
      error: NotFound,
    })
      .middleware(SessionOrKey("admin"))
      .annotate(RateLimitScopeAnnotation, "api-keys")
      .middleware(RateLimit),
  )
  .add(
    HttpApiEndpoint.delete("deleteAccount", "/account").middleware(Session),
  ) {}
