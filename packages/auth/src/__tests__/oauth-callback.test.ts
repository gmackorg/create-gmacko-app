/**
 * The generic-provider OAuth round trip for GitHub, end to end and in
 * process: `/sign-in/social` mints the state (+ signed state cookie), the
 * provider "redirects back" to `/callback/github`, better-auth exchanges the
 * code at the token endpoint, reads the profile through `githubUserInfo`,
 * creates user + account and sets the session cookie.
 *
 * The provider is a Node `http` server on an ephemeral port standing in for
 * both github.com (token endpoint) and api.github.com (user info), exactly
 * the way emulate does locally.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Database } from "@gmacko/db";
import { account, user } from "@gmacko/db/schema";
import { layerTest } from "@gmacko/db/testing";
import { eq } from "drizzle-orm";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Auth } from "../service";

const baseUrl = "http://localhost:3000";
const accessToken = "gh-access-token";
const profile = {
  id: 424242,
  login: "octo-dev",
  name: "Octo Dev",
  // Hidden on the profile so the `/user/emails` fallback is exercised.
  email: null,
  avatar_url: "https://avatars.example.com/u/424242",
};
const primaryEmail = `octo-${crypto.randomUUID()}@example.com`;

interface SeenRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

const seen: SeenRequest[] = [];

const fakeGithub = (): Server =>
  createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      const path = new URL(req.url ?? "/", "http://fake").pathname;
      seen.push({ method: req.method ?? "", path, headers: req.headers, body });
      const json = (status: number, value: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(value));
      };
      if (req.method === "POST" && path === "/login/oauth/access_token") {
        const form = new URLSearchParams(body);
        if (form.get("code") !== "fake-authorization-code") {
          return json(400, { error: "bad_verification_code" });
        }
        return json(200, {
          access_token: accessToken,
          token_type: "bearer",
          scope: "read:user,user:email",
        });
      }
      const bearer = req.headers.authorization;
      if (bearer !== `Bearer ${accessToken}`) {
        return json(401, { message: "Bad credentials" });
      }
      if (path === "/user") return json(200, profile);
      if (path === "/user/emails") {
        return json(200, [
          { email: "secondary@example.com", primary: false, verified: true },
          { email: primaryEmail, primary: true, verified: true },
        ]);
      }
      return json(404, { message: "Not Found" });
    });
  });

const cookieHeader = (response: Response, name: string): string => {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${name}=`));
  if (!cookie) {
    throw new Error(
      `no ${name} cookie in: ${response.headers.getSetCookie().join(" | ")}`,
    );
  }
  return cookie.split(";")[0] ?? "";
};

describe("GitHub OAuth callback (generic provider, sqlite-node)", () => {
  const server = fakeGithub();
  let runtime: ManagedRuntime.ManagedRuntime<Auth | Database, never>;

  beforeAll(async () => {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    const { port } = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${port}`;
    const AuthTest = Auth.layer({
      baseUrl,
      productionUrl: baseUrl,
      secret: "test-secret-that-is-long-enough-for-better-auth",
      allowedOrigins: [baseUrl],
      github: {
        clientId: "gh-client",
        clientSecret: "gh-secret",
        url: origin,
        apiUrl: origin,
      },
      google: { clientId: "google-client", clientSecret: "google-secret" },
      magicLink: { send: async () => {} },
    });
    runtime = ManagedRuntime.make(Layer.provideMerge(AuthTest, layerTest));
  });

  afterAll(async () => {
    await runtime.dispose();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("exchanges the code, creates user + account (with issuer) and sets the session cookie", async () => {
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const auth = yield* Auth;
        const { db } = yield* Database;

        // 1. The app asks for the provider URL; better-auth stores the state
        //    in `verification` and signs it into a cookie.
        const started = yield* auth.handler(
          new Request(`${baseUrl}/api/auth/sign-in/social`, {
            method: "POST",
            headers: { "content-type": "application/json", origin: baseUrl },
            body: JSON.stringify({
              provider: "github",
              callbackURL: "/welcome",
            }),
          }),
        );
        const { url } = (yield* Effect.promise(() => started.json())) as {
          url: string;
        };
        const state = new URL(url).searchParams.get("state");
        if (!state) throw new Error(`no state in ${url}`);
        const stateCookie = cookieHeader(started, "better-auth.state");

        // 2. The provider redirects the browser back with a code; the browser
        //    carries the state cookie.
        const callback = yield* auth.handler(
          new Request(
            `${baseUrl}/api/auth/callback/github?code=fake-authorization-code&state=${encodeURIComponent(state)}`,
            { headers: { cookie: stateCookie }, redirect: "manual" },
          ),
        );
        const sessionCookie = cookieHeader(
          callback,
          "better-auth.session_token",
        );

        // 3. The session cookie identifies the new user.
        const current = yield* auth.currentUser(
          new Headers({ cookie: sessionCookie }),
        );
        const accounts = yield* db
          .select()
          .from(account)
          .where(eq(account.providerId, "github"));
        const users = yield* db
          .select()
          .from(user)
          .where(eq(user.email, primaryEmail));

        return {
          startedStatus: started.status,
          callbackStatus: callback.status,
          location: callback.headers.get("location"),
          current,
          accounts,
          users,
        };
      }),
    );

    expect(result.startedStatus).toBe(200);
    expect(result.callbackStatus).toBe(302);
    // The callbackURL is echoed as given (relative here); no error= query.
    expect(result.location).toBe("/welcome");

    expect(result.current?.email).toBe(primaryEmail);
    expect(result.current?.name).toBe("Octo Dev");
    expect(result.users).toHaveLength(1);
    expect(result.users[0]?.emailVerified).toBe(true);
    expect(result.users[0]?.image).toBe(profile.avatar_url);

    // better-auth 1.7 keys the account on (issuer, accountId); a generic
    // provider without a discovery document gets the local namespace.
    expect(result.accounts).toHaveLength(1);
    const linked = result.accounts[0];
    expect(linked?.userId).toBe(result.users[0]?.id);
    expect(linked?.issuer).toBe("local:oauth:github");
    expect(linked?.accountId).toBe(String(profile.id));
    expect(linked?.accessToken).toBe(accessToken);
    expect(linked?.scope).toContain("read:user");

    // The provider saw a token exchange and the two profile reads, in order,
    // each with the bearer the exchange handed out.
    const paths = seen.map((request) => `${request.method} ${request.path}`);
    expect(paths).toEqual([
      "POST /login/oauth/access_token",
      "GET /user",
      "GET /user/emails",
    ]);
    const exchange = new URLSearchParams(seen[0]?.body);
    expect(exchange.get("grant_type")).toBe("authorization_code");
    expect(exchange.get("redirect_uri")).toBe(
      `${baseUrl}/api/auth/callback/github`,
    );
    // No PKCE for GitHub (see `pkce: false`).
    expect(exchange.has("code_verifier")).toBe(false);
    for (const request of seen.slice(1)) {
      expect(request.headers.authorization).toBe(`Bearer ${accessToken}`);
      expect(request.headers["user-agent"]).toBe("gmacko-auth");
    }
  });

  it("rejects a callback whose state cookie is missing", async () => {
    const before = seen.length;
    const response = await runtime.runPromise(
      Effect.flatMap(Auth, (auth) =>
        auth.handler(
          new Request(
            `${baseUrl}/api/auth/callback/github?code=fake-authorization-code&state=forged`,
            { redirect: "manual" },
          ),
        ),
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("error=state_mismatch");
    expect(response.headers.getSetCookie().join("")).not.toContain(
      "session_token=",
    );
    // Never reached the provider.
    expect(seen.length).toBe(before);
  });
});
