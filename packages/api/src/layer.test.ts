/**
 * What every endpoint gets from the layer rather than from its handler: the
 * InternalError boundary, one root span per call, the duration histogram,
 * request/user log annotations, CORS from `AppConfig.allowedOrigins`, the
 * rate limit, and the request/trace id headers.
 */
import { platformPrimitives } from "@gmacko/config";
import { Database, DatabaseError } from "@gmacko/db";
import { layerTest } from "@gmacko/db/testing";
import { RateLimitScope, WaitlistSubmit } from "@gmacko/domain";
import { Context, Effect, Layer, Metric, Option } from "effect";
import { afterAll, describe, expect, it } from "vitest";

import { httpServerDuration } from "./boundary";
import { REQUEST_ID_HEADER, TRACE_ID_HEADER } from "./handler";
import { defaultRateLimits, RateLimiter } from "./rate-limit";
import {
  logsMentioning,
  makeTestApi,
  rootSpans,
  spansNamed,
  type TestApi,
} from "./testing";

const DRIVER_MESSAGE = "SQLITE_BUSY: database is locked at /very/secret/path";

type Leaf = (...args: ReadonlyArray<unknown>) => unknown;
interface PreparedLike extends Record<"run" | "all" | "get" | "values", Leaf> {}
interface SessionLike {
  prepareQuery: (...args: ReadonlyArray<unknown>) => PreparedLike;
}

/**
 * Every query the services run fails with a DatabaseError carrying the
 * driver message: the drizzle session's prepared queries are patched (the
 * same seam `Database` maps errors on), so builders still build and the
 * failure surfaces where a real driver failure would. better-auth's `plain`
 * handle is untouched, so sign-in still works.
 */
const failingDatabase = Layer.effect(Database)(
  Effect.map(Database, (database) => {
    const failure = new DatabaseError({
      reason: "other",
      cause: new Error(DRIVER_MESSAGE),
    });
    const fail = () => Effect.fail(failure);
    const session = (database.db as unknown as { _: { session: SessionLike } })
      ._.session;
    const prepareQuery = session.prepareQuery;
    session.prepareQuery = function (this: SessionLike, ...args) {
      const prepared = prepareQuery.call(this, ...args);
      for (const leaf of ["run", "all", "get", "values"] as const) {
        prepared[leaf] = fail;
      }
      return prepared;
    };
    return Database.of({
      ...database,
      ping: fail(),
      batch: () => fail(),
    });
  }),
).pipe(Layer.provide(layerTest));

const apis: Array<TestApi> = [];
afterAll(async () => {
  for (const api of apis) await api.dispose();
});
const start = (...args: Parameters<typeof makeTestApi>) => {
  const api = makeTestApi(...args);
  apis.push(api);
  return api;
};

describe("InternalError boundary", () => {
  it("turns a DatabaseError from a handler into 500 InternalError with a generic body and the trace header; the driver message is only in the log", async () => {
    const api = start({ database: failingDatabase });
    const response = await api.fetch("/api/posts");
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ _tag: "InternalError" });
    expect(body).not.toContain("secret");
    expect(body).not.toContain("SQLITE");
    expect(response.headers.get(TRACE_ID_HEADER)).toMatch(/^[0-9a-f]{32}$/);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBeTruthy();

    const logged = logsMentioning(api, DRIVER_MESSAGE);
    expect(logged.length).toBeGreaterThanOrEqual(1);
    expect(logged[0]?.annotations).toMatchObject({
      "http.endpoint": "posts.list",
      "request.id": response.headers.get(REQUEST_ID_HEADER),
    });

    // The typed client sees the contract's InternalError.
    const failure = await api.failure((client) => client.posts.list());
    expect(failure).toMatchObject({ _tag: "InternalError" });
  });

  it("turns a DatabaseError inside the credential middleware into the same 500, never a 401", async () => {
    const api = start({ database: failingDatabase });
    const response = await api.fetch("/api/preferences", {
      headers: { authorization: "Bearer gmk_anything" },
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ _tag: "InternalError" });
  });

  it("leaves the health probes to their own 503 shapes", async () => {
    const api = start({ database: failingDatabase, stage: "production" });
    const response = await api.fetch("/api/health/ready");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ _tag: "Unhealthy" });
  });
});

describe("tracing and metrics", () => {
  it("opens exactly one root span per call, named group.endpoint, with the status code", async () => {
    const api = start();
    const before = api.spans.length;
    await api.fetch("/api/posts");
    await api.fetch("/api/posts/missing");
    const roots = rootSpans(api).slice(-2);
    expect(roots.map((span) => span.name)).toEqual([
      "posts.list",
      "posts.byId",
    ]);
    expect(
      api.spans.slice(before).filter((s) => Option.isNone(s.parent)),
    ).toHaveLength(2);
    expect(roots[0]?.kind).toBe("server");
    expect(roots[0]?.attributes.get("http.request.method")).toBe("GET");
    expect(roots[0]?.attributes.get("url.path")).toBe("/api/posts");
    expect(roots[0]?.attributes.get("http.response.status_code")).toBe(200);
    expect(roots[0]?.status._tag).toBe("Ended");
    expect(roots[1]?.status._tag).toBe("Ended");
  });

  it("parents the span on the caller's traceparent and echoes the trace id", async () => {
    const api = start();
    const traceId = "0af7651916cd43dd8448eb211c80319c";
    const response = await api.fetch("/api/posts", {
      headers: { traceparent: `00-${traceId}-b7ad6b7169203331-01` },
    });
    expect(response.headers.get(TRACE_ID_HEADER)).toBe(traceId);
    const span = spansNamed(api, "posts.list").at(-1);
    expect(span?.traceId).toBe(traceId);
    expect(Option.isSome(span!.parent)).toBe(true);
  });

  it("annotates the span and the log with the user id on authenticated calls", async () => {
    const api = start();
    const person = await api.createUser();
    await api.call((client) => client.settings.getPreferences(), {
      cookie: person.cookie,
    });
    const span = spansNamed(api, "settings.getPreferences").at(-1);
    expect(span?.attributes.get("user.id")).toBe(person.id);
    expect(span?.attributes.get("request.id")).toEqual(expect.any(String));
  });

  it("records the duration histogram per endpoint", async () => {
    const api = start();
    const metric = Metric.withAttributes(httpServerDuration, {
      endpoint: "auth.session",
    });
    const before = (await api.run(Metric.value(metric))).count;
    await api.fetch("/api/auth/session");
    await api.fetch("/api/auth/session");
    const after = await api.run(Metric.value(metric));
    expect(after.count).toBe(before + 2);
    expect(after.sum).toBeGreaterThanOrEqual(0);
  });
});

describe("CORS", () => {
  it("answers a preflight from an allowed origin with credentials, and withholds the allow-origin header from an unknown one", async () => {
    const api = start();
    const allowed = await api.fetch("/api/posts", {
      method: "OPTIONS",
      headers: {
        origin: api.baseUrl,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      api.baseUrl,
    );
    expect(allowed.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(allowed.headers.get("access-control-allow-methods")).toContain(
      "POST",
    );
    expect(allowed.headers.get("access-control-allow-headers")).toContain(
      "authorization",
    );
    expect(allowed.headers.get("access-control-expose-headers")).toContain(
      TRACE_ID_HEADER,
    );

    const unknown = await api.fetch("/api/posts", {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
      },
    });
    expect(unknown.status).toBe(204);
    expect(unknown.headers.get("access-control-allow-origin")).toBeNull();

    const actual = await api.fetch("/api/posts", {
      headers: { origin: "https://evil.example" },
    });
    expect(actual.headers.get("access-control-allow-origin")).toBeNull();
    expect(actual.status).toBe(200);
  });
});

describe("request ids", () => {
  it("mints a request id and echoes one the caller sends", async () => {
    const api = start();
    const minted = await api.fetch("/api/health/live");
    expect(minted.headers.get(REQUEST_ID_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
    const echoed = await api.fetch("/api/posts", {
      headers: { [REQUEST_ID_HEADER]: "req-123" },
    });
    expect(echoed.headers.get(REQUEST_ID_HEADER)).toBe("req-123");
    const span = spansNamed(api, "posts.list").at(-1);
    expect(span?.attributes.get("request.id")).toBe("req-123");
  });
});

describe("rate limit", () => {
  it("answers 429 RateLimited with a retry hint after N calls on a limited endpoint, per scope", async () => {
    const api = start({
      rateLimits: {
        contact: { limit: 2, windowMs: 60_000 },
        "api-keys": { limit: 1, windowMs: 60_000 },
      },
    });
    const submit = () =>
      api.result((client) =>
        client.settings.submitWaitlistEntry({
          payload: new WaitlistSubmit({
            email: `rl-${crypto.randomUUID().slice(0, 6)}@example.com`,
            source: "landing",
          }),
        }),
      );
    expect((await submit())._tag).toBe("Success");
    expect((await submit())._tag).toBe("Success");
    const third = await submit();
    expect(third._tag).toBe("Failure");
    if (third._tag === "Failure") {
      expect(third.failure).toMatchObject({ _tag: "RateLimited" });
      expect(
        (third.failure as { retryAfterSeconds: number }).retryAfterSeconds,
      ).toBeGreaterThan(0);
    }
    const raw = await api.fetch("/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "raw@example.com" }),
    });
    expect(raw.status).toBe(429);

    // Other scopes and unlimited endpoints are unaffected.
    expect((await api.fetch("/api/posts")).status).toBe(200);
    const person = await api.createUser();
    expect(
      (
        await api.fetch("/api/api-keys", {
          headers: { cookie: person.cookie },
        })
      ).status,
    ).toBe(200);
  });

  it("refuses before any credential is read: an over-limit call is 429 even without a cookie", async () => {
    const api = start({
      rateLimits: { "api-keys": { limit: 1, windowMs: 60_000 } },
    });
    const person = await api.createUser();
    const first = await api.fetch("/api/api-keys", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: person.cookie,
        origin: api.baseUrl,
      },
      body: JSON.stringify({ name: "one", permissions: ["read"] }),
    });
    expect(first.status).toBe(201);
    const anonymous = await api.fetch("/api/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "two", permissions: ["read"] }),
    });
    expect(anonymous.status).toBe(429);
  });

  it("keys the window per client address", async () => {
    const api = start({
      rateLimits: { contact: { limit: 1, windowMs: 60_000 } },
    });
    const from = (ip: string) =>
      api.fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": ip },
        body: JSON.stringify({
          email: `${ip.replaceAll(".", "-")}@example.com`,
        }),
      });
    expect((await from("203.0.113.1")).status).toBe(201);
    expect((await from("203.0.113.1")).status).toBe(429);
    expect((await from("203.0.113.2")).status).toBe(201);
  });

  it("the in-memory limiter resets after the window", async () => {
    const limiter = await Effect.runPromise(
      Layer.build(
        RateLimiter.layerMemory({
          ...defaultRateLimits,
          auth: { limit: 1, windowMs: 50 },
        }),
      ).pipe(
        Effect.map((context) => Context.get(context, RateLimiter)),
        Effect.scoped,
      ),
    );
    await Effect.runPromise(limiter.consume("auth", "c"));
    const second = await Effect.runPromise(
      Effect.result(limiter.consume("auth", "c")),
    );
    expect(second._tag).toBe("Failure");
    await new Promise((resolve) => setTimeout(resolve, 60));
    const third = await Effect.runPromise(
      Effect.result(limiter.consume("auth", "c")),
    );
    expect(third._tag).toBe("Success");
  });

  it("uses the five scopes @gmacko/config names", () => {
    expect([...RateLimitScope.literals]).toEqual([
      ...platformPrimitives.rateLimits.scopes,
    ]);
    expect(Object.keys(defaultRateLimits).sort()).toEqual(
      [...platformPrimitives.rateLimits.scopes].sort(),
    );
  });
});
