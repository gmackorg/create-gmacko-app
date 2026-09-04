/**
 * Posts through the web handler: public reads, `write`-scoped create
 * returning the row, `delete`-scoped remove with 404 then 204.
 */
import { Database } from "@gmacko/db";
import { Post as PostTable } from "@gmacko/db/schema";
import { CreatePost, PostId } from "@gmacko/domain";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeTestApi, type TestApi, type TestUser } from "../testing";

let api: TestApi;
let author: TestUser;
beforeAll(async () => {
  api = makeTestApi();
  author = await api.createUser();
});
afterAll(() => api.dispose());

const clearPosts = () =>
  api.run(Effect.flatMap(Database, ({ db }) => db.delete(PostTable)));

describe("posts", () => {
  it("create returns the created row with 201 and needs the write scope", async () => {
    const created = await api.call(
      (client) =>
        client.posts.create({
          payload: new CreatePost({ title: "Hello", content: "World" }),
        }),
      { cookie: author.cookie },
    );
    expect(created).toMatchObject({ title: "Hello", content: "World" });
    expect(created.id).toEqual(expect.any(String));
    expect(created.createdAt).toBeInstanceOf(Date);
    // drizzle's `$onUpdateFn` also fires on insert, so the row is born "updated".
    expect(created.updatedAt).toBeInstanceOf(Date);

    const raw = await api.fetch("/api/posts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: author.cookie,
        origin: api.baseUrl,
      },
      body: JSON.stringify({ title: "Raw", content: "" }),
    });
    expect(raw.status).toBe(201);

    const anonymous = await api.failure((client) =>
      client.posts.create({
        payload: new CreatePost({ title: "x", content: "y" }),
      }),
    );
    expect(anonymous).toMatchObject({ _tag: "Unauthorized" });

    const readKey = await api.createApiKey(author, ["read"]);
    const scoped = await api.failure(
      (client) =>
        client.posts.create({
          payload: new CreatePost({ title: "x", content: "y" }),
        }),
      { bearer: readKey.key },
    );
    expect(scoped).toMatchObject({ _tag: "Forbidden", reason: "scope" });
  });

  it("rejects an empty title and an oversized body with 400", async () => {
    const response = await api.fetch("/api/posts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: author.cookie,
        origin: api.baseUrl,
      },
      body: JSON.stringify({ title: "", content: "x".repeat(257) }),
    });
    expect(response.status).toBe(400);
  });

  it("list is public, newest first, at most ten", async () => {
    await clearPosts();
    const key = await api.createApiKey(author, ["write"]);
    for (let i = 0; i < 12; i += 1) {
      await api.run(
        Effect.flatMap(Database, ({ db }) =>
          db.insert(PostTable).values({
            title: `post ${i}`,
            content: "",
            createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
          }),
        ),
      );
    }
    expect(key.key.startsWith("gmk_")).toBe(true);
    const posts = await api.call((client) => client.posts.list());
    expect(posts).toHaveLength(10);
    expect(posts.map((post) => post.title)).toEqual(
      Array.from({ length: 10 }, (_, i) => `post ${11 - i}`),
    );
  });

  it("byId is public and 404s with NotFound(post)", async () => {
    const created = await api.call(
      (client) =>
        client.posts.create({
          payload: new CreatePost({ title: "Find me", content: "" }),
        }),
      { cookie: author.cookie },
    );
    const found = await api.call((client) =>
      client.posts.byId({ params: { id: created.id } }),
    );
    expect(found).toEqual(created);

    const missing = await api.failure((client) =>
      client.posts.byId({ params: { id: PostId.make("nope") } }),
    );
    expect(missing).toEqual(
      expect.objectContaining({
        _tag: "NotFound",
        resource: "post",
        id: "nope",
      }),
    );
    expect((await api.fetch("/api/posts/nope")).status).toBe(404);
  });

  it("remove needs the delete scope, answers 204, then 404", async () => {
    const created = await api.call(
      (client) =>
        client.posts.create({
          payload: new CreatePost({ title: "Bye", content: "" }),
        }),
      { cookie: author.cookie },
    );
    const writeOnly = await api.createApiKey(author, ["write"]);
    const scoped = await api.failure(
      (client) => client.posts.remove({ params: { id: created.id } }),
      { bearer: writeOnly.key },
    );
    expect(scoped).toMatchObject({ _tag: "Forbidden", reason: "scope" });

    const deleteKey = await api.createApiKey(author, ["delete"]);
    const response = await api.fetch(`/api/posts/${created.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${deleteKey.key}` },
    });
    expect(response.status).toBe(204);

    const again = await api.fetch(`/api/posts/${created.id}`, {
      method: "DELETE",
      headers: { cookie: author.cookie, origin: api.baseUrl },
    });
    expect(again.status).toBe(404);
    expect(await again.json()).toMatchObject({ _tag: "NotFound" });
  });
});
