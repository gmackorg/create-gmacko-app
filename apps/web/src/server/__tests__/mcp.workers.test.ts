/**
 * The `/mcp` handler on workerd: the MCP SDK's server and its Web-standard
 * Streamable HTTP transport load and answer under Workers (no Node APIs,
 * no `new Function`). Token checks and API dispatch are stubbed; the Node
 * suite (mcp.test.ts) runs them for real.
 */
import { User, UserId, WorkspaceId } from "@gmacko/domain";
import type { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { mcpRequestHandler } from "../mcp";

const handler = mcpRequestHandler({
  resource: "https://app.example/mcp",
  issuer: "https://app.example/api/auth",
  baseUrl: "https://app.example",
  verify: async (bearer) =>
    bearer === "gmo_good"
      ? {
          user: new User({
            id: UserId.make("u1"),
            name: "Ada",
            email: "ada@example.com",
            emailVerified: true,
            image: null,
            role: "user",
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
          clientId: "c1",
          scopes: ["profile:read"],
          workspaceId: WorkspaceId.make("w1"),
          role: "owner",
        }
      : null,
  dispatch: async () => new Response("no API in this suite", { status: 500 }),
});

const rpc = (
  method: string,
  params: Readonly<Record<string, Schema.Json>> = {},
  id = 1,
) =>
  handler(
    new Request("https://app.example/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer gmo_good",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }),
  );

describe("/mcp on workerd", () => {
  it("challenges a request without a token", async () => {
    const response = await handler(
      new Request("https://app.example/mcp", { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://app.example/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("initializes, lists tools and runs a public one", async () => {
    const init = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    expect(init.status).toBe(200);
    expect(await init.json()).toMatchObject({
      result: { serverInfo: { name: "gmacko-app" } },
    });

    const list = await rpc("tools/list", {}, 2);
    expect(list.status).toBe(200);
    const listed: { result: { tools: Array<{ name: string }> } } =
      await list.json();
    expect(listed.result.tools.map((tool) => tool.name)).toContain("auth_help");

    const call = await rpc("tools/call", { name: "auth_help" }, 3);
    const called: { result: { content: Array<{ text: string }> } } =
      await call.json();
    expect(called.result.content[0]?.text).toContain("GMACKO_API_KEY");
  });
});
