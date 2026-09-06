import {
  CompleteBootstrap,
  ReviewWaitlistEntry,
  UpdateLaunchControls,
  UpdateUserRole,
  UserId,
  WaitlistEntryId,
} from "@gmacko/domain";
import {
  keepPreviousData,
  mutationOptions,
  queryOptions,
} from "@tanstack/react-query";

import type { ApiClient } from "../client";
import { invalidates } from "./invalidation";
import { type ListUsersInput, listUsersQuery, queryKeys } from "./keys";

export type UpdateLaunchControlsInput = ConstructorParameters<
  typeof UpdateLaunchControls
>[0];
export type ReviewWaitlistEntryInput = ConstructorParameters<
  typeof ReviewWaitlistEntry
>[0];
export type CompleteBootstrapInput = ConstructorParameters<
  typeof CompleteBootstrap
>[0];
export type UpdateUserRoleInput = ConstructorParameters<
  typeof UpdateUserRole
>[0];

/** Every `/admin/*` query needs a platform admin (session, or a key with the `admin` scope). */
export const adminQueries = (api: ApiClient) => ({
  launchControls: () =>
    queryOptions({
      queryKey: queryKeys.admin.launchControls(),
      queryFn: () => api.run((c) => c.admin.launchControls()),
    }),
  listWaitlistEntries: () =>
    queryOptions({
      queryKey: queryKeys.admin.listWaitlistEntries(),
      queryFn: () => api.run((c) => c.admin.listWaitlistEntries()),
    }),
  /** Public: the web app shows the first-run screen on `requiresSetup`. */
  bootstrapStatus: () =>
    queryOptions({
      queryKey: queryKeys.admin.bootstrapStatus(),
      queryFn: () => api.run((c) => c.admin.bootstrapStatus()),
    }),
  stats: () =>
    queryOptions({
      queryKey: queryKeys.admin.stats(),
      queryFn: () => api.run((c) => c.admin.stats()),
    }),
  listWorkspaces: () =>
    queryOptions({
      queryKey: queryKeys.admin.listWorkspaces(),
      queryFn: () => api.run((c) => c.admin.listWorkspaces()),
    }),
  /**
   * One page of users. The input is normalised first so every spelling of
   * the default page shares a key; the previous page stays on screen while
   * the next one loads (`keepPreviousData`).
   */
  listUsers: (query?: ListUsersInput) => {
    const page = listUsersQuery(query);
    return queryOptions({
      queryKey: queryKeys.admin.listUsers(page),
      queryFn: () => api.run((c) => c.admin.listUsers({ query: page })),
      placeholderData: keepPreviousData,
    });
  },
  getUser: (userId: string) =>
    queryOptions({
      queryKey: queryKeys.admin.getUser(userId),
      queryFn: () =>
        api.run((c) =>
          c.admin.getUser({ params: { userId: UserId.make(userId) } }),
        ),
    }),
});

export const adminMutations = (api: ApiClient) => ({
  updateLaunchControls: () =>
    mutationOptions({
      mutationKey: [...queryKeys.admin.all, "updateLaunchControls"],
      mutationFn: (input: UpdateLaunchControlsInput) =>
        api.run((c) =>
          c.admin.updateLaunchControls({
            payload: new UpdateLaunchControls(input),
          }),
        ),
      meta: invalidates("admin.updateLaunchControls"),
    }),
  reviewWaitlistEntry: () =>
    mutationOptions({
      mutationKey: [...queryKeys.admin.all, "reviewWaitlistEntry"],
      mutationFn: (input: { id: string } & ReviewWaitlistEntryInput) =>
        api.run((c) =>
          c.admin.reviewWaitlistEntry({
            params: { id: WaitlistEntryId.make(input.id) },
            payload: new ReviewWaitlistEntry({ status: input.status }),
          }),
        ),
      meta: invalidates("admin.reviewWaitlistEntry"),
    }),
  /** Session only; first-come, first-served: the caller becomes the first admin. */
  completeBootstrap: () =>
    mutationOptions({
      mutationKey: [...queryKeys.admin.all, "completeBootstrap"],
      mutationFn: (input: CompleteBootstrapInput) =>
        api.run((c) =>
          c.admin.completeBootstrap({ payload: new CompleteBootstrap(input) }),
        ),
      meta: invalidates("admin.completeBootstrap"),
    }),
  updateUserRole: () =>
    mutationOptions({
      mutationKey: [...queryKeys.admin.all, "updateUserRole"],
      mutationFn: (input: { userId: string } & UpdateUserRoleInput) =>
        api.run((c) =>
          c.admin.updateUserRole({
            params: { userId: UserId.make(input.userId) },
            payload: new UpdateUserRole({ role: input.role }),
          }),
        ),
      meta: invalidates("admin.updateUserRole"),
    }),
});
