import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import { Conflict, NotFound } from "../errors";
import { RateLimit, RateLimitScopeAnnotation } from "../middleware";
import { RequireScope, Session, WorkspaceRole } from "../security";
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
 * Credential rules (docs/API_AUTH.md): each endpoint takes the catalog
 * scope for its resource (`RequireScope(preferences:write)`, ...); minting
 * and revoking keys takes the key-only `api_keys:manage`, so the operator
 * CLI can manage keys with a key but an OAuth client never can; deleting
 * the account is `Session` only, so a leaked key cannot do it.
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
    }).middleware(RequireScope("workspace:read")),
  )
  .add(
    HttpApiEndpoint.get("platformPrimitives", "/platform-primitives", {
      success: PlatformPrimitives,
    }).middleware(RequireScope("workspace:read")),
  )
  .add(
    HttpApiEndpoint.get("billingOverview", "/billing", {
      success: BillingOverview,
    }).middleware(RequireScope("billing:read")),
  )
  .add(
    HttpApiEndpoint.get("listInvites", "/workspace/invites", {
      success: Schema.Array(WorkspaceInvite),
    })
      .middleware(WorkspaceRole("admin"))
      .middleware(RequireScope("workspace:read")),
  )
  .add(
    HttpApiEndpoint.post("createInvite", "/workspace/invites", {
      payload: CreateInvite,
      success: WorkspaceInvite.pipe(HttpApiSchema.status(201)),
      error: Conflict,
    })
      .middleware(WorkspaceRole("admin"))
      .middleware(RequireScope("workspace:invite")),
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
    ).middleware(RequireScope("workspace:join")),
  )
  .add(
    HttpApiEndpoint.get("getPreferences", "/preferences", {
      success: UserPreferences,
    }).middleware(RequireScope("preferences:read")),
  )
  .add(
    HttpApiEndpoint.patch("updatePreferences", "/preferences", {
      payload: UpdatePreferences,
      success: UserPreferences,
    }).middleware(RequireScope("preferences:write")),
  )
  .add(
    HttpApiEndpoint.get("listApiKeys", "/api-keys", {
      success: Schema.Array(ApiKey),
    }).middleware(RequireScope("api_keys:read")),
  )
  .add(
    HttpApiEndpoint.post("createApiKey", "/api-keys", {
      payload: CreateApiKey,
      success: ApiKeyCreated.pipe(HttpApiSchema.status(201)),
    })
      .middleware(RequireScope("api_keys:manage"))
      .annotate(RateLimitScopeAnnotation, "api-keys")
      .middleware(RateLimit),
  )
  .add(
    HttpApiEndpoint.delete("revokeApiKey", "/api-keys/:id", {
      params: { id: ApiKeyId },
      error: NotFound,
    })
      .middleware(RequireScope("api_keys:manage"))
      .annotate(RateLimitScopeAnnotation, "api-keys")
      .middleware(RateLimit),
  )
  .add(
    HttpApiEndpoint.delete("deleteAccount", "/account").middleware(Session),
  ) {}
