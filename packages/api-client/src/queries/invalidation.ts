/**
 * What each mutation makes stale. Declared once, statically, next to the
 * keys: the test suite checks every entry names a registered key, and
 * `makeQueryClient` (or `applyInvalidation` on an app's own client) turns
 * the entry into `invalidateQueries` calls after the mutation succeeds.
 */
import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { queryKeys as k } from "./keys";

/** The whole cache goes: the account (and its session) no longer exists. */
export const CLEAR_ALL = "*" as const;

export type InvalidationTarget = QueryKey | typeof CLEAR_ALL;

export const invalidation = {
  "posts.create": [k.posts.list()],
  "posts.remove": [k.posts.list()],
  "settings.submitWaitlistEntry": [k.admin.listWaitlistEntries()],
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
  "admin.updateUserRole": [k.admin.users, k.auth.session()],
} as const satisfies Record<string, ReadonlyArray<InvalidationTarget>>;

export type MutationId = keyof typeof invalidation;

/**
 * The `meta` a mutation carries so a cache can apply its invalidation. A
 * type alias, not an interface: TanStack's `meta` is `Record<string, unknown>`,
 * which an interface (no implicit index signature) does not satisfy.
 */
export type InvalidationMeta = {
  readonly invalidates: ReadonlyArray<InvalidationTarget>;
};

export const invalidates = (id: MutationId): InvalidationMeta => ({
  invalidates: invalidation[id],
});

const isInvalidationMeta = (meta: unknown): meta is InvalidationMeta =>
  typeof meta === "object" &&
  meta !== null &&
  Array.isArray((meta as { invalidates?: unknown }).invalidates);

/** Applies a mutation's `meta.invalidates` to `queryClient`; a no-op for other meta. */
export const applyInvalidation = async (
  queryClient: QueryClient,
  meta: unknown,
): Promise<void> => {
  if (!isInvalidationMeta(meta)) return;
  if (meta.invalidates.includes(CLEAR_ALL)) {
    queryClient.clear();
    return;
  }
  await Promise.all(
    meta.invalidates.map((target) =>
      target === CLEAR_ALL
        ? Promise.resolve()
        : queryClient.invalidateQueries({ queryKey: target }),
    ),
  );
};
