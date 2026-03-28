import { describe, expect, it, vi } from "vitest";

import { executeOperatorTool, listOperatorTools } from "../index";

function createMockClient() {
  return {
    settings: {
      getWorkspaceContext: {
        query: vi.fn(async () => ({
          workspace: { id: "workspace_1", name: "Acme", slug: "acme" },
          workspaceRole: "owner",
        })),
      },
      getBillingOverview: {
        query: vi.fn(async () => ({
          billing: { visible: true, plans: [] },
          usage: { visible: true, limits: [], meters: [] },
        })),
      },
      listApiKeys: {
        query: vi.fn(async () => [{ id: "key_1", name: "Automation" }]),
      },
      createApiKey: {
        mutate: vi.fn(async (input: unknown) => ({
          id: "key_2",
          key: "gmk_secret",
          ...((input ?? {}) as object),
        })),
      },
      revokeApiKey: {
        mutate: vi.fn(async (input: unknown) => ({
          success: true,
          ...((input ?? {}) as object),
        })),
      },
    },
  };
}

describe("operator core", () => {
  it("lists SaaS-oriented operator tools", () => {
    const tools = listOperatorTools();
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "auth_help",
        "get_workspace_context",
        "get_billing_overview",
        "list_api_keys",
        "create_api_key",
        "revoke_api_key",
      ]),
    );
  });

  it("returns login guidance without requiring an authenticated client", async () => {
    await expect(
      executeOperatorTool(undefined as never, "auth_help"),
    ).resolves.toContain("browser-based OAuth or magic-link sign-in");
  });

  it("executes workspace and billing tools against the shared client", async () => {
    const client = createMockClient() as never;

    await expect(
      executeOperatorTool(client, "get_workspace_context"),
    ).resolves.toContain('"workspaceRole": "owner"');

    await expect(
      executeOperatorTool(client, "get_billing_overview"),
    ).resolves.toContain('"visible": true');
  });

  it("creates and revokes API keys through the shared settings router", async () => {
    const client = createMockClient() as never;

    await expect(
      executeOperatorTool(client, "create_api_key", {
        name: "Automation",
        permissions: "read,write",
        expiresInDays: "30",
      }),
    ).resolves.toContain('"name": "Automation"');

    await expect(
      executeOperatorTool(client, "revoke_api_key", { id: "key_1" }),
    ).resolves.toContain('"success": true');
  });
});
