import { createHash, randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

import { alice, signInAsAdmin } from "./helpers/auth";
import { reset } from "./helpers/db";
import { BASE_URL } from "./helpers/env";
import { gotoReady } from "./helpers/nav";

/** Where the "MCP client" listens; the browser's request to it is intercepted. */
const REDIRECT_URI = "http://127.0.0.1:47123/callback";

/** What the intercepted callback carried; a holder, so the route handler's assignment is not narrowed away. */
interface CallbackSeen {
  callback: URL | null;
}

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
};

const authorizeUrl = (clientId: string, challenge: string) =>
  `/api/auth/oauth2/authorize?${new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: "workspace:read profile:read posts:write offline_access",
    state: "e2e",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: `${BASE_URL}/mcp`,
  })}`;

test.describe("Remote MCP over OAuth", () => {
  test.beforeAll(() => {
    reset();
  });

  test("a client connects through workspace pick and consent, calls /mcp, and is disconnected from Settings", async ({
    page,
  }) => {
    await signInAsAdmin(page, alice);

    // The client discovers the flow from /mcp's challenge.
    const challenged = await page.request.post("/mcp", {
      headers: { cookie: "" },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(challenged.status()).toBe(401);
    expect(challenged.headers()["www-authenticate"]).toContain(
      "/.well-known/oauth-protected-resource/mcp",
    );
    const metadata = await page.request.get(
      "/.well-known/oauth-protected-resource/mcp",
    );
    expect(await metadata.json()).toMatchObject({
      resource: `${BASE_URL}/mcp`,
    });

    const registered = await page.request.post("/api/auth/oauth2/register", {
      headers: { cookie: "" },
      data: {
        client_name: "E2E MCP client",
        redirect_uris: [REDIRECT_URI],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
    });
    expect(registered.status()).toBe(201);
    const { client_id: clientId }: { client_id: string } =
      await registered.json();

    const seen: CallbackSeen = { callback: null };
    await page.route("http://127.0.0.1:47123/**", async (route) => {
      seen.callback = new URL(route.request().url());
      await route.fulfill({ status: 200, body: "connected" });
    });

    const { verifier, challenge } = pkce();
    await page.goto(authorizeUrl(clientId, challenge));

    await expect(page).toHaveURL(/\/oauth\/workspace\?/);
    const picker = page.getByTestId("oauth-workspace-picker");
    await expect(picker).toContainText("E2E MCP client");
    // The bootstrap workspace is the only one, so it is already picked.
    await picker.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(/\/oauth\/consent\?/);
    const consent = page.getByTestId("oauth-consent");
    await expect(consent).toContainText("Connect E2E MCP client");
    await expect(consent).toContainText("is not verified");
    // Reads are pre-ticked; the write is opt-in and stays off here.
    await expect(
      consent.getByRole("checkbox", { name: "Create posts" }),
    ).not.toBeChecked();
    await consent.getByRole("button", { name: "Allow" }).click();

    await expect
      .poll(() => seen.callback?.searchParams.get("code"))
      .toBeTruthy();
    expect(seen.callback?.searchParams.get("state")).toBe("e2e");

    const tokenResponse = await page.request.post("/api/auth/oauth2/token", {
      headers: { cookie: "" },
      form: {
        grant_type: "authorization_code",
        code: seen.callback?.searchParams.get("code") ?? "",
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier,
        resource: `${BASE_URL}/mcp`,
      },
    });
    expect(tokenResponse.status()).toBe(200);
    const { access_token: token }: { access_token: string } =
      await tokenResponse.json();

    const mcp = (method: string, params: Record<string, string> = {}) =>
      page.request.post("/mcp", {
        headers: {
          cookie: "",
          authorization: `Bearer ${token}`,
          accept: "application/json, text/event-stream",
        },
        data: { jsonrpc: "2.0", id: 1, method, params },
      });

    const listed: { result: { tools: Array<{ name: string }> } } = await (
      await mcp("tools/list")
    ).json();
    const names = listed.result.tools.map((tool) => tool.name);
    expect(names).toContain("get_workspace_context");
    // posts:write was not granted.
    expect(names).not.toContain("create_post");

    const called: { result: { content: Array<{ text: string }> } } = await (
      await mcp("tools/call", { name: "get_workspace_context" })
    ).json();
    expect(called.result.content[0]?.text).toContain(
      '"workspaceRole": "owner"',
    );

    await gotoReady(page, "/settings");
    const apps = page.getByTestId("connected-apps");
    await expect(apps.getByTestId("connected-app-row")).toContainText(
      "E2E MCP client",
    );
    page.once("dialog", (dialog) => void dialog.accept());
    await apps.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByText("App disconnected.")).toBeVisible();
    await expect(apps.getByText("No apps connected yet.")).toBeVisible();

    expect((await mcp("tools/list")).status()).toBe(401);
  });

  test("an anonymous visitor is sent to sign in first", async ({ browser }) => {
    const anonymous = await browser.newContext();
    const page = await anonymous.newPage();
    const registered = await page.request.post("/api/auth/oauth2/register", {
      data: {
        client_name: "E2E anonymous client",
        redirect_uris: [REDIRECT_URI],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
      },
    });
    const { client_id: clientId }: { client_id: string } =
      await registered.json();
    await page.goto(authorizeUrl(clientId, pkce().challenge));
    await expect(page).toHaveURL(/\/oauth\/sign-in\?/);
    await expect(
      page.getByRole("heading", { name: "Sign in to connect" }),
    ).toBeVisible();
    await anonymous.close();
  });
});
