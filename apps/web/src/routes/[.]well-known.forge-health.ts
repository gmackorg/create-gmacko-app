import { createFileRoute } from "@tanstack/react-router";

import { apiHandler } from "~/server/runtime";

/**
 * ForgeGraph's probe lives outside `/api`, so the `/api/$` catch-all cannot
 * reach it; this route hands the request to the same HttpApi handler, where
 * `HealthApi.forge` owns the absolute path. (`[.]` escapes the dot in the
 * file name for TanStack's file router.)
 */
export const Route = createFileRoute("/.well-known/forge-health")({
  server: {
    handlers: {
      GET: ({ request }) => apiHandler(request),
    },
  },
});
