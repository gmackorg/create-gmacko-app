/**
 * `@gmacko/operator-core`: the tools the operator CLI (`gmacko-ops`) and the
 * MCP server share, over `@gmacko/api-client` with a bearer key. Each tool's
 * input schema is derived from the contract's own payload schema
 * (`Schema.toJsonSchemaDocument`), and arguments are validated through that
 * schema before any request is made, so the CLI, the MCP server and the API
 * cannot disagree about a payload.
 */
import {
  type ApiClient,
  makeApiClient,
  type Transport,
} from "@gmacko/api-client";
import {
  ApiKeyId,
  CreateApiKey,
  CreatePost,
  NotFound,
  PostId,
  UpdatePreferences,
} from "@gmacko/domain";
import { Schema } from "effect";

export interface OperatorClientOptions {
  /** Origin of the API, e.g. `http://localhost:3001` (`GMACKO_API_URL`). */
  readonly baseUrl: string;
  /** A `gmk_` key (`GMACKO_API_KEY`); omitted for the public tools. */
  readonly apiKey?: string | undefined;
  /** Where requests go; defaults to `fetch`. Tests pass the in-process handler. */
  readonly transport?: Transport | undefined;
  readonly fetch?: typeof globalThis.fetch | undefined;
}

export type OperatorClient = ApiClient;

/** JSON Schema (draft 2020-12) for a tool's arguments, as the MCP tool list carries it. */
export interface OperatorToolInputSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required: ReadonlyArray<string>;
  readonly [key: string]: unknown;
}

export interface OperatorToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: OperatorToolInputSchema;
}

const OPERATOR_LOGIN_GUIDANCE = [
  "Primary auth path: browser-based OAuth or magic-link sign-in from the web app.",
  "Automation path: create an API key in Settings and export GMACKO_API_KEY.",
  "Reads need a key with the read scope, writes the write scope, deletes the delete scope.",
  "Creating and revoking API keys (create_api_key, revoke_api_key) needs a key with the admin scope.",
  "The operator lane is a wrapper around the app's HTTP API (@gmacko/api-client), not a standalone auth server.",
].join(" ");

// ---------------------------------------------------------------------------
// Input schemas from the contract
// ---------------------------------------------------------------------------

/**
 * The empty argument object, for tools that take none. Its JSON Schema is
 * spelled out: the generator describes an empty struct as "object or
 * array", which is not what a tool list should say.
 */
const NoInput = Schema.Struct({});
const NO_INPUT_SCHEMA: OperatorToolInputSchema = {
  type: "object",
  properties: {},
  required: [],
};

/** `{ id }` for tools addressing one resource; the contract's branded id. */
const PostIdInput = Schema.Struct({ id: PostId });
const ApiKeyIdInput = Schema.Struct({ id: ApiKeyId });

type JsonObject = Readonly<Record<string, unknown>>;

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The contract schema's JSON Schema, with its root definition inlined (the
 * document refers to a named definition for a class) and any remaining
 * definitions kept under `$defs` so nested references stay valid.
 */
const inputSchemaOf = (schema: Schema.Top): OperatorToolInputSchema => {
  if (schema === NoInput) return NO_INPUT_SCHEMA;
  const document = Schema.toJsonSchemaDocument(schema);
  const definitions: Record<string, unknown> = { ...document.definitions };
  let root: unknown = document.schema;
  const ref = isJsonObject(root) ? root.$ref : undefined;
  if (typeof ref === "string" && ref.startsWith("#/$defs/")) {
    const name = ref.slice("#/$defs/".length);
    root = definitions[name];
    delete definitions[name];
  }
  if (!isJsonObject(root) || root.type !== "object") {
    throw new Error("operator tool input schemas must be objects");
  }
  const properties = isJsonObject(root.properties) ? root.properties : {};
  const required = Array.isArray(root.required)
    ? (root.required as ReadonlyArray<string>)
    : [];
  return {
    ...root,
    type: "object",
    properties,
    required,
    ...(Object.keys(definitions).length > 0 ? { $defs: definitions } : {}),
  };
};

/**
 * CLI flags arrive as strings (`--permissions read,write`,
 * `--expiresInDays 30`); MCP clients send JSON. Strings are coerced to what
 * the property's JSON Schema says (array, integer/number, boolean) before
 * validation, so both callers use the same argument names.
 */
const coerceArguments = (
  schema: OperatorToolInputSchema,
  args: JsonObject,
): JsonObject => {
  const coerced: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    const property = schema.properties[key];
    if (typeof value !== "string" || !isJsonObject(property)) {
      coerced[key] = value;
      continue;
    }
    switch (property.type) {
      case "array":
        coerced[key] = value
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
        break;
      case "integer":
      case "number": {
        const parsed = Number(value.trim());
        coerced[key] =
          value.trim() !== "" && Number.isFinite(parsed) ? parsed : value;
        break;
      }
      case "boolean":
        coerced[key] =
          value === "true" ? true : value === "false" ? false : value;
        break;
      default:
        coerced[key] = value;
    }
  }
  return coerced;
};

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

interface Tool<S extends Schema.Top> {
  readonly name: string;
  readonly description: string;
  readonly input: S;
  readonly execute: (
    client: OperatorClient,
    input: S["Type"],
  ) => Promise<string>;
}

const tool = <S extends Schema.Top>(definition: Tool<S>): Tool<S> => definition;

const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

/** `NotFound` for the tool's own resource becomes a message; anything else propagates. */
const notFoundAs =
  (resource: NotFound["resource"], message: string) =>
  (error: unknown): string => {
    if (error instanceof NotFound && error.resource === resource)
      return message;
    throw error;
  };

const operatorTools = [
  tool({
    name: "auth_help",
    description: "Explain how to authenticate for CLI and MCP usage",
    input: NoInput,
    execute: async () => OPERATOR_LOGIN_GUIDANCE,
  }),
  tool({
    name: "get_workspace_context",
    description: "Get the current workspace and role context (key scope: read)",
    input: NoInput,
    execute: (client) =>
      client.run((c) => c.settings.workspaceContext()).then(pretty),
  }),
  tool({
    name: "get_billing_overview",
    description:
      "Get workspace billing, usage, and limits overview (key scope: read)",
    input: NoInput,
    execute: (client) =>
      client.run((c) => c.settings.billingOverview()).then(pretty),
  }),
  tool({
    name: "list_api_keys",
    description: "List active API keys for the current user (key scope: read)",
    input: NoInput,
    execute: (client) =>
      client.run((c) => c.settings.listApiKeys()).then(pretty),
  }),
  tool({
    name: "create_api_key",
    description:
      "Create a new API key for automation; the plaintext key is returned once (key scope: admin)",
    input: CreateApiKey,
    execute: (client, payload) =>
      client.run((c) => c.settings.createApiKey({ payload })).then(pretty),
  }),
  tool({
    name: "revoke_api_key",
    description: "Revoke an API key by ID (key scope: admin)",
    input: ApiKeyIdInput,
    execute: (client, { id }) =>
      client
        .run((c) => c.settings.revokeApiKey({ params: { id } }))
        .then(
          () => `API key ${id} revoked`,
          notFoundAs("apiKey", "API key not found"),
        ),
  }),
  tool({
    name: "list_posts",
    description: "List all posts from the application (public)",
    input: NoInput,
    execute: (client) => client.run((c) => c.posts.list()).then(pretty),
  }),
  tool({
    name: "get_post",
    description: "Get a specific post by ID (public)",
    input: PostIdInput,
    execute: (client, { id }) =>
      client
        .run((c) => c.posts.byId({ params: { id } }))
        .then(pretty, notFoundAs("post", "Post not found")),
  }),
  tool({
    name: "create_post",
    description: "Create a new post (key scope: write)",
    input: CreatePost,
    execute: (client, payload) =>
      client
        .run((c) => c.posts.create({ payload }))
        .then((post) => `Post created successfully: ${pretty(post)}`),
  }),
  tool({
    name: "delete_post",
    description: "Delete a post by ID (key scope: delete)",
    input: PostIdInput,
    execute: (client, { id }) =>
      client
        .run((c) => c.posts.remove({ params: { id } }))
        .then(
          () => "Post deleted successfully",
          notFoundAs("post", "Post not found"),
        ),
  }),
  tool({
    name: "get_preferences",
    description: "Get user preferences/settings (key scope: read)",
    input: NoInput,
    execute: (client) =>
      client.run((c) => c.settings.getPreferences()).then(pretty),
  }),
  tool({
    name: "update_preferences",
    description:
      "Update user preferences; only the keys given change (key scope: write)",
    input: UpdatePreferences,
    execute: (client, payload) =>
      client
        .run((c) => c.settings.updatePreferences({ payload }))
        .then((preferences) => `Preferences updated: ${pretty(preferences)}`),
  }),
] as const;

type AnyTool = (typeof operatorTools)[number];

const definitions: ReadonlyArray<OperatorToolDefinition & { tool: AnyTool }> =
  operatorTools.map((entry) => ({
    name: entry.name,
    description: entry.description,
    inputSchema: inputSchemaOf(entry.input),
    tool: entry,
  }));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const createOperatorClient = (
  options: OperatorClientOptions,
): OperatorClient =>
  makeApiClient({
    baseUrl: options.baseUrl,
    transport: options.transport,
    fetch: options.fetch,
    headers: () =>
      options.apiKey === undefined || options.apiKey === ""
        ? {}
        : { authorization: `Bearer ${options.apiKey}` },
  });

export const listOperatorTools = (): Array<OperatorToolDefinition> =>
  definitions.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));

/**
 * Runs one tool. Arguments are coerced (CLI strings) and validated against
 * the tool's contract schema first, rejecting with `Invalid arguments for
 * <tool>: ...` before any request; API failures reject with the contract's
 * typed error (its message names the reason: `Forbidden (scope)`,
 * `Authentication required`).
 */
export const executeOperatorTool = async (
  client: OperatorClient,
  name: string,
  args: Readonly<Record<string, unknown>> = {},
): Promise<string> => {
  const definition = definitions.find((entry) => entry.name === name);
  if (definition === undefined) throw new Error(`Unknown tool: ${name}`);
  const { tool: entry, inputSchema } = definition;
  let input: unknown;
  try {
    input = Schema.decodeUnknownSync(entry.input, {
      onExcessProperty: "error",
    })(coerceArguments(inputSchema, args));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid arguments for ${name}: ${detail}`);
  }
  return (entry.execute as Tool<Schema.Top>["execute"])(client, input);
};
