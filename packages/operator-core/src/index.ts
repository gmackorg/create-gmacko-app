import type { CreateClientOptions, TRPCClient } from "@gmacko/trpc-client";
import { createClient } from "@gmacko/trpc-client";

export interface OperatorToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: readonly string[];
  };
}

const OPERATOR_LOGIN_GUIDANCE = [
  "Primary auth path: browser-based OAuth or magic-link sign-in from the web app.",
  "Automation path: create an API key in Settings and export GMACKO_API_KEY.",
  "Current operator lane is a wrapper around the app's tRPC API, not a standalone auth server.",
].join(" ");

const operatorTools = [
  {
    name: "auth_help",
    description: "Explain how to authenticate for CLI and MCP usage",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
    execute: async () => OPERATOR_LOGIN_GUIDANCE,
  },
  {
    name: "get_workspace_context",
    description: "Get the current workspace and role context",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
    execute: async (client: TRPCClient) => {
      const context = await client.settings.getWorkspaceContext.query();
      return JSON.stringify(context, null, 2);
    },
  },
  {
    name: "get_billing_overview",
    description: "Get workspace billing, usage, and limits overview",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
    execute: async (client: TRPCClient) => {
      const overview = await client.settings.getBillingOverview.query();
      return JSON.stringify(overview, null, 2);
    },
  },
  {
    name: "list_api_keys",
    description: "List active API keys for the current user",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
    execute: async (client: TRPCClient) => {
      const keys = await client.settings.listApiKeys.query();
      return JSON.stringify(keys, null, 2);
    },
  },
  {
    name: "create_api_key",
    description: "Create a new API key for automation",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Human-readable API key name",
        },
        permissions: {
          type: "string",
          description: "Comma-separated permissions like read,write",
        },
        expiresInDays: {
          type: "string",
          description: "Optional number of days before expiry",
        },
      },
      required: ["name"],
    },
    execute: async (client: TRPCClient, args: Record<string, unknown>) => {
      const result = await client.settings.createApiKey.mutate({
        name: getRequiredString(args, "name"),
        permissions: parsePermissions(args.permissions),
        expiresInDays: parseOptionalInteger(args.expiresInDays),
      });
      return JSON.stringify(result, null, 2);
    },
  },
  {
    name: "revoke_api_key",
    description: "Revoke an API key by ID",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The API key ID to revoke",
        },
      },
      required: ["id"],
    },
    execute: async (client: TRPCClient, args: Record<string, unknown>) => {
      const result = await client.settings.revokeApiKey.mutate({
        id: getRequiredString(args, "id"),
      });
      return JSON.stringify(result, null, 2);
    },
  },
  {
    name: "list_posts",
    description: "List all posts from the application",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
    execute: async (client: TRPCClient) => {
      const posts = await client.post.all.query();
      return JSON.stringify(posts, null, 2);
    },
  },
  {
    name: "get_post",
    description: "Get a specific post by ID",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The post ID",
        },
      },
      required: ["id"],
    },
    execute: async (client: TRPCClient, args: Record<string, unknown>) => {
      const post = await client.post.byId.query({
        id: getRequiredString(args, "id"),
      });
      return post ? JSON.stringify(post, null, 2) : "Post not found";
    },
  },
  {
    name: "create_post",
    description: "Create a new post",
    inputSchema: {
      type: "object" as const,
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
    execute: async (client: TRPCClient, args: Record<string, unknown>) => {
      const result = await client.post.create.mutate({
        title: getRequiredString(args, "title"),
        content: getRequiredString(args, "content"),
      });
      return `Post created successfully: ${JSON.stringify(result, null, 2)}`;
    },
  },
  {
    name: "delete_post",
    description: "Delete a post by ID",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The post ID to delete",
        },
      },
      required: ["id"],
    },
    execute: async (client: TRPCClient, args: Record<string, unknown>) => {
      await client.post.delete.mutate(getRequiredString(args, "id"));
      return "Post deleted successfully";
    },
  },
  {
    name: "get_preferences",
    description: "Get user preferences/settings",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
    execute: async (client: TRPCClient) => {
      const preferences = await client.settings.getPreferences.query();
      return JSON.stringify(preferences, null, 2);
    },
  },
  {
    name: "update_preferences",
    description: "Update user preferences",
    inputSchema: {
      type: "object" as const,
      properties: {
        theme: {
          type: "string",
          enum: ["light", "dark", "system"],
        },
        language: {
          type: "string",
        },
        timezone: {
          type: "string",
        },
        emailNotifications: {
          type: "boolean",
        },
        pushNotifications: {
          type: "boolean",
        },
      },
      required: [],
    },
    execute: async (client: TRPCClient, args: Record<string, unknown>) => {
      const result = await client.settings.updatePreferences.mutate(
        normalizePreferenceArgs(args),
      );
      return `Preferences updated: ${JSON.stringify(result, null, 2)}`;
    },
  },
] as const;

export function createOperatorClient(options: CreateClientOptions): TRPCClient {
  return createClient(options);
}

export function listOperatorTools(): OperatorToolDefinition[] {
  return operatorTools.map(({ description, inputSchema, name }) => ({
    description,
    inputSchema,
    name,
  }));
}

export async function executeOperatorTool(
  client: TRPCClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  const tool = operatorTools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return tool.execute(client, args);
}

function getRequiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required string argument: ${key}`);
  }
  return value;
}

function normalizePreferenceArgs(args: Record<string, unknown>) {
  const payload: Record<string, boolean | string> = {};

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "boolean" || typeof value === "string") {
      payload[key] = value;
    }
  }

  return payload;
}

function parsePermissions(
  value: unknown,
): Array<"read" | "write" | "delete" | "admin"> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return ["read"];
  }

  return value
    .split(",")
    .map((permission) => permission.trim())
    .filter(
      (permission): permission is "read" | "write" | "delete" | "admin" =>
        permission === "read" ||
        permission === "write" ||
        permission === "delete" ||
        permission === "admin",
    );
}

function parseOptionalInteger(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
