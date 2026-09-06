/**
 * The MCP executor over operator-core, against the in-process `TestApi`
 * with an admin-scoped key: the key gate, the tool list the server
 * advertises, and one protected call end to end.
 */
import { makeTestApi, type TestApi } from "@gmacko/api/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOperatorExecutor } from "../core";

let api: TestApi;
let adminKey: string;
beforeAll(async () => {
  api = makeTestApi();
  const admin = await api.createUser({ role: "admin" });
  adminKey = (await api.createApiKey(admin, ["admin"])).key;
});
afterAll(() => api.dispose());

describe("mcp operator executor", () => {
  it("allows auth help without an API key", async () => {
    const executor = createOperatorExecutor({ baseUrl: api.baseUrl });

    await expect(executor.callTool("auth_help")).resolves.toContain(
      "browser-based OAuth or magic-link sign-in",
    );
  });

  it("rejects protected tools when no API key is configured", () => {
    const executor = createOperatorExecutor({ baseUrl: api.baseUrl });

    expect(() => executor.callTool("get_workspace_context")).toThrow(
      "GMACKO_API_KEY environment variable is required for protected operator tools",
    );
  });

  it("advertises every operator tool with a JSON Schema input", () => {
    const tools = createOperatorExecutor({ baseUrl: api.baseUrl }).listTools();
    expect(tools.map((tool) => tool.name)).toContain("create_api_key");
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeTypeOf("object");
    }
  });

  it("runs a protected tool through the API with the configured key", async () => {
    const executor = createOperatorExecutor({
      apiKey: adminKey,
      baseUrl: api.baseUrl,
      transport: (request) => api.handler(request),
    });

    await expect(executor.callTool("get_workspace_context")).resolves.toContain(
      '"isPlatformAdmin": true',
    );
    await expect(
      executor.callTool("create_post", { title: "From MCP", content: "hi" }),
    ).resolves.toContain('"title": "From MCP"');
  });

  it("reports a wrong-scope key as the contract's Forbidden", async () => {
    const admin = await api.createUser({ role: "admin" });
    const readKey = (await api.createApiKey(admin, ["read"])).key;
    const executor = createOperatorExecutor({
      apiKey: readKey,
      baseUrl: api.baseUrl,
      transport: (request) => api.handler(request),
    });
    await expect(
      executor.callTool("create_api_key", { name: "x", permissions: "read" }),
    ).rejects.toThrow("Forbidden (scope)");
  });
});
