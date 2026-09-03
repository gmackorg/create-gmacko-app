import {
  createOperatorClient,
  executeOperatorTool,
  listOperatorTools,
  type OperatorClientOptions,
} from "@gmacko/operator-core";

const PROTECTED_TOOL_ERROR =
  "GMACKO_API_KEY environment variable is required for protected operator tools";

/**
 * The MCP server's view of the operator lane: the tool list (input schemas
 * derived from the API contract) and one call. Every tool but `auth_help`
 * needs `GMACKO_API_KEY`; creating or revoking keys needs one with the
 * `admin` scope.
 */
export function createOperatorExecutor(options: {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  /** Test seam: the in-process API handler instead of `fetch`. */
  transport?: OperatorClientOptions["transport"];
}) {
  const client = createOperatorClient({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl ?? "http://localhost:3000",
    transport: options.transport,
  });

  return {
    callTool(name: string, args: Record<string, unknown> = {}) {
      if (!options.apiKey && name !== "auth_help") {
        throw new Error(PROTECTED_TOOL_ERROR);
      }

      return executeOperatorTool(client, name, args);
    },
    listTools() {
      return listOperatorTools();
    },
  };
}
