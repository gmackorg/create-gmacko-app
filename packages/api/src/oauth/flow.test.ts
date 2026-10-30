/**
 * The authorization-code flow an MCP client runs, end to end through
 * better-auth's real handler: dynamic registration, authorize (PKCE +
 * `resource=<app>/mcp`), the workspace pick, consent to a subset of the
 * requested scopes, and the code exchange. The token row it ends with is
 * what the `/mcp` endpoint verifies: pinned to the picked workspace, holding
 * only the consented scopes, bound to the MCP resource.
 */

import { sha256Hex } from "@gmacko/auth/api-keys";
import {
  mcpResource,
  OAUTH_ACCESS_TOKEN_PREFIX,
} from "@gmacko/auth/oauth-provider";
import { Auth } from "@gmacko/auth/service";
import { Database } from "@gmacko/db";
import { oauthAccessToken } from "@gmacko/db/schema";
import { SelectOAuthWorkspace, WorkspaceId } from "@gmacko/domain";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeTestApi, type TestApi, type TestUser } from "../testing";

let api: TestApi;
beforeAll(() => {
  api = makeTestApi();
});
afterAll(() => api.dispose());

const REDIRECT_URI = "http://127.0.0.1:33418/callback";

/** One request through better-auth's handler (everything under /api/auth). */
const authFetch = (path: string, init?: RequestInit) =>
  api.run(
    Effect.flatMap(Auth, (auth) =>
      auth.handler(new Request(new URL(path, api.baseUrl), init)),
    ),
  );

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

const pkce = async () => {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
};

const register = async () => {
  const response = await authFetch("/api/auth/oauth2/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Test MCP client",
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(response.status, await response.clone().text()).toBe(201);
  const body: { client_id: string } = await response.json();
  return body.client_id;
};

/** The JSON a browser fetch of a redirecting OAuth endpoint gets back. */
const redirectOf = async (response: Response): Promise<URL> => {
  const location = response.headers.get("location");
  if (location !== null) return new URL(location, api.baseUrl);
  const body: { url?: string } = await response.json();
  if (body.url === undefined) {
    throw new Error(`no redirect: ${response.status} ${JSON.stringify(body)}`);
  }
  return new URL(body.url, api.baseUrl);
};

const browser = (person: TestUser) => ({
  cookie: person.cookie,
  origin: api.baseUrl,
  "content-type": "application/json",
});

const authorize = async (
  person: TestUser,
  clientId: string,
  challenge: string,
  scope: string,
) =>
  redirectOf(
    await authFetch(
      `/api/auth/oauth2/authorize?${new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        scope,
        state: "state-123",
        code_challenge: challenge,
        code_challenge_method: "S256",
        resource: mcpResource(api.baseUrl),
      })}`,
      { headers: { cookie: person.cookie } },
    ),
  );

describe("OAuth authorization-code flow for /mcp", () => {
  it("pins the token to the picked workspace and the consented scopes", async () => {
    const person = await api.createUser();
    await api.createWorkspace({ owner: person, name: "First" });
    const picked = await api.createWorkspace({ owner: person, name: "Picked" });
    const clientId = await register();
    const { verifier, challenge } = await pkce();

    // Signed in, so authorize goes straight to the workspace picker.
    const toPicker = await authorize(
      person,
      clientId,
      challenge,
      "posts:write profile:read billing:read offline_access",
    );
    expect(toPicker.pathname, toPicker.href).toBe("/oauth/workspace");

    await api.call(
      (c) =>
        c.oauth.selectWorkspace({
          payload: new SelectOAuthWorkspace({
            workspaceId: WorkspaceId.make(picked.id),
          }),
        }),
      { cookie: person.cookie },
    );
    const toConsent = await redirectOf(
      await authFetch("/api/auth/oauth2/continue", {
        method: "POST",
        headers: browser(person),
        body: JSON.stringify({
          postLogin: true,
          oauth_query: toPicker.search.slice(1),
        }),
      }),
    );
    expect(toConsent.pathname).toBe("/oauth/consent");
    expect(toConsent.searchParams.get("scope")).toBe(
      "posts:write profile:read billing:read offline_access",
    );

    // The user unticks posts:write.
    const toClient = await redirectOf(
      await authFetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: browser(person),
        body: JSON.stringify({
          accept: true,
          scope: "profile:read billing:read offline_access",
          oauth_query: toConsent.search.slice(1),
        }),
      }),
    );
    expect(`${toClient.origin}${toClient.pathname}`).toBe(REDIRECT_URI);
    expect(toClient.searchParams.get("state")).toBe("state-123");
    const code = toClient.searchParams.get("code");
    expect(code).toEqual(expect.any(String));

    const tokenResponse = await authFetch("/api/auth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code ?? "",
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier,
        resource: mcpResource(api.baseUrl),
      }),
    });
    expect(tokenResponse.status, await tokenResponse.clone().text()).toBe(200);
    const tokens: {
      access_token: string;
      refresh_token?: string;
      scope: string;
    } = await tokenResponse.json();
    expect(tokens.access_token.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)).toBe(
      true,
    );
    expect(tokens.refresh_token).toEqual(expect.any(String));
    expect(tokens.scope.split(" ").sort()).toEqual([
      "billing:read",
      "offline_access",
      "profile:read",
    ]);

    // Stored as sha256 hex of the token without its prefix, like a key.
    const hash = await sha256Hex(
      tokens.access_token.slice(OAUTH_ACCESS_TOKEN_PREFIX.length),
    );
    const [row] = await api.run(
      Effect.flatMap(Database, ({ db }) =>
        db
          .select()
          .from(oauthAccessToken)
          .where(eq(oauthAccessToken.token, hash)),
      ),
    );
    expect(row?.referenceId).toBe(picked.id);
    // JSON text, encoded once (auth-schema.ts header).
    expect(JSON.parse(row?.resources ?? "null")).toEqual([
      mcpResource(api.baseUrl),
    ]);
    expect(JSON.parse(row?.scopes ?? "[]").sort()).toEqual([
      "billing:read",
      "offline_access",
      "profile:read",
    ]);
  });

  it("refuses a key-only scope at authorize", async () => {
    const person = await api.createUser();
    await api.createWorkspace({ owner: person });
    const clientId = await register();
    const { challenge } = await pkce();
    const refused = await authorize(
      person,
      clientId,
      challenge,
      "api_keys:manage",
    );
    expect(`${refused.origin}${refused.pathname}`).toBe(REDIRECT_URI);
    expect(refused.searchParams.get("error")).toBe("invalid_scope");
    expect(refused.searchParams.get("code")).toBeNull();
  });

  it("asks for the workspace again on every fresh authorization", async () => {
    const person = await api.createUser();
    const only = await api.createWorkspace({ owner: person });
    await api.call(
      (c) =>
        c.oauth.selectWorkspace({
          payload: new SelectOAuthWorkspace({
            workspaceId: WorkspaceId.make(only.id),
          }),
        }),
      { cookie: person.cookie },
    );
    const clientId = await register();
    const { challenge } = await pkce();
    const next = await authorize(person, clientId, challenge, "profile:read");
    expect(next.pathname).toBe("/oauth/workspace");
  });
});
