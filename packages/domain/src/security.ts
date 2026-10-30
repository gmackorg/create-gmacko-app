/**
 * Credential declarations, and nothing else: which cookie or header each
 * middleware reads, what it provides, and how it fails. Implementations live
 * in packages/auth (Phase 3); handlers only ever see `CurrentUser`.
 *
 * Every endpoint names the credential it accepts (plan principle 07):
 * `Session` (cookie only), `RequireScope(scope)`, or nothing (public).
 * Scopes come from the catalog in ./scopes.ts.
 * `AdminOnly` and `WorkspaceRole(min)` layer a role check on top of the
 * `CurrentUser` a security middleware provided.
 */
import { Context } from "effect";
import { HttpApiMiddleware, HttpApiSecurity } from "effect/http-api";

import type { User } from "./auth/models";
import { Forbidden, Unauthorized } from "./errors";
import type { Credential, WorkspaceMemberRole } from "./roles";
import type { Scope } from "./scopes";

export { Credential, WorkspaceMemberRole } from "./roles";
export { Scope } from "./scopes";

/** The authenticated user for the request, plus how they authenticated. */
export type CurrentUserShape = User & { readonly credential: Credential };

export class CurrentUser extends Context.Service<
  CurrentUser,
  CurrentUserShape
>()("@gmacko/domain/CurrentUser") {}

const SESSION_COOKIE = "better-auth.session_token";

/**
 * better-auth's session cookie name. It prefixes `__Secure-` when its base
 * URL is https (staging, production); the middleware implementation picks
 * the name from `AppConfig`, the contract declares the plain one.
 */
export const sessionCookieName = (secure: boolean): string =>
  secure ? `__Secure-${SESSION_COOKIE}` : SESSION_COOKIE;

/** One scheme object shared by every middleware, so OpenAPI sees one `session` scheme. */
export const sessionCookie = HttpApiSecurity.apiKey({
  in: "cookie",
  key: sessionCookieName(false),
});

/** `Authorization: Bearer gmk_...`. */
export const apiKeyBearer = HttpApiSecurity.bearer;

const credentialErrors = [Unauthorized, Forbidden] as const;

/**
 * Cookie session only. For endpoints a leaked key must never reach: deleting
 * the account, completing bootstrap.
 */
export class Session extends HttpApiMiddleware.Service<
  Session,
  { provides: CurrentUser }
>()("@gmacko/domain/Session", {
  error: credentialErrors,
  security: { session: sessionCookie },
}) {}

const makeRequireScope = <S extends Scope>(scope: S) => {
  /**
   * Cookie session (which holds every scope), or a bearer credential that
   * holds `scope`: a `gmk_` key with it in its permissions. A bearer without
   * the scope fails with `Forbidden("scope")`.
   */
  class RequireScope extends HttpApiMiddleware.Service<
    RequireScope,
    { provides: CurrentUser }
  >()(`@gmacko/domain/RequireScope/${scope}`, {
    error: credentialErrors,
    security: { session: sessionCookie, apiKey: apiKeyBearer },
  }) {
    static readonly scope: S = scope;
  }
  return RequireScope;
};

/**
 * Built once per scope, so each scope has exactly one tag identity. A scope
 * missing here fails to compile at `RequireScope`'s indexed return type.
 */
const requireScope = {
  "posts:write": makeRequireScope("posts:write"),
  "posts:delete": makeRequireScope("posts:delete"),
  "workspace:read": makeRequireScope("workspace:read"),
  "workspace:invite": makeRequireScope("workspace:invite"),
  "workspace:join": makeRequireScope("workspace:join"),
  "billing:read": makeRequireScope("billing:read"),
  "preferences:read": makeRequireScope("preferences:read"),
  "preferences:write": makeRequireScope("preferences:write"),
  "profile:read": makeRequireScope("profile:read"),
  "api_keys:read": makeRequireScope("api_keys:read"),
  "api_keys:manage": makeRequireScope("api_keys:manage"),
  "platform:admin": makeRequireScope("platform:admin"),
} as const;

/** The middleware tag for "a session, or a bearer credential holding `scope`". */
export const RequireScope = <S extends Scope>(
  scope: S,
): (typeof requireScope)[S] => requireScope[scope];

/**
 * Requires `CurrentUser.role === "admin"`, read fresh (bypassing the cookie
 * cache) once per request. Declared after a `RequireScope`, which provides
 * the user; never on its own.
 */
export class AdminOnly extends HttpApiMiddleware.Service<
  AdminOnly,
  { requires: CurrentUser }
>()("@gmacko/domain/AdminOnly", { error: Forbidden }) {}

const makeWorkspaceRole = <R extends WorkspaceMemberRole>(minimum: R) => {
  /** Requires at least `minimum` in the current workspace (owner > admin > member). */
  class WorkspaceRole extends HttpApiMiddleware.Service<
    WorkspaceRole,
    { requires: CurrentUser }
  >()(`@gmacko/domain/WorkspaceRole/${minimum}`, { error: Forbidden }) {
    static readonly minimum: R = minimum;
  }
  return WorkspaceRole;
};

const workspaceRole = {
  owner: makeWorkspaceRole("owner"),
  admin: makeWorkspaceRole("admin"),
  member: makeWorkspaceRole("member"),
} as const;

/** The middleware tag for "at least `minimum` in the current workspace". */
export const WorkspaceRole = <R extends WorkspaceMemberRole>(
  minimum: R,
): (typeof workspaceRole)[R] => workspaceRole[minimum];
