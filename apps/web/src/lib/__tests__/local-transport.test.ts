/**
 * The SSR path: an `HttpApiClient` whose transport calls the in-process API
 * handler directly, forwarding the incoming request's cookie, so a loader can
 * read the session without a network hop. Runs over the sqlite-node layers.
 */
import { Auth } from "@gmacko/auth/service";
import { layerTest } from "@gmacko/db/testing";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localTransport } from "~/lib/local-transport";
import { AppConfig, GmackoApi, makeApiHandler } from "~/server/api";
import { makeAuthOptions } from "~/server/auth";
import { Background } from "~/server/background";

const baseUrl = "http://localhost:3001";
const magicLinks: Array<{ email: string; url: string }> = [];

const config = AppConfig.fromBindings({
  STAGE: "development",
  AUTH_SECRET: "test-secret-that-is-long-enough-for-better-auth",
  PORTLESS_URL: baseUrl,
});
const AppConfigTest = Layer.succeed(AppConfig)(config);
const AuthTest = Auth.layer(
  makeAuthOptions(config, {
    magicLink: {
      send: async (link) => {
        magicLinks.push(link);
      },
    },
  }),
).pipe(Layer.provide(layerTest));
const BackgroundTest = Background.layer((promise) => {
  void promise;
});
const Services = Layer.mergeAll(
  AppConfigTest,
  layerTest,
  AuthTest,
  BackgroundTest,
);

describe("localTransport", () => {
  let runtime: ManagedRuntime.ManagedRuntime<Auth, never>;
  let calls = 0;
  let apiHandler: (request: Request) => Promise<Response>;
  let dispose: () => Promise<void>;

  beforeAll(() => {
    runtime = ManagedRuntime.make(Services);
    const api = makeApiHandler(Services, { memoMap: runtime.memoMap });
    apiHandler = (request) => {
      calls += 1;
      return api.handler(request);
    };
    dispose = api.dispose;
  });
  afterAll(async () => {
    await dispose();
    await runtime.dispose();
  });

  const signIn = (email: string) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const auth = yield* Auth;
        yield* auth.handler(
          new Request(`${baseUrl}/api/auth/sign-in/magic-link`, {
            method: "POST",
            headers: { "content-type": "application/json", origin: baseUrl },
            body: JSON.stringify({ email, callbackURL: "/" }),
          }),
        );
        const link = magicLinks.find((l) => l.email === email);
        if (!link) throw new Error("magic link was not sent");
        const verified = yield* auth.handler(
          new Request(link.url, { redirect: "manual" }),
        );
        const setCookie = verified.headers.get("set-cookie") ?? "";
        const match = /better-auth\.session_token=([^;]+)/.exec(setCookie);
        if (!match) throw new Error(`no session cookie in ${setCookie}`);
        return `better-auth.session_token=${match[1]}`;
      }),
    );

  const client = (incoming: Headers) =>
    HttpApiClient.make(GmackoApi, { baseUrl: "http://localhost" }).pipe(
      Effect.provideService(
        HttpClient.HttpClient,
        localTransport(apiHandler, incoming),
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
    const email = `ssr-${crypto.randomUUID()}@example.com`;
    const cookie = await signIn(email);

    const me = await Effect.runPromise(
      Effect.flatMap(client(new Headers({ cookie })), (api) =>
        api.session.me(),
      ),
    );
    expect(me.user?.email).toBe(email);
    expect(me.user?.role).toBe("user");

    const anonymous = await Effect.runPromise(
      Effect.flatMap(client(new Headers()), (api) => api.session.me()),
    );
    expect(anonymous.user).toBeNull();
  });
});
