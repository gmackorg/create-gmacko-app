import { CreatePost, PostId } from "@gmacko/domain";
import { mutationOptions, queryOptions } from "@tanstack/react-query";

import type { ApiClient } from "../client";
import { invalidates } from "./invalidation";
import { queryKeys } from "./keys";

/** The plain-object form of a payload; the factory builds the `Schema.Class` instance. */
export type CreatePostInput = ConstructorParameters<typeof CreatePost>[0];

export const postsQueries = (api: ApiClient) => ({
  list: () =>
    queryOptions({
      queryKey: queryKeys.posts.list(),
      queryFn: () => api.run((c) => c.posts.list()),
    }),
  /** Rejects with `NotFound{resource: "post"}` for an unknown id. */
  byId: (id: string) =>
    queryOptions({
      queryKey: queryKeys.posts.byId(id),
      queryFn: () =>
        api.run((c) => c.posts.byId({ params: { id: PostId.make(id) } })),
    }),
});

export const postsMutations = (api: ApiClient) => ({
  create: () =>
    mutationOptions({
      mutationKey: [...queryKeys.posts.all, "create"],
      mutationFn: (input: CreatePostInput) =>
        api.run((c) => c.posts.create({ payload: new CreatePost(input) })),
      meta: invalidates("posts.create"),
    }),
  remove: () =>
    mutationOptions({
      mutationKey: [...queryKeys.posts.all, "remove"],
      mutationFn: (id: string) =>
        api.run((c) => c.posts.remove({ params: { id: PostId.make(id) } })),
      meta: invalidates("posts.remove"),
    }),
});
