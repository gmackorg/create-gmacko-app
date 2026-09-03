/**
 * The transport seam: `makeApiClient` hands the transport one web `Request`
 * per call, with the header provider's headers merged in, and turns the
 * `Response` back into the typed result. The in-process case (SSR loaders
 * calling the handler directly, no network hop) is the one the web app
 * relies on; `forwardedHeaders` carries exactly the incoming headers the
 * API may see (the cookie for the session, the client address for the rate
 * limit key), per-render services ride through a closure, and the call's
 * span crosses the hop as `traceparent` so a trace has one root per page.
 */
import { makeTestApi, spansNamed, type TestApi } from "@gmacko/api/testing";
import { RequestContext } from "@gmacko/auth/request-context";
import { countingDatabase, makeStatementLog } from "@gmacko/auth/testing";
import { layerTest } from "@gmacko/db/testing";
import { CreatePost } from "@gmacko/domain";
import { Context, Effect, Layer, Option, Tracer } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  FORWARDED_HEADERS,
  forwardedHeaders,
  makeApiClient,
  pickHeaders,
} from "../index";

const log = makeStatementLog();
let api: TestApi;
beforeAll(() => {
  api = makeTestApi({
    database: countingDatabase(log).pipe(Layer.provide(layerTest)),
  });
});
afterAll(() => api.dispose());

describe("transport", () => {
  it("serves in-process: one transport call per client call, no network", async () => {
    let calls = 0;
    const local = makeApiClient({
      baseUrl: "http://localhost",
      transport: (request) => {
        calls += 1;
        return api.handler(request);
      },
    });
    const ready = await local.run((c) => c.health.ready());
    expect(ready.status).toBe("ok");
    expect(typeof ready.latencyMs).toBe("number");
    expect(calls).toBe(1);
  });

  it("hands the transport a Request with method, path, body and merged headers", async () => {
    let seen: Request | undefined;
    const capturing = makeApiClient({
      baseUrl: "https://api.example.com",
      transport: async (request) => {
        seen = request;
        return Response.json(
          {
            id: "p1",
            title: "T",
            content: "C",
            createdAt: "2026-09-03T00:00:00.000Z",
            updatedAt: null,
          },
          { status: 201 },
        );
      },
      headers: async () => ({ cookie: "a=b", "x-custom": "1" }),
    });
    await capturing.run((c) =>
      c.posts.create({ payload: new CreatePost({ title: "T", content: "C" }) }),
    );
    expect(seen).toBeDefined();
    expect(seen?.method).toBe("POST");
    expect(seen?.url).toBe("https://api.example.com/api/posts");
    expect(seen?.headers.get("cookie")).toBe("a=b");
    expect(seen?.headers.get("x-custom")).toBe("1");
    expect(seen?.headers.get("content-type")).toContain("application/json");
    await expect(seen?.json()).resolves.toEqual({ title: "T", content: "C" });
  });

  it("forwards the incoming cookie so a loader sees the page's session", async () => {
    const person = await api.createUser();
    const incoming = new Headers({ cookie: person.cookie });
    const ssr = makeApiClient({
      baseUrl: "http://localhost",
      transport: (request) => api.handler(request),
      headers: () => pickHeaders(incoming, ["cookie"]),
    });
    const me = await ssr.run((c) => c.auth.session());
    expect(me.credential).toBe("session");
    expect(me.user?.email).toBe(person.email);

    // `auth.session` is public: anonymous is a null user, never 401.
    const anonymous = makeApiClient({
      baseUrl: "http://localhost",
      transport: (request) => api.handler(request),
    });
    expect(await anonymous.run((c) => c.auth.session())).toEqual({
      user: null,
      credential: null,
    });
  });

  it("forwards only cookie and cf-connecting-ip: authorization never crosses", async () => {
    expect(FORWARDED_HEADERS).toEqual(["cookie", "cf-connecting-ip"]);
    const incoming = new Headers({
      cookie: "better-auth.session_token=abc",
      "cf-connecting-ip": "203.0.113.9",
      authorization: "Bearer gmk_should_not_leak",
      "x-forwarded-for": "198.51.100.7",
      traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
    });
    expect(forwardedHeaders(incoming)).toEqual({
      cookie: "better-auth.session_token=abc",
      "cf-connecting-ip": "203.0.113.9",
    });
    expect(pickHeaders(incoming, ["cookie", "x-missing"])).toEqual({
      cookie: "better-auth.session_token=abc",
    });

    let seen: Headers | undefined;
    const ssr = makeApiClient({
      baseUrl: "http://localhost",
      transport: async (request) => {
        seen = new Headers(request.headers);
        return Response.json({ status: "ok", stage: "development" });
      },
      headers: () => forwardedHeaders(incoming),
    });
    await ssr.run((c) => c.health.live());
    expect(seen?.get("cookie")).toBe("better-auth.session_token=abc");
    expect(seen?.get("cf-connecting-ip")).toBe("203.0.113.9");
    expect(seen?.has("authorization")).toBe(false);
    expect(seen?.has("x-forwarded-for")).toBe(false);
    // The page's own traceparent is not replayed: the call's span sets its own.
    expect(seen?.get("traceparent")).not.toBe(incoming.get("traceparent"));
  });

  it("parents the endpoint span on the caller's span: traceparent crosses the in-process hop", async () => {
    const clientSpans: Array<Tracer.NativeSpan> = [];
    const clientTracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options);
        clientSpans.push(span);
        return span;
      },
    });
    const traced = makeApiClient({
      baseUrl: "http://localhost",
      transport: (request) => api.handler(request),
      runtime: (effect) =>
        Effect.runPromiseExit(
          Effect.provideService(effect, Tracer.Tracer, clientTracer),
        ),
    });
    const before = spansNamed(api, "posts.list").length;
    await traced.run((c) => Effect.withSpan("page.render")(c.posts.list()));

    const render = clientSpans.find((span) => span.name === "page.render");
    const outbound = clientSpans.find((span) =>
      span.name.startsWith("http.client"),
    );
    expect(render).toBeDefined();
    expect(outbound).toBeDefined();
    // The client span is a child of the render span...
    expect(Option.getOrThrow(outbound?.parent ?? Option.none()).spanId).toBe(
      render?.spanId,
    );
    // ...and the endpoint span, recorded by the API's own tracer, continues
    // the same trace under the client span (an external parent: it crossed
    // as a `traceparent` header).
    const endpoint = spansNamed(api, "posts.list")[before];
    expect(endpoint).toBeDefined();
    const parent = Option.getOrThrow(endpoint?.parent ?? Option.none());
    expect(parent._tag).toBe("ExternalSpan");
    expect(parent.traceId).toBe(render?.traceId);
    expect(parent.spanId).toBe(outbound?.spanId);
    expect(endpoint?.traceId).toBe(render?.traceId);
  });

  it("carries a per-render context through the transport closure: 6 calls, 1 session read", async () => {
    const person = await api.createUser();
    // Only the session token is sent, so the cookie cache cannot hide the
    // session read being counted.
    const sessionCookie = person.cookie
      .split("; ")
      .find((part) => part.startsWith("better-auth.session_token="));
    expect(sessionCookie).toBeDefined();
    const incoming = new Headers({ cookie: sessionCookie ?? "" });
    const render = Context.make(
      RequestContext,
      await api.run(RequestContext.make(incoming)),
    );
    log.reset();

    const ssr = makeApiClient({
      baseUrl: "http://localhost",
      transport: (request) => api.handler(request, render),
      headers: () => pickHeaders(incoming, ["cookie"]),
    });
    const results = await Promise.all([
      ssr.run((c) => c.auth.session()),
      ssr.run((c) => c.health.ready()),
      ssr.run((c) => c.auth.session()),
      ssr.run((c) => c.settings.getPreferences()),
      ssr.run((c) => c.health.live()),
      ssr.run((c) => c.auth.session()),
    ]);
    expect(results).toHaveLength(6);
    expect(results[0].user?.email).toBe(person.email);

    // One session read for the render; the user row is read once through
    // the same memo.
    expect(log.touching("plain", "session")).toBe(1);
    expect(log.touching("db", "user")).toBe(1);
  });

  it("defaults to fetch against baseUrl when no transport is given", async () => {
    const calls: Array<string> = [];
    const fetching = makeApiClient({
      baseUrl: "https://api.example.com/",
      fetch: async (input) => {
        const request = input instanceof Request ? input : new Request(input);
        calls.push(`${request.method} ${request.url}`);
        return Response.json({ status: "ok", stage: "development" });
      },
    });
    const live = await fetching.run((c) => c.health.live());
    expect(live.stage).toBe("development");
    expect(calls).toEqual(["GET https://api.example.com/api/health/live"]);
  });
});
