import { describe, expect, it, vi } from "vitest";

import {
  applyWorkspaceRls,
  buildWorkspaceRlsStatements,
  workspaceRlsTargets,
} from "../rls";

describe("workspace RLS rollout", () => {
  it("tracks the workspace-owned tables that should receive RLS", () => {
    expect(workspaceRlsTargets).toEqual([
      { tableName: "workspace", workspaceColumn: "id" },
      { tableName: "workspace_membership", workspaceColumn: "workspace_id" },
      {
        tableName: "workspace_invite_allowlist",
        workspaceColumn: "workspace_id",
      },
      { tableName: "workspace_subscription", workspaceColumn: "workspace_id" },
      { tableName: "workspace_usage_rollup", workspaceColumn: "workspace_id" },
    ]);
  });

  it("builds enable, force, and policy statements for each workspace table", () => {
    const statements = buildWorkspaceRlsStatements();

    expect(statements).toContain(
      'alter table "workspace" enable row level security;',
    );
    expect(statements).toContain(
      'alter table "workspace" force row level security;',
    );
    expect(
      statements.some((statement) =>
        statement.includes('create policy "workspace_workspace_select"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes(
          'create policy "workspace_usage_rollup_workspace_insert"',
        ),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('create policy "workspace_bootstrap_insert"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes(
          'create policy "workspace_membership_bootstrap_insert"',
        ),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes(
          'alter table "application_settings" enable row level security;',
        ),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('create policy "application_settings_public_read"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('create policy "workspace_public_bootstrap_select"'),
      ),
    ).toBe(true);
  });

  it("applies every generated statement through the database executor", async () => {
    const execute = vi.fn(async () => undefined);

    await applyWorkspaceRls({ execute });

    expect(execute).toHaveBeenCalledTimes(buildWorkspaceRlsStatements().length);
  });
});
