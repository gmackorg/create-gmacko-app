/**
 * The remote MCP endpoint (`/mcp`): Streamable HTTP, stateless, JSON
 * responses, protected by the app's own OAuth provider.
 *
 * - No bearer, or a bad one: 401 with `WWW-Authenticate: Bearer
 *   resource_metadata=...` (RFC 9728), which is how an MCP client finds the
 *   authorization server and starts the OAuth flow.
 * - A valid `gmo_` token: the operator tools (`@gmacko/operator-core`),
 *   listed only when the grant holds their scope. A call goes through the
 *   app's own HTTP API in-process, bearer forwarded, with `OAuthResource` in
 *   the dispatch context — so the API middleware checks the scope again and
 *   pins the request to the grant's workspace (packages/auth middleware.ts,
 *   rule 7).
 *
 * Pure: the token check and the API dispatch are injected, so the suite
 * runs the real MCP server without a Worker (runtime.ts binds them).
 */
import type { AuthenticatedOAuthToken } from "@gmacko/auth/oauth-tokens";
import { OAUTH_SCOPES, type Scope } from "@gmacko/domain";
import {
  createOperatorClient,
  executeOperatorTool,
  listOperatorTools,
  operatorToolScope,
} from "@gmacko/operator-core";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Schema } from "effect";

export interface McpEndpoint {
  /** `<app>/mcp`: the token audience, and the resource in the metadata. */
  readonly resource: string;
  /** The OAuth provider's issuer (`<app>/api/auth`). */
  readonly issuer: string;
  /** `null` for any token that does not authenticate for `resource`. */
  readonly verify: (bearer: string) => Promise<AuthenticatedOAuthToken | null>;
  /** The app's API handler, dispatching as the `/mcp` endpoint. */
  readonly dispatch: (request: Request) => Promise<Response>;
  /** The app's origin, for the operator client's request URLs. */
  readonly baseUrl: string;
}

/** `offline_access` is advertised so clients ask for a refresh token. */
const SCOPES_SUPPORTED: ReadonlyArray<string> = [
  ...OAUTH_SCOPES,
  "offline_access",
];

/** RFC 9728 metadata URL for `resource` (path-inserted). */
export const resourceMetadataUrl = (resource: string): string => {
  const url = new URL(resource);
  return `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`;
};

/** RFC 9728 protected-resource metadata for `/mcp`. */
export const protectedResourceMetadata = (
  endpoint: Pick<McpEndpoint, "resource" | "issuer">,
) => ({
  resource: endpoint.resource,
  authorization_servers: [endpoint.issuer],
  scopes_supported: SCOPES_SUPPORTED,
  bearer_methods_supported: ["header"],
  resource_name: "MCP",
});

const challenge = (resource: string, invalid: boolean): Response =>
  new Response(
    JSON.stringify({
      error: invalid ? "invalid_token" : "unauthorized",
      error_description: invalid
        ? "The access token is invalid, expired, or not for this resource."
        : "Authorization required.",
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": [
          "Bearer",
          `resource_metadata="${resourceMetadataUrl(resource)}"`,
          ...(invalid ? ['error="invalid_token"'] : []),
        ].join(" "),
      },
    },
  );

/**
 * The server never validates a JSON Schema (no elicitation, no tool output
 * schemas); this stands in for the SDK's default, Ajv, whose compiler uses
 * `new Function`, which Workers refuse.
 */
const noSchemaValidation = {
  getValidator: () => () => ({
    valid: false as const,
    data: undefined,
    errorMessage: "JSON Schema validation is not available on this server",
  }),
};

/** MCP tool arguments arrive as a JSON object; decode before handing them on. */
const decodeArguments = Schema.decodeUnknownSync(
  Schema.Record(Schema.String, Schema.Json),
);

const textResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

/** A tool failure as MCP reports it: a result with `isError`, not a JSON-RPC error. */
const errorResult = (text: string) => ({ ...textResult(text), isError: true });

const buildServer = (
  endpoint: McpEndpoint,
  bearer: string,
  scopes: ReadonlyArray<Scope>,
) => {
  const server = new Server(
    { name: "gmacko-app", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      jsonSchemaValidator: noSchemaValidation,
    },
  );
  const client = createOperatorClient({
    baseUrl: endpoint.baseUrl,
    apiKey: bearer,
    transport: endpoint.dispatch,
  });

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: listOperatorTools({ scopes }),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const scope = operatorToolScope(name);
    if (scope === undefined) return errorResult(`Unknown tool: ${name}`);
    if (scope !== null && !scopes.includes(scope)) {
      return errorResult(
        `This connection was not granted the ${scope} scope. Connect again and allow it to use ${name}.`,
      );
    }
    try {
      return textResult(
        await executeOperatorTool(client, name, decodeArguments(args ?? {})),
      );
    } catch (error) {
      return errorResult(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  });

  return server;
};

/** The `/mcp` handler: authenticate, then one stateless MCP exchange. */
export const mcpRequestHandler =
  (endpoint: McpEndpoint) =>
  async (request: Request): Promise<Response> => {
    const header = request.headers.get("authorization");
    if (header === null) return challenge(endpoint.resource, false);
    const match = /^bearer\s+(\S+)$/i.exec(header.trim());
    const token =
      match?.[1] === undefined ? null : await endpoint.verify(match[1]);
    if (match?.[1] === undefined || token === null) {
      return challenge(endpoint.resource, true);
    }

    const server = buildServer(endpoint, match[1], token.scopes);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      await server.close();
    }
  };
