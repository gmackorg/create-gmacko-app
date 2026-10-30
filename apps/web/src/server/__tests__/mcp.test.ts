/**
 * `/mcp` end to end in Node: the real API handler and `OAuthTokens` behind
 * the handler, an access token pinned to a workspace that is *not* the
 * user's default. Proves the challenge, the scope-filtered tool list, that a
 * tool call reaches the API with the pinned workspace, that a tool outside
 * the grant is refused, and that the token is no credential for the API on
 * its own.
 */

import { makeTestApi, type TestApi } from "@gmacko/api/testing";
import { sha256Hex } from "@gmacko/auth/api-keys";
import {
  mcpResource,
  OAUTH_ACCESS_TOKEN_PREFIX,
} from "@gmacko/auth/oauth-provider";
import { OAuthResource, OAuthTokens } from "@gmacko/auth/oauth-tokens";
import { Database } from "@gmacko/db";
import { oauthAccessToken, oauthClient } from "@gmacko/db/schema";
import { Context, Effect, type Schema } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mcpRequestHandler } from "../mcp";

let api: TestApi;
let handler: (request: Request) => Promise<Response>;
let resource: string;

beforeAll(() => {
  api = makeTestApi();
  resource = mcpResource(api.baseUrl);
  handler = mcpRequestHandler({
    resource,
    issuer: `${api.baseUrl}/api/auth`,
    baseUrl: api.baseUrl,
    verify: (bearer) =>
      api.run(
        Effect.flatMap(OAuthTokens, (tokens) =>
          tokens.authenticate(bearer, resource),
        ).pipe(
          Effect.provide(OAuthTokens.layer),
          Effect.catchTag("Unauthorized", () => Effect.succeed(null)),
        ),
      ),
    dispatch: (request) =>
      api.handler(request, Context.make(OAuthResource, { resource })),
  });
});
afterAll(() => api.dispose());

/** A user whose default workspace is "Default"; the token is pinned to "Pinned". */
const seedToken = async (scopes: ReadonlyArray<string>) => {
  const person = await api.createUser();
  const other = await api.createUser();
  const home = await api.createWorkspace({ owner: person, name: "Default" });
  const pinned = await api.createWorkspace({
    owner: other,
    name: "Pinned",
    members: [{ user: person, role: "member" }],
  });
  // The default is the earliest membership: make "Default" clearly older.
  await api.run(
    Effect.flatMap(
      Database,
      ({ sql }) =>
        sql`update workspace_membership set created_at = ${Date.UTC(2026, 0, 1)} where workspace_id = ${home.id}`,
    ),
  );
  const clientId = `client-${crypto.randomUUID()}`;
  const raw = crypto.randomUUID().replaceAll("-", "");
  const hash = await sha256Hex(raw);
  await api.run(
    Effect.flatMap(Database, ({ db }) =>
      Effect.andThen(
        db.insert(oauthClient).values({
          id: crypto.randomUUID(),
          clientId,
          redirectUris: JSON.stringify(["http://127.0.0.1:1/cb"]),
        }),
        db.insert(oauthAccessToken).values({
          id: crypto.randomUUID(),
          token: hash,
          clientId,
          userId: person.id,
          referenceId: pinned.id,
          resources: JSON.stringify([resource]),
          scopes: JSON.stringify(scopes),
          expiresAt: new Date(Date.now() + 3_600_000),
          createdAt: new Date(),
        }),
      ),
    ),
  );
  return { bearer: `${OAUTH_ACCESS_TOKEN_PREFIX}${raw}`, pinned, home };
};

const rpc = (
  bearer: string | null,
  method: string,
  params: Readonly<Record<string, Schema.Json>> = {},
) => {
  const headers = new Headers({
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  });
  if (bearer !== null) headers.set("authorization", `Bearer ${bearer}`);
  return handler(
    new Request(`${api.baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
};

interface ToolResult {
  readonly result: {
    readonly content: ReadonlyArray<{ readonly text: string }>;
    readonly isError?: boolean;
  };
}

describe("/mcp", () => {
  it("challenges with the resource metadata URL, and invalid_token for a bad token", async () => {
    const anonymous = await rpc(null, "tools/list");
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${api.baseUrl}/.well-known/oauth-protected-resource/mcp"`,
    );
    const bad = await rpc(`${OAUTH_ACCESS_TOKEN_PREFIX}nope`, "tools/list");
    expect(bad.status).toBe(401);
    expect(bad.headers.get("www-authenticate")).toContain(
      'error="invalid_token"',
    );
  });

  it("lists only the tools the grant can call", async () => {
    const { bearer } = await seedToken(["workspace:read", "posts:write"]);
    const response = await rpc(bearer, "tools/list");
    expect(response.status).toBe(200);
    const body: { result: { tools: Array<{ name: string }> } } =
      await response.json();
    expect(body.result.tools.map((tool) => tool.name)).toEqual([
      "auth_help",
      "get_workspace_context",
      "list_posts",
      "get_post",
      "create_post",
    ]);
  });

  it("runs a tool against the API, in the pinned workspace", async () => {
    const { bearer } = await seedToken(["workspace:read"]);
    const response = await rpc(bearer, "tools/call", {
      name: "get_workspace_context",
    });
    const body: ToolResult = await response.json();
    expect(body.result.isError).toBeUndefined();
    expect(body.result.content[0]?.text).toContain('"name": "Pinned"');
    expect(body.result.content[0]?.text).not.toContain('"name": "Default"');
  });

  it("refuses a tool outside the grant without calling the API", async () => {
    const { bearer } = await seedToken(["workspace:read"]);
    const response = await rpc(bearer, "tools/call", {
      name: "delete_post",
      arguments: { id: "p1" },
    });
    const body: ToolResult = await response.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]?.text).toContain("posts:delete");
  });

  it("is not a credential for the API called directly", async () => {
    const { bearer } = await seedToken(["workspace:read"]);
    const direct = await api.fetch("/api/workspace", {
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(direct.status).toBe(401);
  });
});
