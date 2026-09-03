/**
 * `@gmacko/api-client/queries`: the TanStack Query v5 layer over the
 * client. `queryKeys` is the only place keys are spelled; `makeQueries`
 * and `makeMutations` give `queryOptions`/`mutationOptions` for every
 * endpoint; `invalidation` says what each mutation makes stale, and
 * `makeQueryClient` (or `applyInvalidation` on an existing client) applies
 * it after a mutation succeeds.
 */
import {
  MutationCache,
  QueryClient,
  type QueryClientConfig,
} from "@tanstack/react-query";

import type { ApiClient } from "../client";
import { adminMutations, adminQueries } from "./admin";
import { authMutations, authQueries } from "./auth";
import { healthMutations, healthQueries } from "./health";
import { applyInvalidation } from "./invalidation";
import { postsMutations, postsQueries } from "./posts";
import { settingsMutations, settingsQueries } from "./settings";

export type {
  CompleteBootstrapInput,
  ReviewWaitlistEntryInput,
  UpdateLaunchControlsInput,
  UpdateUserRoleInput,
} from "./admin";
export {
  applyInvalidation,
  CLEAR_ALL,
  type InvalidationMeta,
  type InvalidationTarget,
  invalidates,
  invalidation,
  type MutationId,
} from "./invalidation";
export { type ListUsersInput, type QueryKeys, queryKeys } from "./keys";
export type { CreatePostInput } from "./posts";
export type {
  CreateApiKeyInput,
  CreateInviteInput,
  UpdatePreferencesInput,
  WaitlistSubmitInput,
} from "./settings";

/** `queryOptions` factories, one per GET endpoint, grouped like the contract. */
export const makeQueries = (api: ApiClient) => ({
  auth: authQueries(api),
  posts: postsQueries(api),
  settings: settingsQueries(api),
  admin: adminQueries(api),
  health: healthQueries(api),
});
export type Queries = ReturnType<typeof makeQueries>;

/** `mutationOptions` factories, one per non-GET endpoint; each carries its `invalidates` meta. */
export const makeMutations = (api: ApiClient) => ({
  auth: authMutations(api),
  posts: postsMutations(api),
  settings: settingsMutations(api),
  admin: adminMutations(api),
  health: healthMutations(api),
});
export type Mutations = ReturnType<typeof makeMutations>;

/**
 * A `QueryClient` whose mutation cache applies each mutation's
 * `invalidates` meta on success, so screens never invalidate by hand. An
 * app that already owns a client can call `applyInvalidation` from its own
 * `MutationCache.onSuccess` instead.
 */
export const makeQueryClient = (
  config: QueryClientConfig = {},
): QueryClient => {
  const queryClient: QueryClient = new QueryClient({
    ...config,
    mutationCache:
      config.mutationCache ??
      new MutationCache({
        onSuccess: (_data, _variables, _context, mutation) =>
          applyInvalidation(queryClient, mutation.meta),
      }),
  });
  return queryClient;
};
