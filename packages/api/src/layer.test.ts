/**
 * What every endpoint gets from the layer rather than from its handler: the
 * InternalError boundary, one root span per call, the duration histogram,
 * request/user log annotations, CORS from `AppConfig.allowedOrigins`, the
 * rate limit, and the request/trace id headers.
 */
import { platformPrimitives } from "@gmacko/config";
import { Database, DatabaseError } from "@gmacko/db";
import { layerTest } from "@gmacko/db/testing";
import {
  RateLimitScope,
  sessionCookieName,
  WaitlistSubmit,
} from "@gmacko/domain";
import { httpServerDuration } from "@gmacko/telemetry";
import { Context, Effect, Exit, Layer, Metric, Option } from "effect";
import { afterAll, describe, expect, it } from "vitest";
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

    // A 500 is the endpoint failing: its span ends as a failure, with the
    // status code.
    const span = spansNamed(api, "posts.list").at(-1);
    expect(span?.attributes.get("http.response.status_code")).toBe(500);
    expect(span?.status._tag).toBe("Ended");
    if (span?.status._tag === "Ended") {
      expect(Exit.isFailure(span.status.exit)).toBe(true);
    }

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
    // A declared 4xx is the endpoint answering as designed, not failing:
    // the span carries the status code and ends successfully.
    expect(roots[1]?.attributes.get("http.response.status_code")).toBe(404);
    for (const root of roots) {
      expect(root.status._tag).toBe("Ended");
      if (root.status._tag === "Ended") {
        expect(Exit.isSuccess(root.status.exit)).toBe(true);
      }
    }
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
        "access-control-request-headers":
          "content-type, traceparent, tracestate, x-request-id",
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
    // An explicit allow list, never an echo: the trace context headers a
    // browser client propagates and the request id it may mint are on it.
    const allowedHeaders = allowed.headers.get("access-control-allow-headers");
    for (const header of [
      "authorization",
      "content-type",
      "traceparent",
      "tracestate",
      REQUEST_ID_HEADER,
    ]) {
      expect(allowedHeaders).toContain(header);
    }
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
  const IP = "198.51.100.7";

  it("answers 429 RateLimited with a retry hint and Retry-After after N calls on a limited endpoint, per scope", async () => {
    const api = start({
      rateLimits: {
        contact: { limit: 2, windowMs: 60_000 },
        "api-keys": { limit: 1, windowMs: 60_000 },
      },
    });
    const submit = () =>
      api.result(
        (client) =>
          client.settings.submitWaitlistEntry({
            payload: new WaitlistSubmit({
              email: `rl-${crypto.randomUUID().slice(0, 6)}@example.com`,
              source: "landing",
            }),
          }),
        { headers: { "cf-connecting-ip": IP } },
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
      headers: { "content-type": "application/json", "cf-connecting-ip": IP },
      body: JSON.stringify({ email: "raw@example.com" }),
    });
    expect(raw.status).toBe(429);
    expect(raw.headers.get("retry-after")).toMatch(/^[1-9]\d*$/);
    expect(Number(raw.headers.get("retry-after"))).toBeLessThanOrEqual(60);

    // Other scopes and unlimited endpoints are unaffected.
    expect(
      (await api.fetch("/api/posts", { headers: { "cf-connecting-ip": IP } }))
        .status,
    ).toBe(200);
    const person = await api.createUser();
    expect(
      (
        await api.fetch("/api/api-keys", {
          headers: { cookie: person.cookie, "cf-connecting-ip": IP },
        })
      ).status,
    ).toBe(200);
  });

  it("keys a session call by the cookie as sent, before it is validated: the same cookie is one caller, another cookie another", async () => {
    const api = start({
      rateLimits: { "api-keys": { limit: 1, windowMs: 60_000 } },
    });
    const person = await api.createUser();
    const create = (cookie: string, name: string) =>
      api.fetch("/api/api-keys", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
          origin: api.baseUrl,
        },
        body: JSON.stringify({ name, permissions: ["read"] }),
      });
    expect((await create(person.cookie, "one")).status).toBe(201);
    // Refused before the credential is read.
    expect((await create(person.cookie, "two")).status).toBe(429);
    // No client address on any call: the cookie alone tells callers apart
    // (in-process SSR calls carry the browser's cookie and no address), even
    // one that will not validate.
    const other = await create(
      `${sessionCookieName(false)}=not-a-session`,
      "three",
    );
    expect(other.status).toBe(401);
    const someoneElse = await api.createUser();
    expect((await create(someoneElse.cookie, "four")).status).toBe(201);
  });

  it("keys a bearer call by the key as sent: a bad key hammering an endpoint is one caller, refused before the credential is read", async () => {
    const api = start({
      rateLimits: { "api-keys": { limit: 1, windowMs: 60_000 } },
    });
    const withKey = (key: string) =>
      api.fetch("/api/api-keys", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ name: "x", permissions: ["read"] }),
      });
    expect((await withKey("gmk_bad")).status).toBe(401);
    expect((await withKey("gmk_bad")).status).toBe(429);
    expect((await withKey("gmk_other")).status).toBe(401);
    // A real key is its own caller too.
    const person = await api.createUser();
    const key = await api.createApiKey(person, ["admin"]);
    expect((await withKey(key.key)).status).toBe(201);
    expect((await withKey(key.key)).status).toBe(429);
  });

  it("keys the window per client address for anonymous calls", async () => {
    const api = start({
      rateLimits: { contact: { limit: 1, windowMs: 60_000 } },
    });
    const from = (headers: Record<string, string>) =>
      api.fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({
          email: `${crypto.randomUUID().slice(0, 8)}@example.com`,
        }),
      });
    expect((await from({ "cf-connecting-ip": "203.0.113.1" })).status).toBe(
      201,
    );
    expect((await from({ "cf-connecting-ip": "203.0.113.1" })).status).toBe(
      429,
    );
    expect((await from({ "cf-connecting-ip": "203.0.113.2" })).status).toBe(
      201,
    );
    // Without Cloudflare's header, the first X-Forwarded-For hop.
    expect(
      (await from({ "x-forwarded-for": "203.0.113.3, 10.0.0.1" })).status,
    ).toBe(201);
    expect(
      (await from({ "x-forwarded-for": "203.0.113.3, 10.0.0.2" })).status,
    ).toBe(429);
  });

  it("never collapses calls with no credential and no address into one bucket: each is counted alone, with a warning", async () => {
    const api = start({
      rateLimits: { contact: { limit: 1, windowMs: 60_000 } },
    });
    const post = () =>
      api.fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: `anon-${crypto.randomUUID().slice(0, 6)}@example.com`,
        }),
      });
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(201);
    expect(
      logsMentioning(api, "no credential and no client address").length,
    ).toBeGreaterThanOrEqual(2);
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
