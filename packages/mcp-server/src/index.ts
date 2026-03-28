#!/usr/bin/env node
import {
  createOperatorClient,
  executeOperatorTool,
  listOperatorTools,
} from "@gmacko/operator-core";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_URL = process.env.GMACKO_API_URL ?? "http://localhost:3000";
const API_KEY = process.env.GMACKO_API_KEY;

if (!API_KEY) {
  console.error("Error: GMACKO_API_KEY environment variable is required");
  process.exit(1);
}

const operatorClient = createOperatorClient({
  apiKey: API_KEY,
  baseUrl: API_URL,
});

const server = new Server(
  {
    name: "gmacko-app",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, () => {
  return {
    tools: listOperatorTools(),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const text = await executeOperatorTool(operatorClient, name, args ?? {});
    return {
      content: [
        {
          type: "text",
          text,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [
        {
          type: "text",
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("gmacko-app MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
