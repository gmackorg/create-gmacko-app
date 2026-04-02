import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

import type { UserRole } from "./auth-schema";
import type { TenancyMode } from "./schema";

export interface DatabaseSessionContext {
  tenancyMode: TenancyMode;
  userId: string;
  userEmail?: string | null;
  workspaceId?: string | null;
  platformRole?: UserRole | null;
}

type SessionExecutor = {
  execute(query: SQL): Promise<unknown>;
};

type TransactionCapable<TTx extends SessionExecutor = SessionExecutor> = {
  transaction<T>(callback: (tx: TTx) => Promise<T>): Promise<T>;
};

export function getDatabaseSessionSettings(
  context: DatabaseSessionContext,
): Record<string, string> {
  return {
    "app.platform_role": context.platformRole ?? "user",
    "app.tenancy_mode": context.tenancyMode,
    "app.user_email": context.userEmail ?? "",
    "app.user_id": context.userId,
    "app.workspace_id": context.workspaceId ?? "",
  };
}

export function buildEnableRlsStatement(tableName: string): string {
  return `alter table "${tableName}" enable row level security;`;
}

function buildWorkspaceScopedReadPredicate(input: {
  tableName: string;
  workspaceColumn?: string;
  membershipTable?: string;
}) {
  const workspaceColumn = input.workspaceColumn ?? "workspace_id";
  const membershipTable = input.membershipTable ?? "workspace_membership";

  return `exists (
  select 1
  from "${membershipTable}" membership
  where membership.workspace_id = "${input.tableName}"."${workspaceColumn}"
    and membership.user_id = current_setting('app.user_id', true)
    and (
      current_setting('app.workspace_id', true) = ''
      or membership.workspace_id::text = current_setting('app.workspace_id', true)
    )
)`;
}

function buildWorkspaceScopedMutationPredicate(input: {
  tableName: string;
  workspaceColumn?: string;
  membershipTable?: string;
}) {
  const workspaceColumn = input.workspaceColumn ?? "workspace_id";
  const membershipTable = input.membershipTable ?? "workspace_membership";

  return `exists (
  select 1
  from "${membershipTable}" membership
  where membership.workspace_id = "${input.tableName}"."${workspaceColumn}"
    and membership.user_id = current_setting('app.user_id', true)
    and current_setting('app.workspace_id', true) <> ''
    and membership.workspace_id::text = current_setting('app.workspace_id', true)
)`;
}

export function buildWorkspaceSelectPolicyStatement(input: {
  tableName: string;
  policyName: string;
  workspaceColumn?: string;
  membershipTable?: string;
  additionalReadPredicate?: string;
}): string {
  const readPredicate = buildWorkspaceScopedReadPredicate(input);
  const combinedReadPredicate = input.additionalReadPredicate
    ? `(${readPredicate})
  or (${input.additionalReadPredicate})`
    : readPredicate;

  return `create policy "${input.policyName}" on "${input.tableName}"
for select
using (${combinedReadPredicate});`;
}

export function buildWorkspaceMutationPolicyStatements(input: {
  tableName: string;
  policyPrefix: string;
  workspaceColumn?: string;
  membershipTable?: string;
}): string[] {
  const mutationPredicate = buildWorkspaceScopedMutationPredicate(input);

  return [
    `create policy "${input.policyPrefix}_insert" on "${input.tableName}"
for insert
with check (${mutationPredicate});`,
    `create policy "${input.policyPrefix}_update" on "${input.tableName}"
for update
using (${mutationPredicate})
with check (${mutationPredicate});`,
    `create policy "${input.policyPrefix}_delete" on "${input.tableName}"
for delete
using (${mutationPredicate});`,
  ];
}

export function buildWorkspaceBootstrapInsertPolicyStatement(input: {
  tableName: "workspace";
  policyName: string;
}) {
  return `create policy "${input.policyName}" on "${input.tableName}"
for insert
with check (
  not exists (select 1 from "workspace")
  and current_setting('app.workspace_id', true) = ''
  and "${input.tableName}"."owner_user_id" = current_setting('app.user_id', true)
);`;
}

export function buildWorkspaceMembershipBootstrapInsertPolicyStatement(input: {
  policyName: string;
}) {
  return `create policy "${input.policyName}" on "workspace_membership"
for insert
with check (
  current_setting('app.workspace_id', true) = ''
  and "workspace_membership"."user_id" = current_setting('app.user_id', true)
  and exists (
    select 1
    from "workspace" bootstrap_workspace
    where bootstrap_workspace.id = "workspace_membership"."workspace_id"
      and bootstrap_workspace.owner_user_id = current_setting('app.user_id', true)
  )
  and not exists (
    select 1
    from "workspace_membership" existing_membership
    where existing_membership.workspace_id = "workspace_membership"."workspace_id"
  )
);`;
}

export function buildWorkspaceMembershipInviteAcceptInsertPolicyStatement(input: {
  policyName: string;
}) {
  return `create policy "${input.policyName}" on "workspace_membership"
for insert
with check (
  current_setting('app.workspace_id', true) = ''
  and "workspace_membership"."user_id" = current_setting('app.user_id', true)
  and exists (
    select 1
    from "workspace_invite_allowlist" invite
    where invite.workspace_id = "workspace_membership"."workspace_id"
      and invite.email = current_setting('app.user_email', true)
      and invite.role = "workspace_membership"."role"
  )
);`;
}

export function buildApplicationSettingsPublicReadPolicyStatement(input: {
  policyName: string;
}) {
  return `create policy "${input.policyName}" on "application_settings"
for select
using (
  coalesce(current_setting('app.user_id', true), '') = ''
  or coalesce(current_setting('app.user_id', true), '') <> ''
);`;
}

export function buildApplicationSettingsAdminMutationPolicyStatements(input: {
  policyPrefix: string;
}) {
  const adminPredicate = `current_setting('app.platform_role', true) = 'admin'`;

  return [
    `create policy "${input.policyPrefix}_insert" on "application_settings"
for insert
with check (${adminPredicate});`,
    `create policy "${input.policyPrefix}_update" on "application_settings"
for update
using (${adminPredicate})
with check (${adminPredicate});`,
    `create policy "${input.policyPrefix}_delete" on "application_settings"
for delete
using (${adminPredicate});`,
  ];
}

export function buildWorkspacePublicBootstrapSelectPolicyStatement(input: {
  policyName: string;
}) {
  return `create policy "${input.policyName}" on "workspace"
for select
using (
  coalesce(current_setting('app.user_id', true), '') = ''
  and not exists (
    select 1
    from "application_settings" bootstrap_settings
    where bootstrap_settings.setup_completed_at is not null
  )
);`;
}

export function buildWorkspaceInviteAccessPolicyStatements(): string[] {
  const readPredicate = `${buildWorkspaceScopedReadPredicate({
    tableName: "workspace_invite_allowlist",
  })}
  or "workspace_invite_allowlist"."email" = current_setting('app.user_email', true)`;
  const mutationPredicate = buildWorkspaceScopedMutationPredicate({
    tableName: "workspace_invite_allowlist",
  });
  const deletePredicate = `(${mutationPredicate})
  or "workspace_invite_allowlist"."email" = current_setting('app.user_email', true)`;

  return [
    `create policy "workspace_invite_allowlist_workspace_select" on "workspace_invite_allowlist"
for select
using (${readPredicate});`,
    `create policy "workspace_invite_allowlist_workspace_insert" on "workspace_invite_allowlist"
for insert
with check (${mutationPredicate});`,
    `create policy "workspace_invite_allowlist_workspace_update" on "workspace_invite_allowlist"
for update
using (${mutationPredicate})
with check (${mutationPredicate});`,
    `create policy "workspace_invite_allowlist_workspace_delete" on "workspace_invite_allowlist"
for delete
using (${deletePredicate});`,
  ];
}

export async function applyDatabaseSessionContext(
  executor: SessionExecutor,
  context: DatabaseSessionContext,
): Promise<void> {
  const settings = getDatabaseSessionSettings(context);

  for (const [key, value] of Object.entries(settings)) {
    await executor.execute(sql`select set_config(${key}, ${value}, true)`);
  }
}

export async function withDatabaseSessionContext<
  TTx extends SessionExecutor,
  TResult,
>(
  database: TransactionCapable<TTx>,
  context: DatabaseSessionContext,
  callback: (tx: TTx) => Promise<TResult>,
): Promise<TResult> {
  return database.transaction(async (tx) => {
    await applyDatabaseSessionContext(tx, context);
    return callback(tx);
  });
}
