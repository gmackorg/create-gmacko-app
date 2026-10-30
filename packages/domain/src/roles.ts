/**
 * Roles and credential kinds shared by the models and the security
 * declarations. Kept apart from both so neither imports the other.
 */
import { Schema } from "effect";

/** Platform role on `user.role`; `admin` unlocks every admin endpoint. */
export const UserRole = Schema.Literals(["user", "admin"]);
export type UserRole = typeof UserRole.Type;

/** Membership role inside a workspace; `owner` > `admin` > `member`. */
export const WorkspaceMemberRole = Schema.Literals([
  "owner",
  "admin",
  "member",
]);
export type WorkspaceMemberRole = typeof WorkspaceMemberRole.Type;

/**
 * How the current request was authenticated: the session cookie, a `gmk_`
 * API key, or an OAuth access token (`gmo_`, only on requests the `/mcp`
 * endpoint dispatches).
 */
export const Credential = Schema.Literals(["session", "key", "oauth"]);
export type Credential = typeof Credential.Type;
