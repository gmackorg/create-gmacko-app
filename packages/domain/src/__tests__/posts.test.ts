import { describe, expect, it } from "vitest";

import { CreatePost, CreatePostForm, Post, PostId, PostsApi } from "../posts";
import { inspectGroup, roundTrip, routeTable } from "./helpers";

describe("Post", () => {
  it("round-trips, with a nullable updatedAt", () => {
    const post = new Post({
      id: PostId.make("p1"),
      title: "Hello",
      content: "World",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: null,
    });
    expect(roundTrip(Post, post)).toEqual(post);
  });
});

describe("CreatePost", () => {
  it("requires a title of 1..256 and content up to 256", () => {
    expect(() => new CreatePost({ title: "", content: "" })).toThrow();
    expect(
      () => new CreatePost({ title: "x".repeat(257), content: "" }),
    ).toThrow();
    expect(
      () => new CreatePost({ title: "ok", content: "x".repeat(257) }),
    ).toThrow();
    expect(new CreatePost({ title: "ok", content: "" }).title).toBe("ok");
  });

  it("is a Standard Schema for TanStack Form", async () => {
    const bad = await CreatePostForm["~standard"].validate({
      title: "",
      content: "",
    });
    expect("issues" in bad && bad.issues?.length).toBeGreaterThan(0);
  });
});

describe("PostsApi", () => {
  it("declares the four post endpoints with their credentials", () => {
    expect(routeTable(inspectGroup(PostsApi))).toEqual([
      {
        id: "list",
        method: "GET",
        path: "/posts",
        credential: "public",
        roles: [],
        success: 200,
        errors: [],
      },
      {
        id: "byId",
        method: "GET",
        path: "/posts/:id",
        credential: "public",
        roles: [],
        success: 200,
        errors: ["404 NotFound"],
      },
      {
        id: "create",
        method: "POST",
        path: "/posts",
        credential: "SessionOrKey(write)",
        roles: [],
        success: 201,
        errors: ["401 Unauthorized", "403 Forbidden"],
      },
      {
        id: "remove",
        method: "DELETE",
        path: "/posts/:id",
        credential: "SessionOrKey(delete)",
        roles: [],
        success: 204,
        errors: ["401 Unauthorized", "403 Forbidden", "404 NotFound"],
      },
    ]);
  });
});
