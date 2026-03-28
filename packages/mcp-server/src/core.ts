import {
  createOperatorClient,
  executeOperatorTool,
  listOperatorTools,
} from "@gmacko/operator-core";

const PROTECTED_TOOL_ERROR =
  "GMACKO_API_KEY environment variable is required for protected operator tools";

export function createOperatorExecutor(options: {
  apiKey?: string;
  baseUrl?: string;
}) {
  const client = createOperatorClient({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl ?? "http://localhost:3000",
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
