---
"create-gmacko-app": minor
"@gmacko/api-client": minor
---

The app is an OAuth 2.1 authorization server for its (coming) remote MCP endpoint, with `@better-auth/oauth-provider`.

- MCP clients register themselves (dynamic client registration; loopback and custom-scheme redirects are inferred as native clients, so Claude Code and Cursor can), then run authorization code + PKCE with `resource=<app>/mcp`. Discovery is at `/.well-known/oauth-authorization-server` (and `/api/auth` path-inserted).
- After sign-in (`/oauth/sign-in`, any sign-in method) the user picks one workspace (`/oauth/workspace`, backed by the session-only `oauth.workspaces` / `oauth.selectWorkspace` endpoints) and then the scopes (`/oauth/consent`; only OAuth-grantable catalog scopes are offered, the reads pre-ticked). The grant and every token from it are pinned to that workspace.
- Tokens are opaque (`gmo_` access, `gmr_` refresh) and stored as sha256 hex like API keys. Registration and the browser endpoints count against the `auth` rate limit. The token, revoke and introspect endpoints are keyed by OAuth client and address, so a hosted MCP client's users don't share one bucket.
- New tables (one migration, `CREATE TABLE` only): the plugin's `oauth_*` tables and `oauth_workspace_selection`.
- `@gmacko/ui` adds `ScopePicker`, `OAuthWorkspacePicker` and `OAuthConsentCard`. `@gmacko/api-client` adds `queries.oauth.workspaces` and `mutations.oauth.selectWorkspace`.
