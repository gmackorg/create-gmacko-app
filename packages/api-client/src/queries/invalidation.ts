/**
 * What each mutation makes stale. Declared once, statically, next to the
 * keys: the test suite checks every entry names a registered key, and
 * `makeQueryClient` (or `applyInvalidation` on an app's own client) turns
 * the entry into `invalidateQueries` calls after the mutation succeeds.
 *
 * A mutation that deletes a resource also *removes* the resource's own
 * entries (`removal`): an invalidated `posts.byId` would refetch a 404 into
 * the cache; a removed one is simply gone.
 */
import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { queryKeys as k } from "./keys";

/** Every query goes: the account (and its session) no longer exists. The mutation cache is left alone. */
export const CLEAR_ALL = "*" as const;

export type InvalidationTarget = QueryKey | typeof CLEAR_ALL;

export const invalidation = {
  "posts.create": [k.posts.list()],
  "posts.remove": [k.posts.list()],
  // The launch controls carry the waitlist count.
  "settings.submitWaitlistEntry": [
    k.admin.listWaitlistEntries(),
    k.admin.launchControls(),
  ],
  "settings.createInvite": [
    k.settings.listInvites(),
    k.settings.workspaceContext(),
    k.settings.billingOverview(),
  ],
  "settings.acceptInvite": [
    k.settings.listInvites(),
    k.settings.workspaceContext(),
    k.settings.billingOverview(),
  ],
  "settings.updatePreferences": [k.settings.getPreferences()],
  "settings.createApiKey": [k.settings.listApiKeys()],
  "settings.revokeApiKey": [k.settings.listApiKeys()],
  "settings.deleteAccount": [CLEAR_ALL],
  "admin.updateLaunchControls": [
    k.settings.launchState(),
    k.admin.launchControls(),
  ],
  "admin.reviewWaitlistEntry": [
    k.admin.listWaitlistEntries(),
    k.admin.launchControls(),
    k.settings.listInvites(),
  ],
  "admin.completeBootstrap": [
    k.admin.bootstrapStatus(),
    k.settings.workspaceContext(),
    k.auth.session(),
    k.admin.all,
  ],
  // `users` is the prefix of every list page and every detail; the stats
  // count users by role.
  "admin.updateUserRole": [k.admin.users, k.admin.stats(), k.auth.session()],
} as const satisfies Record<string, ReadonlyArray<InvalidationTarget>>;

export type MutationId = keyof typeof invalidation;

/**
 * Keys a mutation removes from the cache outright, computed from its
 * variables: the deleted resource's own detail entry, which must not be
 * refetched (it would 404) and must not linger as stale-but-present data.
 */
export const removal: {
  readonly [Id in MutationId]?: (variables: never) => ReadonlyArray<QueryKey>;
} = {
  "posts.remove": (id: string) => [k.posts.byId(id)],
};

/**
 * The `meta` a mutation carries so a cache can apply its invalidation. A
 * type alias, not an interface: TanStack's `meta` is `Record<string, unknown>`,
 * which an interface (no implicit index signature) does not satisfy.
 */
export type InvalidationMeta = {
  readonly invalidates: ReadonlyArray<InvalidationTarget>;
  /** Keys to remove, from the mutation's variables (`removal`); absent when the mutation deletes nothing. */
  readonly removes?:
    | ((variables: unknown) => ReadonlyArray<QueryKey>)
    | undefined;
};

export const invalidates = (id: MutationId): InvalidationMeta => {
  const removes = removal[id] as
    | ((variables: unknown) => ReadonlyArray<QueryKey>)
    | undefined;
  return removes === undefined
    ? { invalidates: invalidation[id] }
    : { invalidates: invalidation[id], removes };
};

const isInvalidationMeta = (meta: unknown): meta is InvalidationMeta =>
  typeof meta === "object" &&
  meta !== null &&
  Array.isArray((meta as { invalidates?: unknown }).invalidates);

/**
 * Applies a mutation's `meta.invalidates` (and, given its `variables`, its
 * `meta.removes`) to `queryClient`; a no-op for other meta. `CLEAR_ALL`
 * removes every query but leaves the mutation cache, and the mutation
 * whose success is being handled, in place.
 */
export const applyInvalidation = async (
  queryClient: QueryClient,
  meta: unknown,
  variables?: unknown,
): Promise<void> => {
  if (!isInvalidationMeta(meta)) return;
  if (meta.invalidates.includes(CLEAR_ALL)) {
    queryClient.removeQueries();
    return;
  }
  if (typeof meta.removes === "function") {
    for (const queryKey of meta.removes(variables)) {
      queryClient.removeQueries({ queryKey, exact: true });
    }
  }
  await Promise.all(
    meta.invalidates.map((target) =>
      target === CLEAR_ALL
        ? Promise.resolve()
        : queryClient.invalidateQueries({ queryKey: target }),
    ),
  );
};
