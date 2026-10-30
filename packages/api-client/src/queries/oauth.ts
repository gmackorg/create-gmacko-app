import { SelectOAuthWorkspace, WorkspaceId } from "@gmacko/domain";
import { mutationOptions, queryOptions } from "@tanstack/react-query";

import type { ApiClient } from "../client";
import { invalidates } from "./invalidation";
import { queryKeys } from "./keys";

/** The workspace picker of an OAuth authorization (`/oauth/workspace`). Session only. */
export const oauthQueries = (api: ApiClient) => ({
  workspaces: () =>
    queryOptions({
      queryKey: queryKeys.oauth.workspaces(),
      queryFn: () => api.run((c) => c.oauth.workspaces()),
    }),
  /** "Connected apps" in Settings: the user's OAuth grants. Session only. */
  listConnections: () =>
    queryOptions({
      queryKey: queryKeys.oauth.listConnections(),
      queryFn: () => api.run((c) => c.oauth.listConnections()),
    }),
});

export const oauthMutations = (api: ApiClient) => ({
  selectWorkspace: () =>
    mutationOptions({
      mutationKey: [...queryKeys.oauth.all, "selectWorkspace"],
      mutationFn: (workspaceId: string) =>
        api.run((c) =>
          c.oauth.selectWorkspace({
            payload: new SelectOAuthWorkspace({
              workspaceId: WorkspaceId.make(workspaceId),
            }),
          }),
        ),
      meta: invalidates("oauth.selectWorkspace"),
    }),
  revokeConnection: () =>
    mutationOptions({
      mutationKey: [...queryKeys.oauth.all, "revokeConnection"],
      mutationFn: (id: string) =>
        api.run((c) => c.oauth.revokeConnection({ params: { id } })),
      meta: invalidates("oauth.revokeConnection"),
    }),
});
