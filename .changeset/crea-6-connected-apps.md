---
"create-gmacko-app": minor
"@gmacko/api-client": minor
---

"Connected apps" in Settings, plus docs and scaffolding for the remote MCP endpoint.

- Settings lists the apps connected through OAuth: the client, its pinned workspace, its scopes and when it connected. **Disconnect** deletes the consent and revokes every access and refresh token issued under it, in one batch. This is backed by the session-only `oauth.listConnections` and `oauth.revokeConnection` endpoints (`queries.oauth.listConnections`, `mutations.oauth.revokeConnection`) and the new `@gmacko/ui/connected-app-row`.
- `docs/MCP.md` covers connecting a client, what a token can do, when it stops working, local testing with the MCP Inspector, and operational notes (rate limits, no CORS). `docs/API_AUTH.md` documents OAuth tokens as an MCP-only credential.
- The scaffolder keeps `packages/operator-core` whenever the web app is generated, because `/mcp` serves its tools. `--operator-lane` now controls only the operator CLI and the stdio MCP server.
