#!/usr/bin/env node
import {
  createOperatorClient,
  executeOperatorTool,
  listOperatorTools,
} from "@gmacko/operator-core";

const HELP_TEXT = `gmacko-ops

CLI + MCP wrappers over the same tRPC API.

Usage:
  gmacko-ops tools
  gmacko-ops auth_help
  gmacko-ops get_workspace_context
  gmacko-ops get_billing_overview
  gmacko-ops list_api_keys
  gmacko-ops create_api_key --name <name> [--permissions read,write] [--expiresInDays 30]
  gmacko-ops revoke_api_key --id <api-key-id>
  gmacko-ops list_posts
  gmacko-ops get_post --id <post-id>
  gmacko-ops create_post --title <title> --content <content>
  gmacko-ops delete_post --id <post-id>
  gmacko-ops get_preferences
  gmacko-ops update_preferences [--theme <theme>] [--language <code>] [--timezone <tz>] [--emailNotifications true|false] [--pushNotifications true|false]

Environment:
  GMACKO_API_URL defaults to http://localhost:3000
  GMACKO_API_KEY is optional for public calls and required for protected calls

Notes:
  Use browser login in the app first, then create an API key for CLI or MCP automation.
  Workspace context, billing overview, usage, and limits are exposed through the same tRPC API as the MCP server.
`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (
    !command ||
    command === "--help" ||
    command === "-h" ||
    command === "help"
  ) {
    console.log(HELP_TEXT);
    return;
  }

  if (command === "tools") {
    console.log(JSON.stringify(listOperatorTools(), null, 2));
    return;
  }

  const args = parseFlags(rest);
  const client = createOperatorClient({
    apiKey: process.env.GMACKO_API_KEY,
    baseUrl: process.env.GMACKO_API_URL ?? "http://localhost:3000",
  });

  const output = await executeOperatorTool(client, command, args);
  console.log(output);
}

function parseFlags(argv: string[]): Record<string, boolean | string> {
  const parsed: Record<string, boolean | string> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token?.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    if (next === "true" || next === "false") {
      parsed[key] = next === "true";
    } else {
      parsed[key] = next;
    }

    index += 1;
  }

  return parsed;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Error: ${message}`);
  process.exit(1);
});
