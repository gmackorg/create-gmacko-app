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
import { Schema } from "effect";

import type { ApiClient } from "../client";
import { ApiClientError } from "../errors";
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
  type RemovedKeys,
  removal,
} from "./invalidation";
export {
  LIST_USERS_DEFAULTS,
  type ListUsersInput,
  listUsersQuery,
  type QueryKeys,
  queryKeys,
} from "./keys";
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

/** How many times a retryable failure is retried before the query settles as an error. */
export const MAX_RETRIES = 3;

/**
 * A contract error decodes into a `Schema.TaggedError` instance, and every
 * one of those carries its `_tag`. `ApiClientError` carries one too, which
 * is why `shouldRetry` matches it first.
 */
const DomainErrorShape = Schema.Struct({ _tag: Schema.String });
const isDomainError = Schema.is(DomainErrorShape);

/**
 * The default `queries.retry` of `makeQueryClient`, for apps that own their
 * `QueryClient`. A domain error (`NotFound`, `Forbidden`, `Conflict`, ...)
 * is an answer, not a fault: retrying it cannot change it and only delays
 * the screen. Likewise an undeclared 4xx and a request the client could not
 * encode or a body it could not decode. What is retried, up to `MAX_RETRIES`
 * times: a transport failure (no response at all), an undeclared 5xx (a
 * proxy's 502, a cold Worker), and errors this client did not produce
 * (TanStack's own default).
 */
export const shouldRetry = (failureCount: number, error: Error): boolean => {
  if (failureCount >= MAX_RETRIES) return false;
  if (error instanceof ApiClientError) {
    switch (error.kind) {
      case "transport":
        return true;
      case "status":
        return error.status === undefined || error.status >= 500;
      default:
        return false;
    }
  }
  return !isDomainError(error);
};

/**
 * The mutation cache hands a success's variables over untyped. `removes`
 * needs the id a deletion was called with, and only that: this is the one
 * line where the cache's opaque value is decoded into it.
 */
const isRemovedId = Schema.is(Schema.String);

/**
 * A `QueryClient` whose queries retry per `shouldRetry` and whose mutation
 * cache applies each mutation's `invalidates` meta on success, so screens
 * never invalidate by hand. Anything in `config` wins over these defaults.
 * An app that already owns a client can call `applyInvalidation` from its
 * own `MutationCache.onSuccess` and pass `shouldRetry` as its `retry`.
 */
export const makeQueryClient = (
  config: QueryClientConfig = {},
): QueryClient => {
  const queryClient: QueryClient = new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      queries: { retry: shouldRetry, ...config.defaultOptions?.queries },
    },
    mutationCache:
      config.mutationCache ??
      new MutationCache({
        onSuccess: (_data, variables, _onMutateResult, mutation) =>
          applyInvalidation(
            queryClient,
            mutation.meta,
            isRemovedId(variables) ? variables : undefined,
          ),
      }),
  });
  return queryClient;
};
