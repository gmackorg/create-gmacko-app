import { CreatePost } from "@gmacko/domain";
import { mutationOptions, queryOptions } from "@tanstack/react-query";

import type { ApiClient } from "../client";
import { forgePosts, MissingForgePost } from "../forge-posts";
import { invalidates } from "./invalidation";
import { queryKeys } from "./keys";

/** The plain-object form of a payload; the form schema still checks it. */
export type CreatePostInput = ConstructorParameters<typeof CreatePost>[0];

/**
 * The sample product. `api` is unused: these calls go to the Forge host
 * (`forgePosts`), not the Effect HttpApi. The argument stays so `queries`
 * keeps one factory shape.
 */
export const postsQueries = (_api: ApiClient) => ({
  list: () =>
    queryOptions({
      queryKey: queryKeys.posts.list(),
      queryFn: () => forgePosts.list(),
    }),
  byId: (id: string) =>
    queryOptions({
      queryKey: queryKeys.posts.byId(id),
      queryFn: async () => {
        const items = await forgePosts.list();
        const found = items.find((item) => item.id === id);
        if (!found) throw new MissingForgePost(id);
        return found;
      },
    }),
});

export const postsMutations = (_api: ApiClient) => ({
  create: () =>
    mutationOptions({
      mutationKey: [...queryKeys.posts.all, "create"],
      mutationFn: (input: CreatePostInput) => forgePosts.create(input),
      meta: invalidates("posts.create"),
    }),
  remove: () =>
    mutationOptions({
      mutationKey: [...queryKeys.posts.all, "remove"],
      mutationFn: (id: string) => forgePosts.remove(id),
      meta: invalidates("posts.remove"),
    }),
});
