import { describe, expect, it } from "vitest";

import {
  buildApplicationSettingsAdminMutationPolicyStatements,
  buildApplicationSettingsPublicReadPolicyStatement,
  buildEnableRlsStatement,
  buildWorkspaceBootstrapInsertPolicyStatement,
  buildWorkspaceInviteAccessPolicyStatements,
  buildWorkspaceMembershipBootstrapInsertPolicyStatement,
  buildWorkspaceMembershipInviteAcceptInsertPolicyStatement,
  buildWorkspaceMutationPolicyStatements,
  buildWorkspacePublicBootstrapSelectPolicyStatement,
  buildWorkspaceSelectPolicyStatement,
  getDatabaseSessionSettings,
} from "../tenant";

describe("tenant db helpers", () => {
  it("builds database session settings from workspace context", () => {
    expect(
      getDatabaseSessionSettings({
        tenancyMode: "multi-tenant",
        userId: "user_123",
        workspaceId: "workspace_456",
        platformRole: "admin",
      }),
    ).toEqual({
      "app.platform_role": "admin",
      "app.tenancy_mode": "multi-tenant",
      "app.user_email": "",
      "app.user_id": "user_123",
      "app.workspace_id": "workspace_456",
    });
  });

  it("normalizes missing workspace context to an empty setting", () => {
    expect(
      getDatabaseSessionSettings({
        tenancyMode: "single-tenant",
        userId: "user_123",
        workspaceId: null,
        platformRole: "user",
        userEmail: "user@example.com",
      }),
    ).toMatchObject({
      "app.tenancy_mode": "single-tenant",
      "app.user_email": "user@example.com",
      "app.workspace_id": "",
    });
  });

  it("builds an enable RLS statement for a table", () => {
    expect(buildEnableRlsStatement("post")).toBe(
      'alter table "post" enable row level security;',
    );
  });

  it("builds a workspace select policy that allows pre-selection membership reads", () => {
    expect(
      buildWorkspaceSelectPolicyStatement({
        tableName: "post",
        policyName: "post_workspace_select",
      }),
    ).toContain('create policy "post_workspace_select" on "post"');
    expect(
      buildWorkspaceSelectPolicyStatement({
        tableName: "post",
        policyName: "post_workspace_select",
      }),
    ).toContain("for select");
    expect(
      buildWorkspaceSelectPolicyStatement({
        tableName: "post",
        policyName: "post_workspace_select",
      }),
    ).toContain("current_setting('app.user_id', true)");
    expect(
      buildWorkspaceSelectPolicyStatement({
        tableName: "post",
        policyName: "post_workspace_select",
      }),
    ).toContain("current_setting('app.workspace_id', true) = ''");
  });

  it("can extend workspace select policies so managers can read all memberships in the active workspace", () => {
    expect(
      buildWorkspaceSelectPolicyStatement({
        tableName: "workspace_membership",
        policyName: "workspace_membership_workspace_select",
        additionalReadPredicate: `exists (
  select 1
  from "workspace_membership" current_membership
  where current_membership.workspace_id = "workspace_membership"."workspace_id"
    and current_membership.user_id = current_setting('app.user_id', true)
    and current_membership.role in ('owner', 'admin')
    and current_membership.workspace_id::text = current_setting('app.workspace_id', true)
)`,
      }),
    ).toContain("current_membership.role in ('owner', 'admin')");
  });

  it("builds workspace mutation policies that require an active workspace", () => {
    const statements = buildWorkspaceMutationPolicyStatements({
      tableName: "post",
      policyPrefix: "post_workspace",
    });

    expect(
      statements.some((statement) =>
        statement.includes('create policy "post_workspace_insert" on "post"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('create policy "post_workspace_update" on "post"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('create policy "post_workspace_delete" on "post"'),
      ),
    ).toBe(true);
    expect(
      statements.every((statement) =>
        statement.includes("current_setting('app.workspace_id', true) <> ''"),
      ),
    ).toBe(true);
  });

  it("builds a bootstrap insert policy for the first workspace", () => {
    expect(
      buildWorkspaceBootstrapInsertPolicyStatement({
        tableName: "workspace",
        policyName: "workspace_bootstrap_insert",
      }),
    ).toContain('create policy "workspace_bootstrap_insert" on "workspace"');
    expect(
      buildWorkspaceBootstrapInsertPolicyStatement({
        tableName: "workspace",
        policyName: "workspace_bootstrap_insert",
      }),
    ).toContain('not exists (select 1 from "workspace")');
    expect(
      buildWorkspaceBootstrapInsertPolicyStatement({
        tableName: "workspace",
        policyName: "workspace_bootstrap_insert",
      }),
    ).toContain(
      '"workspace"."owner_user_id" = current_setting(\'app.user_id\', true)',
    );
  });

  it("builds a bootstrap insert policy for the initial owner membership", () => {
    expect(
      buildWorkspaceMembershipBootstrapInsertPolicyStatement({
        policyName: "workspace_membership_bootstrap_insert",
      }),
    ).toContain(
      'create policy "workspace_membership_bootstrap_insert" on "workspace_membership"',
    );
    expect(
      buildWorkspaceMembershipBootstrapInsertPolicyStatement({
        policyName: "workspace_membership_bootstrap_insert",
      }),
    ).toContain(
      '"workspace_membership"."user_id" = current_setting(\'app.user_id\', true)',
    );
    expect(
      buildWorkspaceMembershipBootstrapInsertPolicyStatement({
        policyName: "workspace_membership_bootstrap_insert",
      }),
    ).toContain("current_setting('app.workspace_id', true)");
  });

  it("builds invite access policies that allow the invited email to read and delete its row", () => {
    const statements = buildWorkspaceInviteAccessPolicyStatements();

    expect(
      statements.some((statement) =>
        statement.includes(
          `"workspace_invite_allowlist"."email" = current_setting('app.user_email', true)`,
        ),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes(
          'create policy "workspace_invite_allowlist_workspace_delete"',
        ),
      ),
    ).toBe(true);
  });

  it("builds a membership insert policy for accepting an invite", () => {
    expect(
      buildWorkspaceMembershipInviteAcceptInsertPolicyStatement({
        policyName: "workspace_membership_invite_accept_insert",
      }),
    ).toContain(
      'create policy "workspace_membership_invite_accept_insert" on "workspace_membership"',
    );
    expect(
      buildWorkspaceMembershipInviteAcceptInsertPolicyStatement({
        policyName: "workspace_membership_invite_accept_insert",
      }),
    ).toContain("workspace_invite_allowlist");
    expect(
      buildWorkspaceMembershipInviteAcceptInsertPolicyStatement({
        policyName: "workspace_membership_invite_accept_insert",
      }),
    ).toContain("current_setting('app.user_email', true)");
  });

  it("builds a public read policy for application settings", () => {
    expect(
      buildApplicationSettingsPublicReadPolicyStatement({
        policyName: "application_settings_public_read",
      }),
    ).toContain(
      'create policy "application_settings_public_read" on "application_settings"',
    );
    expect(
      buildApplicationSettingsPublicReadPolicyStatement({
        policyName: "application_settings_public_read",
      }),
    ).toContain("coalesce(current_setting('app.user_id', true), '') = ''");
  });

  it("builds admin mutation policies for application settings", () => {
    const statements = buildApplicationSettingsAdminMutationPolicyStatements({
      policyPrefix: "application_settings_platform_admin",
    });

    expect(
      statements.some((statement) =>
        statement.includes(
          'create policy "application_settings_platform_admin_insert" on "application_settings"',
        ),
      ),
    ).toBe(true);
    expect(
      statements.every((statement) =>
        statement.includes(
          "current_setting('app.platform_role', true) = 'admin'",
        ),
      ),
    ).toBe(true);
  });

  it("builds a public bootstrap select policy for workspace existence checks", () => {
    expect(
      buildWorkspacePublicBootstrapSelectPolicyStatement({
        policyName: "workspace_public_bootstrap_select",
      }),
    ).toContain(
      'create policy "workspace_public_bootstrap_select" on "workspace"',
    );
    expect(
      buildWorkspacePublicBootstrapSelectPolicyStatement({
        policyName: "workspace_public_bootstrap_select",
      }),
    ).toContain('"application_settings" bootstrap_settings');
    expect(
      buildWorkspacePublicBootstrapSelectPolicyStatement({
        policyName: "workspace_public_bootstrap_select",
      }),
    ).toContain("setup_completed_at is not null");
  });
});
