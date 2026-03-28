#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { createOperatorExecutor } from "./core.js";

const operatorExecutor = createOperatorExecutor({
  apiKey: process.env.GMACKO_API_KEY,
  baseUrl: process.env.GMACKO_API_URL ?? "http://localhost:3000",
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
    tools: operatorExecutor.listTools(),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const text = await operatorExecutor.callTool(name, args ?? {});
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
