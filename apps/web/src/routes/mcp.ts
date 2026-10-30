import { createFileRoute } from "@tanstack/react-router";

import { mcpHandler } from "~/server/runtime";

/**
 * The remote MCP endpoint (Streamable HTTP, stateless). Authentication and
 * the protocol live in `~/server/mcp`; an MCP client is pointed at
 * `<app>/mcp` and discovers the OAuth flow from the 401 it gets first.
 */
export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: ({ request }) => mcpHandler(request),
    },
  },
});
