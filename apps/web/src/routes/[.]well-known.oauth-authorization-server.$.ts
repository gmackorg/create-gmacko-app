import { createFileRoute } from "@tanstack/react-router";

import { authServerMetadataHandler } from "~/server/runtime";

/**
 * RFC 8414 metadata with the issuer's path inserted
 * (`/.well-known/oauth-authorization-server/api/auth`). Only the issuer's
 * own path is served; anything else under the prefix is not ours.
 */
export const Route = createFileRoute(
  "/.well-known/oauth-authorization-server/$",
)({
  server: {
    handlers: {
      GET: ({ request }) =>
        new URL(request.url).pathname ===
        "/.well-known/oauth-authorization-server/api/auth"
          ? authServerMetadataHandler(request)
          : new Response("Not Found", { status: 404 }),
    },
  },
});
