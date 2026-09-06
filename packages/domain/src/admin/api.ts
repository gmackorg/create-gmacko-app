import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";

import { User, UserId } from "../auth/models";
import { Conflict, NotFound } from "../errors";
import { RateLimit, RateLimitScopeAnnotation } from "../middleware";
import { AdminOnly, Session, SessionOrKey } from "../security";
import { WaitlistEntry, WaitlistEntryId } from "../settings/models";
import {
  AdminStats,
  AdminWorkspace,
  ApplicationSettings,
  BootstrapCompleted,
  BootstrapStatus,
  CompleteBootstrap,
  LaunchControls,
  ListUsersQuery,
  ReviewWaitlistEntry,
  UpdateLaunchControls,
  UpdateUserRole,
  UserList,
} from "./models";

/**
 * Every `/admin/*` endpoint takes `SessionOrKey(admin)` (a session, or a key
 * holding the `admin` scope) and then `AdminOnly` (the user's platform role
 * is `admin`; a key scope never grants that), and counts against the
 * `operator-api` rate limit. Bootstrap sits outside `/admin`: its status is
 * public and completing it is first-come, first-served for any session,
 * which is what makes the first user admin.
 */
export class AdminApi extends HttpApiGroup.make("admin")
  .add(
    HttpApiEndpoint.get("launchControls", "/admin/launch-controls", {
      success: LaunchControls,
    })
      .middleware(AdminOnly)
      .middleware(SessionOrKey("admin"))
      .annotate(RateLimitScopeAnnotation, "operator-api")
      .middleware(RateLimit),
  )
  .add(
    HttpApiEndpoint.patch("updateLaunchControls", "/admin/launch-controls", {
      payload: UpdateLaunchControls,
      success: ApplicationSettings,
    })
      .middleware(AdminOnly)
      .middleware(SessionOrKey("admin"))
      .annotate(RateLimitScopeAnnotation, "operator-api")
      .middleware(RateLimit),
  )
  .add(
    HttpApiEndpoint.get("listWaitlistEntries", "/admin/waitlist", {
      success: Schema.Array(WaitlistEntry),
    })
      .middleware(AdminOnly)
      .middleware(SessionOrKey("admin"))
      .annotate(RateLimitScopeAnnotation, "operator-api")
      .middleware(RateLimit),
  )
  .add(
    HttpApiEndpoint.post("reviewWaitlistEntry", "/admin/waitlist/:id/review", {
      params: { id: WaitlistEntryId },
      payload: ReviewWaitlistEntry,
      success: WaitlistEntry,
      // Conflict("waitlist-status-changed"): the entry's status is no longer
      // what the reviewer read (optimistic guard on the write). Approving an
      // email that is already on the allowlist succeeds and leaves that
      // row alone.
      error: [NotFound, Conflict],
    })
      .middleware(AdminOnly)
      .middleware(SessionOrKey("admin"))
      .annotate(RateLimitScopeAnnotation, "operator-api")
      .middleware(RateLimit),
  )
  .add(
    HttpApiEndpoint.get("bootstrapStatus", "/bootstrap", {
      success: BootstrapStatus,
    }),
  )
  .add(
    HttpApiEndpoint.post("completeBootstrap", "/bootstrap/complete", {
      payload: CompleteBootstrap,
      success: BootstrapCompleted.pipe(HttpApiSchema.status(201)),
      error: Conflict,
    }).middleware(Session),
  )
  .add(
    HttpApiEndpoint.get("stats", "/admin/stats", {
      success: AdminStats,
    })
      .middleware(AdminOnly)
      .middleware(SessionOrKey("admin"))
      .annotate(RateLimitScopeAnnotation, "operator-api")
      .middleware(RateLimit),
  )
  .add(
    HttpApiEndpoint.get("listWorkspaces", "/admin/workspaces", {
      success: Schema.Array(AdminWorkspace),
    })
      .middleware(AdminOnly)
      .middleware(SessionOrKey("admin"))
      .annotate(RateLimitScopeAnnotation, "operator-api")
      .middleware(RateLimit),
  )
  .add(
    HttpApiEndpoint.get("listUsers", "/admin/users", {
      query: ListUsersQuery,
      success: UserList,
    })
      .middleware(AdminOnly)
      .middleware(SessionOrKey("admin"))
      .annotate(RateLimitScopeAnnotation, "operator-api")
      .middleware(RateLimit),
  )
  .add(
    HttpApiEndpoint.patch("updateUserRole", "/admin/users/:userId/role", {
      params: { userId: UserId },
      payload: UpdateUserRole,
      success: User,
      // Conflict("self-demotion"): an admin may not remove their own role.
      error: [NotFound, Conflict],
    })
      .middleware(AdminOnly)
      .middleware(SessionOrKey("admin"))
      .annotate(RateLimitScopeAnnotation, "operator-api")
      .middleware(RateLimit),
  )
  .add(
    HttpApiEndpoint.get("getUser", "/admin/users/:userId", {
      params: { userId: UserId },
      success: User,
      error: NotFound,
    })
      .middleware(AdminOnly)
      .middleware(SessionOrKey("admin"))
      .annotate(RateLimitScopeAnnotation, "operator-api")
      .middleware(RateLimit),
  ) {}
