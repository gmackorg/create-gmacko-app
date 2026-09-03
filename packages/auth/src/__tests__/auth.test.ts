/**
 * better-auth 1.7.2 on the drizzle sqlite adapter, driven through the same
 * `Database.layerTest` the data layer uses, so the whole magic-link round trip
 * (request link → verify → session cookie → get-session) runs in-process with
 * no network and no D1.
 */
import { Database } from "@gmacko/db";
import { user } from "@gmacko/db/schema";
import { layerTest } from "@gmacko/db/testing";
import { eq } from "drizzle-orm";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Auth } from "../service";

const baseUrl = "http://localhost:3001";
const magicLinks: Array<{ email: string; url: string }> = [];

const AuthTest = Auth.layer({
  baseUrl,
  productionUrl: baseUrl,
  secret: "test-secret-that-is-long-enough-for-better-auth",
  allowedOrigins: [baseUrl],
  github: {
    clientId: "gh-client",
    clientSecret: "gh-secret",
    url: "http://github.test",
    apiUrl: "http://api.github.test",
  },
  google: { clientId: "google-client", clientSecret: "google-secret" },
  magicLink: {
    send: async (link) => {
      magicLinks.push(link);
    },
  },
}).pipe(Layer.provide(layerTest));

const jsonHeaders = {
  "content-type": "application/json",
  origin: baseUrl,
};

const sessionCookieOf = (response: Response): string => {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = /(?:^|,\s*)([^=;,\s]*session_token)=([^;]+)/.exec(setCookie);
  if (!match) throw new Error(`no session cookie in: ${setCookie}`);
  return `${match[1]}=${match[2]}`;
};

describe("Auth service (sqlite-node)", () => {
  let runtime: ManagedRuntime.ManagedRuntime<Auth | Database, never>;
  const run = <A, E>(effect: Effect.Effect<A, E, Auth | Database>) =>
    runtime.runPromise(effect);

  beforeAll(() => {
    runtime = ManagedRuntime.make(Layer.provideMerge(AuthTest, layerTest));
  });
  afterAll(() => runtime.dispose());

  it("signs in through a magic link and reads the session back", async () => {
    const email = `magic-${crypto.randomUUID()}@example.com`;
    const result = await run(
      Effect.gen(function* () {
        const auth = yield* Auth;
        const { db } = yield* Database;

        const requested = yield* auth.handler(
          new Request(`${baseUrl}/api/auth/sign-in/magic-link`, {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({ email, callbackURL: "/welcome" }),
          }),
        );
        const link = magicLinks.find((l) => l.email === email);
        if (!link) throw new Error("magic link was not sent");

        const verified = yield* auth.handler(
          new Request(link.url, { redirect: "manual" }),
        );
        const cookie = sessionCookieOf(verified);

        const session = yield* auth.handler(
          new Request(`${baseUrl}/api/auth/get-session`, {
            headers: { cookie },
          }),
        );
        const current = yield* auth.currentUser(new Headers({ cookie }));
        const anonymous = yield* auth.currentUser(new Headers());
        const stored = yield* db
          .select()
          .from(user)
          .where(eq(user.email, email));

        return {
          requestedStatus: requested.status,
          verifiedStatus: verified.status,
          location: verified.headers.get("location"),
          cookie,
          session: (yield* Effect.promise(() => session.json())) as {
            user: { email: string };
          },
          current,
          anonymous,
          stored,
        };
      }),
    );

    expect(result.requestedStatus).toBe(200);
    expect(result.verifiedStatus).toBe(302);
    expect(result.location).toBe(`${baseUrl}/welcome`);
    // http baseURL → no `__Secure-` prefix, default `better-auth` cookie prefix.
    expect(result.cookie.startsWith("better-auth.session_token=")).toBe(true);
    expect(result.session.user.email).toBe(email);
    expect(result.current?.email).toBe(email);
    expect(result.anonymous).toBeNull();
    // The custom `role` column survives the sqlite adapter's insert.
    expect(result.stored).toHaveLength(1);
    expect(result.stored[0]?.role).toBe("user");
  });

  it("registers github as a generic OAuth provider with the configured URLs", async () => {
    const response = await run(
      Effect.flatMap(Auth, (auth) =>
        auth.handler(
          new Request(`${baseUrl}/api/auth/sign-in/social`, {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({ provider: "github", callbackURL: "/" }),
          }),
        ),
      ),
    );
    const body = (await response.json()) as { url?: string };
    expect(response.status).toBe(200);
    expect(
      body.url?.startsWith("http://github.test/login/oauth/authorize"),
    ).toBe(true);
    const url = new URL(body.url ?? "");
    expect(url.searchParams.get("client_id")).toBe("gh-client");
    expect(url.searchParams.get("redirect_uri")).toBe(
      `${baseUrl}/api/auth/callback/github`,
    );
  });
});
