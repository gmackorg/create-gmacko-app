import { queryOptions } from "@tanstack/react-query";

import type { ApiClient } from "../client";
import { queryKeys } from "./keys";

/** All public. `ready`, `full` and `forge` reject with their 503 tagged error while unhealthy. */
export const healthQueries = (api: ApiClient) => ({
  live: () =>
    queryOptions({
      queryKey: queryKeys.health.live(),
      queryFn: () => api.run((c) => c.health.live()),
    }),
  ready: () =>
    queryOptions({
      queryKey: queryKeys.health.ready(),
      queryFn: () => api.run((c) => c.health.ready()),
    }),
  full: () =>
    queryOptions({
      queryKey: queryKeys.health.full(),
      queryFn: () => api.run((c) => c.health.full()),
    }),
  forge: () =>
    queryOptions({
      queryKey: queryKeys.health.forge(),
      queryFn: () => api.run((c) => c.health.forge()),
    }),
});

export const healthMutations = (_api: ApiClient) => ({});
