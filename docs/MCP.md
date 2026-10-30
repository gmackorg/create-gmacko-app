# Remote MCP server

The web app serves a remote [MCP](https://modelcontextprotocol.io) endpoint at
`/mcp`, protected by the app's own OAuth 2.1 authorization server. Point an MCP
client (Claude, Claude Code, Cursor, the MCP Inspector) at `<app>/mcp`. It
registers itself, sends you through sign-in, a workspace pick and consent, and
then calls the operator tools as you, in that one workspace, limited to the
scopes you allowed.

The stdio server (`packages/mcp-server`, `pnpm mcp:app`, `GMACKO_API_KEY`) is
separate and unchanged; it is part of the optional operator lane.

## How a client connects

1. `POST /mcp` without a token gets `401` and
   `WWW-Authenticate: Bearer resource_metadata="<app>/.well-known/oauth-protected-resource/mcp"`.
2. The client reads that metadata (RFC 9728), then the authorization server's
   (`/.well-known/oauth-authorization-server/api/auth`; RFC 8414), and registers
   itself (dynamic client registration, no credentials). Loopback and
   custom-scheme redirect URIs register as native clients.
3. It sends you to `/api/auth/oauth2/authorize` with PKCE and
   `resource=<app>/mcp`:
   - `/oauth/sign-in` if you are not signed in (any sign-in method);
   - `/oauth/workspace`: pick the **one** workspace the connection may reach;
   - `/oauth/consent`: untick any scope you do not want to give it. Only
     OAuth-grantable scopes are offered, with the reads pre-ticked.
4. The client exchanges the code for an opaque access token (`gmo_…`, one
   hour) and, if it asked for `offline_access`, a refresh token (`gmr_…`).

## What a token can do

- `tools/list` returns only the tools whose scope the grant holds. Public tools
  (`auth_help`, `list_posts`, `get_post`) are always listed.
- A tool call runs through the app's HTTP API in-process. The API checks the
  scope again and treats the pinned workspace as the current workspace for that
  request, so `get_workspace_context` and `get_billing_overview` answer for the
  pinned workspace, and workspace role checks use your role there.
- A tool outside the grant returns an MCP error result naming the missing scope.
- The token is not a credential for the REST API on its own: `/api/*` answers
  `401` to a `gmo_` bearer that did not come through `/mcp`.
- `api_keys:manage`, `workspace:join` and `platform:admin` are key-only. No
  OAuth client can be granted them.

The scope catalog is `packages/domain/src/scopes.ts`, rendered in
[`docs/API_AUTH.md`](./API_AUTH.md#scopes).

## When a token stops working

- It expires (one hour; the client refreshes it with its refresh token).
- You disconnect the app in **Settings → Connected apps**. That revokes its
  access and refresh tokens at once.
- You leave the pinned workspace, or it is deleted.
- The browser session that approved it expires. Signing out does not end it.
- Its client is disabled.

The client answers each of these by sending you through the flow again.

## Local development

Under `pnpm dev` the endpoint is `https://gmacko.localhost/mcp`. To try it with
the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
# Transport: Streamable HTTP, URL: https://gmacko.localhost/mcp, then "Connect"
```

Sign in with the emulated GitHub when the browser opens. You need a workspace
to connect: completing the app's first-run bootstrap as the first user creates
one, and invites add others.

## Operational notes

- **Rate limits.** Registration and the browser endpoints count against the
  `auth` scope, keyed by IP. The token, revoke and introspect endpoints are
  keyed by OAuth client and IP, so the users of one hosted MCP client do not
  share a bucket. A hosted client registering for many users from a few IPs can
  still reach the registration limit; raise `RATE_LIMIT_AUTH` in
  `wrangler.jsonc` if that happens.
- **No CORS.** `/mcp` and the OAuth endpoints send no CORS headers. Desktop
  clients and hosted clients (which call from their servers) do not need them;
  a browser-only client would.
- **Storage.** better-auth's `oauth_*` tables hold clients, consents and tokens
  (as sha256 hashes); `oauth_workspace_selection` holds the in-progress
  workspace pick per browser session.
