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

/** What an API key may do; `admin` implies every other scope. */
export const ApiKeyScope = Schema.Literals([
  "read",
  "write",
  "delete",
  "admin",
]);
export type ApiKeyScope = typeof ApiKeyScope.Type;

/** How the current request was authenticated. */
export const Credential = Schema.Literals(["session", "key"]);
export type Credential = typeof Credential.Type;
