---
"create-gmacko-app": minor
---

The web app serves a remote MCP endpoint at `/mcp` (Streamable HTTP, stateless, JSON responses), protected by its own OAuth provider.

- An unauthenticated request gets a 401 with `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/mcp"`, which is how MCP clients discover the OAuth flow. RFC 9728 metadata is served at that path and at the bare `/.well-known/oauth-protected-resource`.
- `tools/list` returns only the operator tools the grant's scopes can call. A tool call goes through the app's own HTTP API in-process with the bearer forwarded, so the API middleware checks the scope again and pins the request to the grant's workspace, which replaces the default workspace for that request. A tool outside the grant is an `isError` result naming the missing scope.
- `RequireScope` accepts `gmo_` OAuth access tokens (`CurrentUser.credential` is `"oauth"`), but only on requests `/mcp` dispatches: the token is not a credential for the REST API on its own. A token stops working when it expires or is revoked, when its client is disabled, when the session that approved it expires, or when the user leaves the pinned workspace.
- The stdio `gmacko-mcp` server and its `GMACKO_API_KEY` auth are unchanged.
