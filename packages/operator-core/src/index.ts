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
import { Option, Schema } from "effect";

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

/**
 * JSON Schema (draft 2020-12) for a tool's arguments, as the MCP tool list
 * carries it: a JSON object with the three keywords a tool list must spell
 * out, plus whatever else the generator emitted (`$defs`, `title`, …).
 */
export interface OperatorToolInputSchema extends Schema.JsonObject {
  readonly type: "object";
  readonly properties: Schema.JsonObject;
  readonly required: ReadonlyArray<string>;
}

/**
 * The arguments a tool is called with, before validation: CLI flag values
 * (always strings) or an MCP client's `arguments` object, which is JSON.
 */
export type OperatorToolArguments = Readonly<Record<string, Schema.Json>>;

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

/**
 * A JSON Schema document is JSON, so it is read back through JSON schemas
 * rather than probed with `typeof`. `asJsonObject` throws on anything that is
 * not an object, which for the generator's own output cannot happen.
 */
const asJsonObject = Schema.decodeUnknownSync(Schema.JsonObject);
/** The generator emits a bare `$ref` root for a class-backed contract schema. */
const readRootRef = Schema.decodeUnknownOption(
  Schema.Struct({ $ref: Schema.String }),
);
/** The keywords a tool's root node must carry for the tool list. */
const readObjectNode = Schema.decodeUnknownOption(
  Schema.Struct({
    type: Schema.Literal("object"),
    properties: Schema.optional(Schema.JsonObject),
    required: Schema.optional(Schema.Array(Schema.String)),
  }),
);

/**
 * The contract schema's JSON Schema, with its root definition inlined (the
 * document refers to a named definition for a class) and any remaining
 * definitions kept under `$defs` so nested references stay valid.
 */
const inputSchemaOf = (schema: Schema.Top): OperatorToolInputSchema => {
  if (schema === NoInput) return NO_INPUT_SCHEMA;
  const document = Schema.toJsonSchemaDocument(schema);
  const definitions = new Map<string, Schema.Json>(
    Object.entries(asJsonObject(document.definitions)),
  );
  let root: Schema.Json = asJsonObject(document.schema);
  const ref = readRootRef(root);
  if (Option.isSome(ref) && ref.value.$ref.startsWith("#/$defs/")) {
    const name = ref.value.$ref.slice("#/$defs/".length);
    root = definitions.get(name) ?? null;
    definitions.delete(name);
  }
  const node = readObjectNode(root);
  if (Option.isNone(node)) {
    throw new Error("operator tool input schemas must be objects");
  }
  const { properties = {}, required = [] } = node.value;
  const inputSchema: OperatorToolInputSchema = {
    ...asJsonObject(root),
    type: "object",
    properties,
    required,
  };
  return definitions.size === 0
    ? inputSchema
    : { ...inputSchema, $defs: Object.fromEntries(definitions) };
};

/** The JSON Schema `type` keywords a CLI string is coerced through. */
const readCoercibleNode = Schema.decodeUnknownOption(
  Schema.Struct({
    type: Schema.Literals(["array", "boolean", "integer", "number"]),
  }),
);
/** MCP clients send typed JSON; only CLI flag values arrive as strings. */
const readString = Schema.decodeUnknownOption(Schema.String);

/** One CLI flag value, read as the JSON type its property declares. */
const coerceValue = (
  value: string,
  type: "array" | "boolean" | "integer" | "number",
): Schema.Json => {
  switch (type) {
    case "array":
      return value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    case "boolean":
      return value === "true" ? true : value === "false" ? false : value;
    case "integer":
    case "number": {
      const parsed = Number(value.trim());
      return value.trim() !== "" && Number.isFinite(parsed) ? parsed : value;
    }
  }
};

/**
 * CLI flags arrive as strings (`--permissions read,write`,
 * `--expiresInDays 30`); MCP clients send JSON. Strings are coerced to what
 * the property's JSON Schema says (array, integer/number, boolean) before
 * validation, so both callers use the same argument names. A value the
 * property does not declare a coercible type for is passed through untouched.
 */
const coerceArguments = (
  schema: OperatorToolInputSchema,
  args: OperatorToolArguments,
) => {
  const coerced: Record<string, Schema.Json> = {};
  for (const [key, value] of Object.entries(args)) {
    const text = readString(value);
    const property = readCoercibleNode(schema.properties[key]);
    coerced[key] =
      Option.isSome(text) && Option.isSome(property)
        ? coerceValue(text.value, property.value.type)
        : value;
  }
  return coerced;
};

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/**
 * A contract schema a tool's arguments can be decoded through: it decodes
 * from `unknown` and needs no services to do it.
 */
type ToolInput = Schema.Top & Schema.ConstraintDecoder<unknown>;

interface Tool<S extends ToolInput> {
  readonly name: string;
  readonly description: string;
  readonly input: S;
  readonly execute: (
    client: OperatorClient,
    input: S["Type"],
  ) => Promise<string>;
}

/**
 * A tool with its input schema derived and its own decoder closed over, so
 * the payload type never has to be recovered from the list at call time.
 */
interface OperatorTool extends OperatorToolDefinition {
  readonly run: (
    client: OperatorClient,
    args: OperatorToolArguments,
  ) => Promise<string>;
}

const tool = <S extends ToolInput>(definition: Tool<S>): OperatorTool => {
  const inputSchema = inputSchemaOf(definition.input);
  const decode = Schema.decodeUnknownSync(definition.input, {
    onExcessProperty: "error",
  });
  return {
    name: definition.name,
    description: definition.description,
    inputSchema,
    run: (client, args) => {
      let input: S["Type"];
      try {
        input = decode(coerceArguments(inputSchema, args));
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`Invalid arguments for ${definition.name}: ${detail}`);
      }
      return definition.execute(client, input);
    },
  };
};

const pretty = <A>(value: A): string => JSON.stringify(value, null, 2);

/** `NotFound` for the tool's own resource becomes a message; anything else propagates. */
const notFoundAs =
  (resource: NotFound["resource"], message: string) =>
  (cause: unknown): string => {
    if (cause instanceof NotFound && cause.resource === resource)
      return message;
    throw cause;
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
];

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
  operatorTools.map(({ name, description, inputSchema }) => ({
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
  args: OperatorToolArguments = {},
): Promise<string> => {
  const entry = operatorTools.find((candidate) => candidate.name === name);
  if (entry === undefined) throw new Error(`Unknown tool: ${name}`);
  return entry.run(client, args);
};
