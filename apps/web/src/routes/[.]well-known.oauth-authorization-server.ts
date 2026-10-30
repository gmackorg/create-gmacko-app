import { createFileRoute } from "@tanstack/react-router";

import { authServerMetadataHandler } from "~/server/runtime";

/**
 * OAuth authorization-server metadata at the bare well-known path, where
 * MCP clients that predate RFC 8414 path insertion look for it. The issuer
 * is `/api/auth`; `oauth-authorization-server.$` serves the inserted form.
 */
export const Route = createFileRoute("/.well-known/oauth-authorization-server")(
  {
    server: {
      handlers: {
        GET: ({ request }) => authServerMetadataHandler(request),
      },
    },
  },
);
