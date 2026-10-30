/**
 * The scope catalog: the one permission vocabulary for every credential.
 * An endpoint declares exactly one scope (`RequireScope(scope)` in
 * ./security.ts); a cookie session holds them all, a `gmk_` API key holds
 * the scopes stored on it, and an OAuth access token holds the scopes the
 * user granted at consent.
 *
 * A scope narrows what a credential may do; it never grants a role.
 * `AdminOnly` and `WorkspaceRole(min)` still check the user's own role on
 * top of the scope.
 *
 * `grantable` says which credentials may carry a scope. `key-only` scopes
 * are never offered on the OAuth consent page, and the `/mcp` resource's
 * allowed scopes exclude them, so a connected client can never mint keys,
 * join workspaces, or act as a platform admin.
 */
import { Schema } from "effect";

export const Scope = Schema.Literals([
  "posts:write",
  "posts:delete",
  "workspace:read",
  "workspace:invite",
  "workspace:join",
  "billing:read",
  "preferences:read",
  "preferences:write",
  "profile:read",
  "api_keys:read",
  "api_keys:manage",
  "platform:admin",
]);
export type Scope = typeof Scope.Type;

export type ScopeGrantable = "oauth" | "key-only";

export interface ScopeInfo {
  /** Shown next to the scope's checkbox on the consent page and key form. */
  readonly description: string;
  readonly grantable: ScopeGrantable;
}

export const SCOPES: Readonly<Record<Scope, ScopeInfo>> = {
  "posts:write": { description: "Create posts", grantable: "oauth" },
  "posts:delete": { description: "Delete posts", grantable: "oauth" },
  "workspace:read": {
    description: "Read the workspace, its members and invites",
    grantable: "oauth",
  },
  "workspace:invite": {
    description: "Invite people to the workspace",
    grantable: "oauth",
  },
  "workspace:join": {
    description: "Accept workspace invites",
    grantable: "key-only",
  },
  "billing:read": {
    description: "Read the workspace's plan and usage",
    grantable: "oauth",
  },
  "preferences:read": {
    description: "Read your preferences",
    grantable: "oauth",
  },
  "preferences:write": {
    description: "Change your preferences",
    grantable: "oauth",
  },
  "profile:read": { description: "Read your profile", grantable: "oauth" },
  "api_keys:read": { description: "List your API keys", grantable: "oauth" },
  "api_keys:manage": {
    description: "Create and revoke API keys",
    grantable: "key-only",
  },
  "platform:admin": {
    description: "Platform administration (platform admins only)",
    grantable: "key-only",
  },
};

/** Every scope, in catalog order. */
export const ALL_SCOPES: ReadonlyArray<Scope> = Scope.literals;

/** The scopes an OAuth client may be granted, in catalog order. */
export const OAUTH_SCOPES: ReadonlyArray<Scope> = ALL_SCOPES.filter(
  (scope) => SCOPES[scope].grantable === "oauth",
);

/** Scopes pre-selected on the consent page and key form: the reads. */
export const DEFAULT_SCOPES: ReadonlyArray<Scope> = ALL_SCOPES.filter((scope) =>
  scope.endsWith(":read"),
);

const scopeSet: ReadonlySet<string> = new Set(ALL_SCOPES);

export const isScope = (value: string): value is Scope => scopeSet.has(value);

/**
 * Stored scope lists (`api_keys.permissions`, an OAuth token's `scopes`)
 * are untyped strings. Keep only catalog scopes, so a value the catalog
 * does not know grants nothing rather than failing the request.
 */
export const toScopes = (values: ReadonlyArray<string>): ReadonlyArray<Scope> =>
  values.filter(isScope);

/**
 * The pre-catalog API-key permissions and what each one expands to; the
 * `api_key_scopes` migration rewrote stored keys with the same table, so a
 * key keeps its effective access. `admin` implied every other permission,
 * so it expands to every scope.
 */
export const LEGACY_PERMISSION_SCOPES: Readonly<
  Record<"read" | "write" | "delete" | "admin", ReadonlyArray<Scope>>
> = {
  read: DEFAULT_SCOPES,
  write: [
    "posts:write",
    "preferences:write",
    "workspace:invite",
    "workspace:join",
  ],
  delete: ["posts:delete"],
  admin: ALL_SCOPES,
};
