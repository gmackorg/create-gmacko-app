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
});
