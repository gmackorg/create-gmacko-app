import { createFileRoute } from "@tanstack/react-router";

import { protectedResourceMetadataResponse } from "~/server/runtime";

/**
 * RFC 9728 protected-resource metadata at the bare path, for MCP clients
 * that look there; `oauth-protected-resource.$` serves the path-inserted
 * form the `/mcp` 401 points at.
 */
export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      GET: () => protectedResourceMetadataResponse(),
    },
  },
});
