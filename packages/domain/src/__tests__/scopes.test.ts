/**
 * The scope catalog's invariants: every scope is `resource:action`, every
 * endpoint that accepts a bearer names exactly one catalog scope, every
 * catalog scope guards at least one endpoint, the key-only scopes are the
 * ones a connected OAuth client must never hold, and the legacy key
 * permissions expand without widening anyone's access.
 */
import { describe, expect, it } from "vitest";

import { AppApi } from "../api";
import { inspectApi } from "../inspect";
import {
  ALL_SCOPES,
  DEFAULT_SCOPES,
  isScope,
  LEGACY_PERMISSION_SCOPES,
  OAUTH_SCOPES,
  SCOPES,
  toScopes,
} from "../scopes";

describe("scope catalog", () => {
  it("names every scope resource:action", () => {
    for (const scope of ALL_SCOPES) {
      expect(scope).toMatch(/^[a-z_]+:[a-z]+$/);
    }
  });

  it("guards every bearer endpoint with exactly one catalog scope, and uses every scope", () => {
    const used = new Set<string>();
    for (const row of inspectApi(AppApi)) {
      if (row.credential === "public" || row.credential === "Session") {
        expect(row.scope, `${row.method} ${row.path}`).toBeNull();
        continue;
      }
      expect(row.scope, `${row.method} ${row.path}`).not.toBeNull();
      if (row.scope !== null) used.add(row.scope);
    }
    expect([...used].sort()).toEqual([...ALL_SCOPES].sort());
  });

  it("keeps key management, joining workspaces and platform admin out of OAuth", () => {
    expect(
      ALL_SCOPES.filter((scope) => SCOPES[scope].grantable === "key-only"),
    ).toEqual(["workspace:join", "api_keys:manage", "platform:admin"]);
    expect(OAUTH_SCOPES).not.toContain("api_keys:manage");
    expect(OAUTH_SCOPES).not.toContain("platform:admin");
    expect(OAUTH_SCOPES).not.toContain("workspace:join");
  });

  it("defaults to the read scopes, all of them OAuth-grantable", () => {
    expect(DEFAULT_SCOPES.length).toBeGreaterThan(0);
    for (const scope of DEFAULT_SCOPES) {
      expect(scope.endsWith(":read")).toBe(true);
      expect(OAUTH_SCOPES).toContain(scope);
    }
  });

  it("drops stored values that are not catalog scopes", () => {
    expect(toScopes(["posts:write", "read", "constructor", ""])).toEqual([
      "posts:write",
    ]);
    expect(isScope("toString")).toBe(false);
  });
});

describe("legacy API-key permissions", () => {
  it("expand read to the read scopes and admin to everything", () => {
    expect(LEGACY_PERMISSION_SCOPES.read).toEqual(DEFAULT_SCOPES);
    expect(LEGACY_PERMISSION_SCOPES.admin).toEqual(ALL_SCOPES);
  });

  it("keep each endpoint's old permission: an old key reaches what it reached before", () => {
    // The pre-catalog check was `permissions.includes(old) || includes("admin")`;
    // each endpoint's old permission is recorded here once, from the
    // contract as it stood before the catalog.
    const oldPermission = new Map<
      string,
      "read" | "write" | "delete" | "admin"
    >(
      Object.entries({
        "auth.secret": "read",
        "posts.create": "write",
        "posts.remove": "delete",
        "settings.workspaceContext": "read",
        "settings.platformPrimitives": "read",
        "settings.billingOverview": "read",
        "settings.listInvites": "read",
        "settings.createInvite": "write",
        "settings.acceptInvite": "write",
        "settings.getPreferences": "read",
        "settings.updatePreferences": "write",
        "settings.listApiKeys": "read",
        "settings.createApiKey": "admin",
        "settings.revokeApiKey": "admin",
      }),
    );
    for (const row of inspectApi(AppApi)) {
      if (row.scope === null) continue;
      const name = `${row.group}.${row.id}`;
      const old = row.group === "admin" ? "admin" : oldPermission.get(name);
      expect(old, `${name} has no recorded old permission`).toBeDefined();
      if (old === undefined) continue;
      expect(LEGACY_PERMISSION_SCOPES[old], name).toContain(row.scope);
      expect(LEGACY_PERMISSION_SCOPES.admin, name).toContain(row.scope);
    }
  });
});
