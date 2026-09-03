import { AppApi } from "@gmacko/domain";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { internal, withUser } from "../boundary";
import { Posts } from "./service";

export const PostsHandlers = HttpApiBuilder.group(AppApi, "posts", (handlers) =>
  Effect.map(Posts, (posts) =>
    handlers
      .handle("list", () => internal(posts.list))
      .handle("byId", ({ params }) => internal(posts.byId(params.id)))
      .handle("create", ({ payload }) => withUser(() => posts.create(payload)))
      .handle("remove", ({ params }) =>
        withUser(() => posts.remove(params.id)),
      ),
  ),
).pipe(Layer.provide(Posts.layer));
