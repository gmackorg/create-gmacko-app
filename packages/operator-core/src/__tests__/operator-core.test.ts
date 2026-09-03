/**
 * The operator tools against the in-process `TestApi`, as the CLI and the
 * MCP server drive them: a bearer key (admin-scoped for key management), the
 * tool list with input schemas derived from the contract, CLI-style string
 * arguments coerced through those schemas, and the contract's typed errors
 * surfacing as messages.
 */
import { makeTestApi, type TestApi, type TestUser } from "@gmacko/api/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createOperatorClient,
  executeOperatorTool,
  listOperatorTools,
} from "../index";

let api: TestApi;
let admin: TestUser;
let adminKey: string;
let readKey: string;
beforeAll(async () => {
  api = makeTestApi();
  admin = await api.createUser({ role: "admin" });
  adminKey = (await api.createApiKey(admin, ["admin"])).key;
  readKey = (await api.createApiKey(admin, ["read"])).key;
});
afterAll(() => api.dispose());

/** An operator client over the in-process handler, as `GMACKO_API_KEY` would configure it. */
const client = (apiKey?: string) =>
  createOperatorClient({
    baseUrl: api.baseUrl,
    apiKey,
    transport: (request) => api.handler(request),
  });

const TOOL_NAMES = [
  "auth_help",
  "get_workspace_context",
  "get_billing_overview",
  "list_api_keys",
  "create_api_key",
  "revoke_api_key",
  "list_posts",
  "get_post",
  "create_post",
  "delete_post",
  "get_preferences",
  "update_preferences",
];

describe("listOperatorTools", () => {
  it("keeps the tool set the CLI and MCP server expose", () => {
    expect(listOperatorTools().map((tool) => tool.name)).toEqual(TOOL_NAMES);
  });

  it("derives input schemas from the contract's payload schemas", () => {
    const tools = new Map(listOperatorTools().map((tool) => [tool.name, tool]));
    const createKey = tools.get("create_api_key")?.inputSchema;
    expect(createKey?.type).toBe("object");
    expect(createKey?.required).toEqual(["name", "permissions"]);
    expect(createKey?.properties).toMatchObject({
      name: { type: "string", minLength: 1, maxLength: 100 },
      permissions: {
        type: "array",
        items: { type: "string", enum: ["read", "write", "delete", "admin"] },
      },
      expiresInDays: { type: "integer" },
    });

    const preferences = tools.get("update_preferences")?.inputSchema;
    expect(Object.keys(preferences?.properties ?? {})).toEqual([
      "theme",
      "language",
      "timezone",
      "emailNotifications",
      "pushNotifications",
    ]);
    expect(preferences?.required).toEqual([]);
    expect(preferences?.properties).toMatchObject({
      theme: { enum: ["light", "dark", "system"] },
      emailNotifications: { type: "boolean" },
    });

    expect(tools.get("get_post")?.inputSchema).toMatchObject({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    });
    expect(tools.get("list_posts")?.inputSchema).toEqual({
      type: "object",
      properties: {},
      required: [],
    });
  });
});

describe("executeOperatorTool", () => {
  it("answers auth_help without a client and names the admin scope keys need", async () => {
    const help = await executeOperatorTool(undefined as never, "auth_help");
    expect(help).toContain("GMACKO_API_KEY");
    expect(help).toContain("admin");
    expect(help).not.toContain("tRPC");
  });

  it("rejects an unknown tool", async () => {
    await expect(executeOperatorTool(client(), "nope")).rejects.toThrow(
      "Unknown tool: nope",
    );
  });

  it("reads workspace context and billing with the key", async () => {
    await expect(
      executeOperatorTool(client(adminKey), "get_workspace_context"),
    ).resolves.toContain('"platformRole": "admin"');
    await expect(
      executeOperatorTool(client(adminKey), "get_billing_overview"),
    ).resolves.toContain('"visible"');
  });

  it("surfaces the contract's errors as messages: no key, wrong scope", async () => {
    await expect(
      executeOperatorTool(client(), "get_workspace_context"),
    ).rejects.toThrow("Authentication required");
    await expect(
      executeOperatorTool(client(readKey), "create_api_key", {
        name: "nope",
        permissions: "read",
      }),
    ).rejects.toThrow("Forbidden (scope)");
  });

  it("creates, lists and revokes API keys from CLI-style string arguments", async () => {
    const created = await executeOperatorTool(
      client(adminKey),
      "create_api_key",
      {
        name: "Automation",
        permissions: "read, write",
        expiresInDays: "30",
      },
    );
    const parsed = JSON.parse(created) as {
      id: string;
      key: string;
      permissions: ReadonlyArray<string>;
      expiresAt: string | null;
    };
    expect(parsed.key).toMatch(/^gmk_/);
    expect(parsed.permissions).toEqual(["read", "write"]);
    expect(parsed.expiresAt).toEqual(expect.any(String));

    await expect(
      executeOperatorTool(client(adminKey), "list_api_keys"),
    ).resolves.toContain('"name": "Automation"');

    await expect(
      executeOperatorTool(client(adminKey), "revoke_api_key", {
        id: parsed.id,
      }),
    ).resolves.toContain("revoked");
    await expect(
      executeOperatorTool(client(adminKey), "list_api_keys"),
    ).resolves.not.toContain('"name": "Automation"');
    await expect(
      executeOperatorTool(client(adminKey), "revoke_api_key", {
        id: parsed.id,
      }),
    ).resolves.toBe("API key not found");
  });

  it("rejects arguments the contract refuses, before any request", async () => {
    let calls = 0;
    const counting = createOperatorClient({
      baseUrl: api.baseUrl,
      apiKey: adminKey,
      transport: (request) => {
        calls += 1;
        return api.handler(request);
      },
    });
    await expect(
      executeOperatorTool(counting, "create_api_key", {
        name: "x",
        permissions: "bogus",
      }),
    ).rejects.toThrow(/Invalid arguments for create_api_key/);
    await expect(
      executeOperatorTool(counting, "create_post", { title: "no content" }),
    ).rejects.toThrow(/Invalid arguments for create_post/);
    expect(calls).toBe(0);
  });

  it("manages posts: create, list, get, delete, and the 404 as a message", async () => {
    const created = await executeOperatorTool(client(adminKey), "create_post", {
      title: "Hello",
      content: "World",
    });
    expect(created).toContain("Post created");
    const id = (
      JSON.parse(created.slice(created.indexOf("{"))) as { id: string }
    ).id;

    await expect(
      executeOperatorTool(client(), "list_posts"),
    ).resolves.toContain('"title": "Hello"');
    await expect(
      executeOperatorTool(client(), "get_post", { id }),
    ).resolves.toContain('"content": "World"');
    await expect(
      executeOperatorTool(client(adminKey), "delete_post", { id }),
    ).resolves.toBe("Post deleted successfully");
    await expect(
      executeOperatorTool(client(), "get_post", { id }),
    ).resolves.toBe("Post not found");
    await expect(
      executeOperatorTool(client(adminKey), "delete_post", { id }),
    ).resolves.toBe("Post not found");
  });

  it("reads and updates preferences, coercing booleans from the CLI", async () => {
    await expect(
      executeOperatorTool(client(adminKey), "get_preferences"),
    ).resolves.toContain('"theme": "system"');
    const updated = await executeOperatorTool(
      client(adminKey),
      "update_preferences",
      { theme: "dark", emailNotifications: "false" },
    );
    expect(updated).toContain('"theme": "dark"');
    expect(updated).toContain('"emailNotifications": false');
    await expect(
      executeOperatorTool(client(adminKey), "get_preferences"),
    ).resolves.toContain('"theme": "dark"');
  });
});
