/**
 * The SSR path: an `HttpApiClient` whose transport calls the in-process API
 * handler directly, forwarding the incoming request's cookie and carrying
 * the render's `RequestContext`, so a loader can read the session without a
 * network hop and six calls cost one session read. Runs over the
 * sqlite-node layers.
 */
import { RequestContext } from "@gmacko/auth/request-context";
import { Auth } from "@gmacko/auth/service";
import {
  countingDatabase,
  makeStatementLog,
  signInWithMagicLink,
} from "@gmacko/auth/testing";
import type { Database } from "@gmacko/db";
import { layerTest } from "@gmacko/db/testing";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FORWARDED_HEADERS, localTransport } from "~/lib/local-transport";
import { AppConfig, GmackoApi, makeApiHandler } from "~/server/api";
import { AuthSecurityConfigLive, makeAuthOptions } from "~/server/auth";
import { Background } from "~/server/background";

const baseUrl = "http://localhost:3001";
const magicLinks: Array<{ email: string; url: string; token: string }> = [];
const log = makeStatementLog();

const config = AppConfig.fromBindings({
  STAGE: "development",
  AUTH_SECRET: "test-secret-that-is-long-enough-for-better-auth",
  PORTLESS_URL: baseUrl,
});
const AppConfigTest = Layer.succeed(AppConfig)(config);
const DatabaseTest = countingDatabase(log).pipe(Layer.provide(layerTest));
const AuthTest = Auth.layer(
  makeAuthOptions(config, {
    magicLink: {
      send: async (link) => {
        magicLinks.push(link);
      },
    },
  }),
).pipe(Layer.provide(DatabaseTest));
const BackgroundTest = Background.layer((promise) => {
  void promise;
});
const Services = Layer.mergeAll(
  AppConfigTest,
  DatabaseTest,
  AuthTest,
  BackgroundTest,
  AuthSecurityConfigLive.pipe(Layer.provide(AppConfigTest)),
);

describe("localTransport", () => {
  let runtime: ManagedRuntime.ManagedRuntime<Auth | Database, never>;
  let calls = 0;
  let apiHandler: (
    request: Request,
    context?: Context.Context<never>,
  ) => Promise<Response>;
  let dispose: () => Promise<void>;

  beforeAll(() => {
    runtime = ManagedRuntime.make(Services);
    const api = makeApiHandler(Services, { memoMap: runtime.memoMap });
    apiHandler = (request, context) => {
      calls += 1;
      return api.handler(request, context);
    };
    dispose = api.dispose;
  });
  afterAll(async () => {
    await dispose();
    await runtime.dispose();
  });

  const signIn = (email: string) =>
    runtime.runPromise(
      Effect.flatMap(Auth, (auth) =>
        signInWithMagicLink(auth, baseUrl, magicLinks, email),
      ),
    );

  const client = (incoming: Headers, context?: Context.Context<never>) =>
    HttpApiClient.make(GmackoApi, { baseUrl: "http://localhost" }).pipe(
      Effect.provideService(
        HttpClient.HttpClient,
        localTransport(apiHandler, incoming, context),
      ),
    );

  it("serves the health probe in-process, without a network hop", async () => {
    const before = calls;
    const ready = await Effect.runPromise(
      Effect.flatMap(client(new Headers()), (api) => api.health.ready()),
    );
    expect(ready.status).toBe("ok");
    expect(typeof ready.latencyMs).toBe("number");
    expect(calls).toBe(before + 1);
  });

  it("forwards the incoming cookie so the loader sees the session", async () => {
    const { email, cookie } = await signIn(
      `ssr-${crypto.randomUUID()}@example.com`,
    );

    const me = await Effect.runPromise(
      Effect.flatMap(client(new Headers({ cookie })), (api) =>
        api.session.me(),
      ),
    );
    expect(me.user.email).toBe(email);
    expect(me.user.role).toBe("user");

    // `me` takes the Session middleware now: anonymous is 401, not a null user.
    const anonymous = await Effect.runPromise(
      Effect.flatMap(client(new Headers()), (api) => api.session.me()).pipe(
        Effect.result,
      ),
    );
    expect(anonymous._tag).toBe("Failure");
    if (anonymous._tag === "Failure") {
      expect(anonymous.failure).toMatchObject({ _tag: "Unauthorized" });
    }
  });

  it("forwards only the cookie: authorization never crosses into the API", async () => {
    expect(FORWARDED_HEADERS).toEqual(["cookie"]);

    let seen: Headers | undefined;
    const capturing = async (request: Request): Promise<Response> => {
      seen = new Headers(request.headers);
      return Response.json({ status: "ok", stage: "development" });
    };
    const incoming = new Headers({
      cookie: "better-auth.session_token=abc",
      authorization: "Bearer gmk_should_not_leak",
      "x-forwarded-for": "203.0.113.9",
    });

    const live = await Effect.runPromise(
      HttpApiClient.make(GmackoApi, { baseUrl: "http://localhost" }).pipe(
        Effect.provideService(
          HttpClient.HttpClient,
          localTransport(capturing, incoming),
        ),
        Effect.flatMap((api) => api.health.live()),
      ),
    );
    expect(live.status).toBe("ok");
    expect(seen).toBeDefined();
    expect(seen?.get("cookie")).toBe("better-auth.session_token=abc");
    expect(seen?.has("authorization")).toBe(false);
    expect(seen?.has("x-forwarded-for")).toBe(false);
  });

  it("carries one RequestContext across a render's calls: 6 calls, 1 session read", async () => {
    const { email, sessionCookie } = await signIn(
      `render-${crypto.randomUUID()}@example.com`,
    );
    // Only the session token is sent, so the cookie cache cannot hide the
    // session read being counted.
    const incoming = new Headers({ cookie: sessionCookie });
    const render = Context.make(
      RequestContext,
      await runtime.runPromise(RequestContext.make(incoming)),
    );
    log.reset();

    const api = await Effect.runPromise(client(incoming, render));
    const results = await Effect.runPromise(
      Effect.all(
        [
          api.session.me(),
          api.health.ready(),
          api.session.me(),
          api.session.me(),
          api.health.live(),
          api.session.me(),
        ],
        { concurrency: "unbounded" },
      ),
    );
    expect(results).toHaveLength(6);
    expect(results[0].user.email).toBe(email);

    // No endpoint here takes AdminOnly / WorkspaceRole yet (Phase 4), so the
    // role and membership reads stay at zero; the session read is the one.
    expect(log.touching("plain", "session")).toBe(1);
    expect(log.touching("db", "user")).toBe(0);
    expect(log.touching("db", "workspace_membership")).toBe(0);
  });
});
