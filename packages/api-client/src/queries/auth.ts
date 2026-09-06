import { queryOptions } from "@tanstack/react-query";

import type { ApiClient } from "../client";
import { queryKeys } from "./keys";

/** `auth.session` is public: anonymous resolves to `{ user: null, credential: null }`, never 401. */
export const authQueries = (api: ApiClient) => ({
  session: () =>
    queryOptions({
      queryKey: queryKeys.auth.session(),
      queryFn: () => api.run((c) => c.auth.session()),
    }),
  secret: () =>
    queryOptions({
      queryKey: queryKeys.auth.secret(),
      queryFn: () => api.run((c) => c.auth.secret()),
    }),
});

export const authMutations = (_api: ApiClient) => ({});
