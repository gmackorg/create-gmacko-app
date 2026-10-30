import { createFileRoute } from "@tanstack/react-router";

import { protectedResourceMetadataResponse } from "~/server/runtime";

/** RFC 9728 metadata for `/mcp`, path-inserted: `.../oauth-protected-resource/mcp`. */
export const Route = createFileRoute("/.well-known/oauth-protected-resource/$")(
  {
    server: {
      handlers: {
        GET: ({ request }) =>
          new URL(request.url).pathname ===
          "/.well-known/oauth-protected-resource/mcp"
            ? protectedResourceMetadataResponse()
            : new Response("Not Found", { status: 404 }),
      },
    },
  },
);
