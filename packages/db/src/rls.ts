import { sql } from "drizzle-orm";

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
} from "./tenant";

export const workspaceRlsTargets = [
  { tableName: "workspace", workspaceColumn: "id" },
  { tableName: "workspace_membership", workspaceColumn: "workspace_id" },
  {
    tableName: "workspace_invite_allowlist",
    workspaceColumn: "workspace_id",
  },
  { tableName: "workspace_subscription", workspaceColumn: "workspace_id" },
  { tableName: "workspace_usage_rollup", workspaceColumn: "workspace_id" },
] as const;

type SqlExecutor = {
  execute(statement: unknown): Promise<unknown>;
};

function buildForceRlsStatement(tableName: string) {
  return `alter table "${tableName}" force row level security;`;
}

function buildDropPolicyStatement(tableName: string, policyName: string) {
  return `drop policy if exists "${policyName}" on "${tableName}";`;
}

export function buildWorkspaceRlsStatements() {
  const workspaceStatements = workspaceRlsTargets.flatMap((target) => {
    const selectPolicyName = `${target.tableName}_workspace_select`;
    const mutationPolicyPrefix = `${target.tableName}_workspace`;
    const mutationPolicyNames = [
      `${mutationPolicyPrefix}_insert`,
      `${mutationPolicyPrefix}_update`,
      `${mutationPolicyPrefix}_delete`,
    ];
    const tableStatements = [
      buildEnableRlsStatement(target.tableName),
      buildForceRlsStatement(target.tableName),
      buildDropPolicyStatement(target.tableName, selectPolicyName),
      ...mutationPolicyNames.map((policyName) =>
        buildDropPolicyStatement(target.tableName, policyName),
      ),
      buildWorkspaceSelectPolicyStatement({
        tableName: target.tableName,
        policyName: selectPolicyName,
        workspaceColumn: target.workspaceColumn,
        additionalReadPredicate:
          target.tableName === "workspace_membership"
            ? `exists (
  select 1
  from "workspace_membership" current_membership
  where current_membership.workspace_id = "workspace_membership"."workspace_id"
    and current_membership.user_id = current_setting('app.user_id', true)
    and current_membership.role in ('owner', 'admin')
    and current_setting('app.workspace_id', true) <> ''
    and current_membership.workspace_id::text = current_setting('app.workspace_id', true)
)`
            : undefined,
      }),
      ...buildWorkspaceMutationPolicyStatements({
        tableName: target.tableName,
        policyPrefix: mutationPolicyPrefix,
        workspaceColumn: target.workspaceColumn,
      }),
    ];

    if (target.tableName === "workspace") {
      const bootstrapPolicyName = "workspace_bootstrap_insert";
      const publicBootstrapSelectPolicyName =
        "workspace_public_bootstrap_select";
      return [
        ...tableStatements,
        buildDropPolicyStatement(target.tableName, bootstrapPolicyName),
        buildDropPolicyStatement(
          target.tableName,
          publicBootstrapSelectPolicyName,
        ),
        buildWorkspaceBootstrapInsertPolicyStatement({
          tableName: "workspace",
          policyName: bootstrapPolicyName,
        }),
        buildWorkspacePublicBootstrapSelectPolicyStatement({
          policyName: publicBootstrapSelectPolicyName,
        }),
      ];
    }

    if (target.tableName === "workspace_membership") {
      const bootstrapPolicyName = "workspace_membership_bootstrap_insert";
      const inviteAcceptPolicyName =
        "workspace_membership_invite_accept_insert";
      return [
        ...tableStatements,
        buildDropPolicyStatement(target.tableName, bootstrapPolicyName),
        buildDropPolicyStatement(target.tableName, inviteAcceptPolicyName),
        buildWorkspaceMembershipBootstrapInsertPolicyStatement({
          policyName: bootstrapPolicyName,
        }),
        buildWorkspaceMembershipInviteAcceptInsertPolicyStatement({
          policyName: inviteAcceptPolicyName,
        }),
      ];
    }

    if (target.tableName === "workspace_invite_allowlist") {
      const policyNames = [
        "workspace_invite_allowlist_workspace_select",
        "workspace_invite_allowlist_workspace_insert",
        "workspace_invite_allowlist_workspace_update",
        "workspace_invite_allowlist_workspace_delete",
      ];

      return [
        buildEnableRlsStatement(target.tableName),
        buildForceRlsStatement(target.tableName),
        ...policyNames.map((policyName) =>
          buildDropPolicyStatement(target.tableName, policyName),
        ),
        ...buildWorkspaceInviteAccessPolicyStatements(),
      ];
    }

    return tableStatements;
  });

  const applicationSettingsPolicyPrefix = "application_settings_platform_admin";

  return [
    ...workspaceStatements,
    buildEnableRlsStatement("application_settings"),
    buildForceRlsStatement("application_settings"),
    buildDropPolicyStatement(
      "application_settings",
      "application_settings_public_read",
    ),
    buildDropPolicyStatement(
      "application_settings",
      `${applicationSettingsPolicyPrefix}_insert`,
    ),
    buildDropPolicyStatement(
      "application_settings",
      `${applicationSettingsPolicyPrefix}_update`,
    ),
    buildDropPolicyStatement(
      "application_settings",
      `${applicationSettingsPolicyPrefix}_delete`,
    ),
    buildApplicationSettingsPublicReadPolicyStatement({
      policyName: "application_settings_public_read",
    }),
    ...buildApplicationSettingsAdminMutationPolicyStatements({
      policyPrefix: applicationSettingsPolicyPrefix,
    }),
  ];
}

export async function applyWorkspaceRls(executor?: SqlExecutor) {
  const resolvedExecutor =
    executor ?? ((await import("./client")).db as unknown as SqlExecutor);

  for (const statement of buildWorkspaceRlsStatements()) {
    await resolvedExecutor.execute(sql.raw(statement));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  applyWorkspaceRls(undefined)
    .then(() => {
      console.log("Applied workspace RLS policies.");
    })
    .catch((error) => {
      console.error("Failed to apply workspace RLS policies.", error);
      process.exit(1);
    });
}
