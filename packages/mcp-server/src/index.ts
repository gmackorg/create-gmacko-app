#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import superjson from "superjson";

const API_URL = process.env.GMACKO_API_URL ?? "http://localhost:3000";
const API_KEY = process.env.GMACKO_API_KEY;

if (!API_KEY) {
  console.error("Error: GMACKO_API_KEY environment variable is required");
  process.exit(1);
}

interface TrpcResponse<T> {
  result?: {
    data: T;
  };
  error?: {
    message: string;
    code: string;
  };
}

async function callTrpc<T>(path: string, input?: unknown): Promise<T> {
  const url = new URL(`/api/trpc/${path}`, API_URL);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      json: input ?? null,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as TrpcResponse<T>;

  if (data.error) {
    throw new Error(`tRPC Error (${data.error.code}): ${data.error.message}`);
  }

  if (!data.result) {
    throw new Error("Invalid tRPC response: missing result");
  }

  return superjson.deserialize(
    data.result as Parameters<typeof superjson.deserialize>[0],
  ) as T;
}

const server = new Server(
  {
    name: "create-gmacko-app-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_posts",
        description: "List all posts from the application",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_post",
        description: "Get a specific post by ID",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The post ID",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "create_post",
        description: "Create a new post",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "The post title (max 256 characters)",
            },
            content: {
              type: "string",
              description: "The post content",
            },
          },
          required: ["title", "content"],
        },
      },
      {
        name: "delete_post",
        description: "Delete a post by ID",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The post ID to delete",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "get_preferences",
        description: "Get user preferences/settings",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "update_preferences",
        description: "Update user preferences",
        inputSchema: {
          type: "object",
          properties: {
            theme: {
              type: "string",
              enum: ["light", "dark", "system"],
              description: "UI theme preference",
            },
            language: {
              type: "string",
              description: "Preferred language code (e.g., 'en', 'es')",
            },
            timezone: {
              type: "string",
              description:
                "Preferred timezone (e.g., 'UTC', 'America/New_York')",
            },
            emailNotifications: {
              type: "boolean",
              description: "Enable email notifications",
            },
            pushNotifications: {
              type: "boolean",
              description: "Enable push notifications",
            },
          },
          required: [],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_posts": {
        const posts = await callTrpc<unknown[]>("post.all");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(posts, null, 2),
            },
          ],
        };
      }

      case "get_post": {
        const post = await callTrpc<unknown>("post.byId", {
          id: (args as { id: string }).id,
        });
        return {
          content: [
            {
              type: "text",
              text: post ? JSON.stringify(post, null, 2) : "Post not found",
            },
          ],
        };
      }

      case "create_post": {
        const { title, content } = args as { title: string; content: string };
        const result = await callTrpc<unknown>("post.create", {
          title,
          content,
        });
        return {
          content: [
            {
              type: "text",
              text: `Post created successfully: ${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      case "delete_post": {
        await callTrpc<unknown>("post.delete", (args as { id: string }).id);
        return {
          content: [
            {
              type: "text",
              text: "Post deleted successfully",
            },
          ],
        };
      }

      case "get_preferences": {
        const prefs = await callTrpc<unknown>("settings.getPreferences");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(prefs, null, 2),
            },
          ],
        };
      }

      case "update_preferences": {
        const updates = args as Record<string, unknown>;
        const result = await callTrpc<unknown>(
          "settings.updatePreferences",
          updates,
        );
        return {
          content: [
            {
              type: "text",
              text: `Preferences updated: ${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
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
  console.error("create-gmacko-app MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
