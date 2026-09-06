import { createFileRoute } from "@tanstack/react-router";

import { apiHandler } from "~/server/runtime";

/**
 * Catch-all for the Effect HttpApi. More specific routes (/api/auth/$,
 * /api/webhooks/stripe) rank higher in TanStack Router, so they keep winning.
 */
export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      ANY: ({ request }) => apiHandler(request),
    },
  },
});
