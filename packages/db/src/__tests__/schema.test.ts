import { getTableConfig } from "drizzle-orm/pg-core";
// @ts-expect-error vitest is installed in sibling workspace test packages
import { describe, expect, it } from "vitest";

import { userRoleEnum } from "../auth-schema";
import {
  applicationSettings,
  workspace,
  workspaceInviteAllowlist,
  workspaceMembership,
  workspaceRoleEnum,
} from "../schema";

describe("SaaS workspace schema", () => {
  it("keeps platform roles separate from workspace roles", () => {
    expect(userRoleEnum).toEqual(["user", "admin"]);
    expect(workspaceRoleEnum).toEqual(["owner", "admin", "member"]);
    expect(userRoleEnum).not.toContain("owner");
    expect(userRoleEnum).not.toContain("member");
  });

  it("uses memberships instead of a single owner field on workspaces", () => {
    expect(workspace.id).toBeDefined();
    expect(workspace.slug).toBeDefined();
    expect(workspaceMembership.workspaceId).toBeDefined();
    expect(workspaceMembership.userId).toBeDefined();
    expect(workspaceMembership.role).toBeDefined();
  });

  it("tracks invite allowlist entries separately from memberships", () => {
    const membershipConfig = getTableConfig(workspaceMembership);
    const inviteConfig = getTableConfig(workspaceInviteAllowlist);

    expect(workspaceInviteAllowlist.workspaceId).toBeDefined();
    expect(workspaceInviteAllowlist.email).toBeDefined();
    expect(workspaceInviteAllowlist.invitedByUserId).toBeDefined();
    expect(applicationSettings.initialWorkspaceId).toBeDefined();
    expect(
      membershipConfig.uniqueConstraints.map((constraint) =>
        constraint.getName(),
      ),
    ).toContain("workspace_membership_workspace_user_unique");
    expect(
      inviteConfig.uniqueConstraints.map((constraint) => constraint.getName()),
    ).toContain("workspace_invite_allowlist_workspace_email_unique");
  });
});
