# @gmacko/api-cli

`gmacko-ops`: the operator CLI over `@gmacko/operator-core`, which calls the
app's HTTP API through `@gmacko/api-client` with a bearer key. The MCP server
(`@gmacko/mcp-server`) exposes the same tools.

```bash
pnpm api:ops -- --help
GMACKO_API_KEY=gmk_... pnpm api:ops -- get_workspace_context
GMACKO_API_KEY=gmk_... pnpm api:ops -- create_api_key --name ci --permissions profile:read,posts:write --expiresInDays 30
```

## Environment

- `GMACKO_API_URL` — the API origin; defaults to `http://localhost:3001`.
- `GMACKO_API_KEY` — a `gmk_` key from Settings. Public tools (`list_posts`,
  `get_post`, `auth_help`) work without one.

## Key scopes

| Scope               | Tools                                |
| ------------------- | ------------------------------------ |
| `workspace:read`    | `get_workspace_context`              |
| `billing:read`      | `get_billing_overview`               |
| `api_keys:read`     | `list_api_keys`                      |
| `api_keys:manage`   | `create_api_key`, `revoke_api_key`   |
| `posts:write`       | `create_post`                        |
| `posts:delete`      | `delete_post`                        |
| `preferences:read`  | `get_preferences`                    |
| `preferences:write` | `update_preferences`                 |

Each tool's description names its scope too. The full catalog is in
`docs/API_AUTH.md`. Creating and revoking keys needs `api_keys:manage` (a session
in the web app always may). Deleting the account is session-only and has no
tool.

## Arguments

Flags are strings; each tool coerces them through its input schema, which is
derived from the API contract (`Schema.toJsonSchemaDocument` over the payload
schema in `@gmacko/domain`): comma-separated lists become arrays, numbers
become integers, `true`/`false` become booleans. Invalid arguments are refused
before any request (`Invalid arguments for <tool>: ...`).
