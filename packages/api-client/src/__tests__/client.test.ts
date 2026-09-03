/**
 * `makeApiClient` against the in-process `TestApi`: `run` resolves with the
 * decoded success, rejects with the typed domain error *instance* (so
 * `instanceof` and `_tag` both work), and wraps everything that is not a
 * domain error (transport, undeclared status, decode, defect) in
 * `ApiClientError`. Payloads are plain objects at the edge; the queries
 * layer builds the `Schema.Class` instances the client needs.
 */
import { makeTestApi, type TestApi, type TestUser } from "@gmacko/api/testing";
import {
  CompleteBootstrap,
  Conflict,
  CreateApiKey,
  CreatePost,
  Forbidden,
  NotFound,
  type PostId,
  Unauthorized,
} from "@gmacko/domain";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApiClientError, makeApiClient, traceOf } from "../index";

let api: TestApi;
let person: TestUser;
beforeAll(async () => {
  api = makeTestApi();
  person = await api.createUser();
});
afterAll(() => api.dispose());

/** A client over the test handler, sending `headers` on every call. */
const client = (
  headers: () => Record<string, string | undefined> = () => ({}),
  requestId?: () => string,
) =>
  makeApiClient({
    baseUrl: api.baseUrl,
    transport: (request) => api.handler(request),
    headers,
    requestId,
  });

const asCookie = (user: TestUser) => () => ({
  cookie: user.cookie,
  origin: api.baseUrl,
});

describe("run", () => {
  it("resolves with the decoded success (dates are Dates, 201 creates)", async () => {
    const created = await client(asCookie(person)).run((c) =>
      c.posts.create({
        payload: new CreatePost({ title: "Hello", content: "World" }),
      }),
    );
    expect(created).toMatchObject({ title: "Hello", content: "World" });
    expect(created.createdAt).toBeInstanceOf(Date);

    const listed = await client().run((c) => c.posts.list());
    expect(listed.map((post) => post.id)).toContain(created.id);
  });

  it("rejects with the typed error instance: NotFound{resource,id}", async () => {
    const error = await client()
      .run((c) => c.posts.byId({ params: { id: "missing" as PostId } }))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFound);
    expect(error).toMatchObject({
      _tag: "NotFound",
      resource: "post",
      id: "missing",
    });
    expect((error as Error).message).toBe("post missing not found");
  });

  it("rejects with Unauthorized when anonymous and Forbidden{reason} on a scope miss", async () => {
    const anonymous = await client()
      .run((c) =>
        c.posts.create({
          payload: new CreatePost({ title: "x", content: "y" }),
        }),
      )
      .catch((e: unknown) => e);
    expect(anonymous).toBeInstanceOf(Unauthorized);

    const readKey = await api.createApiKey(person, ["read"]);
    const scoped = await client(() => ({
      authorization: `Bearer ${readKey.key}`,
    }))
      .run((c) =>
        c.settings.createApiKey({
          payload: new CreateApiKey({ name: "nope", permissions: ["read"] }),
        }),
      )
      .catch((e: unknown) => e);
    expect(scoped).toBeInstanceOf(Forbidden);
    expect(scoped).toMatchObject({ _tag: "Forbidden", reason: "scope" });
  });

  it("rejects with Conflict{reason} and Forbidden{role} for a non-manager listing invites", async () => {
    // A user with no workspace: listInvites needs WorkspaceRole(admin).
    const listing = await client(asCookie(person))
      .run((c) => c.settings.listInvites())
      .catch((e: unknown) => e);
    expect(listing).toBeInstanceOf(Forbidden);
    expect(listing).toMatchObject({ reason: "role" });

    // Bootstrap can only complete once; the second call conflicts.
    const admin = await api.createUser({ role: "admin" });
    const c = client(asCookie(admin));
    await c.run((x) =>
      x.admin.completeBootstrap({
        payload: new CompleteBootstrap({ workspaceName: "First" }),
      }),
    );
    const again = await c
      .run((x) =>
        x.admin.completeBootstrap({
          payload: new CompleteBootstrap({ workspaceName: "Second" }),
        }),
      )
      .catch((e: unknown) => e);
    expect(again).toBeInstanceOf(Conflict);
    expect(again).toMatchObject({ _tag: "Conflict" });
  });

  it("wraps a transport failure in ApiClientError{kind: transport}", async () => {
    const broken = makeApiClient({
      baseUrl: api.baseUrl,
      transport: () => Promise.reject(new Error("socket hang up")),
    });
    const error = await broken
      .run((c) => c.health.live())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ _tag: "ApiClientError", kind: "transport" });
    expect((error as Error).message).toContain("socket hang up");
  });

  it("wraps an undeclared status in ApiClientError{kind: status, status}", async () => {
    const proxy = makeApiClient({
      baseUrl: api.baseUrl,
      transport: async () =>
        new Response("<html>bad gateway</html>", {
          status: 502,
          headers: { "content-type": "text/html", "x-request-id": "req-502" },
        }),
    });
    const error = await proxy
      .run((c) => c.posts.list())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ kind: "status", status: 502 });
    expect(traceOf(error)).toEqual({
      requestId: "req-502",
      traceId: undefined,
    });
  });

  it("wraps a 400 (request rejected by the server's decoder) as a status error", async () => {
    const raw = makeApiClient({
      baseUrl: api.baseUrl,
      transport: (request) =>
        api.handler(
          new Request(request.url, {
            method: "POST",
            headers: request.headers,
            body: JSON.stringify({ title: "", content: "x".repeat(300) }),
          }),
        ),
      headers: asCookie(person),
    });
    const error = await raw
      .run((c) =>
        c.posts.create({
          payload: new CreatePost({ title: "ok", content: "ok" }),
        }),
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ kind: "status", status: 400 });
  });

  it("wraps a body that fails to decode in ApiClientError{kind: decode}", async () => {
    const lying = makeApiClient({
      baseUrl: api.baseUrl,
      transport: async () =>
        Response.json({ status: "ok", stage: "not-a-stage" }, { status: 200 }),
    });
    const error = await lying
      .run((c) => c.health.live())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ kind: "decode" });
  });

  it("wraps a defect thrown inside the call in ApiClientError{kind: defect}", async () => {
    const error = await client()
      .run(() => Effect.die(new Error("boom")))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ kind: "defect" });
    expect((error as Error).message).toContain("boom");
  });

  it("sends x-request-id when a generator is given and reads the trace headers back", async () => {
    const c = client(asCookie(person), () => "req-abc");
    const me = await c.run((x) => x.auth.session());
    expect(me.user?.email).toBe(person.email);

    const error = await c
      .run((x) => x.posts.byId({ params: { id: "nope" as PostId } }))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFound);
    // The handler echoes the id it was given.
    expect(traceOf(error)?.requestId).toBe("req-abc");

    const untraced = await client()
      .run((x) => x.posts.byId({ params: { id: "nope" as PostId } }))
      .catch((e: unknown) => e);
    // No generator: the server minted one, and it is still readable.
    expect(traceOf(untraced)?.requestId).toEqual(expect.any(String));
  });

  it("exposes the typed client for callers that want to stay in Effect", async () => {
    const c = client();
    const live = await Effect.runPromise(c.client.health.live());
    expect(live.status).toBe("ok");
  });
});
