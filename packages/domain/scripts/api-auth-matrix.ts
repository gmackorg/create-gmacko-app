/**
 * Renders docs/API_AUTH.md, the credential matrix, from `AppApi` itself
 * (`HttpApi.reflect` through `inspectApi`), so the document cannot drift from
 * the contract. `pnpm -F @gmacko/domain docs:api-auth` rewrites it; the
 * api-auth-matrix test fails when the committed file is stale.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { HttpApi } from "effect/unstable/httpapi";

import { AppApi } from "../src/api";
import { type EndpointInfo, inspectApi } from "../src/inspect";

export const API_AUTH_PATH = fileURLToPath(
  new URL("../../../docs/API_AUTH.md", import.meta.url),
);

const GROUP_ORDER = ["health", "auth", "posts", "settings", "admin"] as const;

const cell = (value: string) => value.replaceAll("|", "\\|");

const row = (info: EndpointInfo): string =>
  `| ${[
    info.group,
    `\`${info.id}\``,
    info.method,
    `\`${cell(info.path)}\``,
    info.credential === "public" ? "public" : `\`${info.credential}\``,
    info.scope ?? "—",
    info.roles.length > 0 ? info.roles.map((r) => `\`${r}\``).join(", ") : "—",
    String(info.successStatus),
    info.errors.length > 0
      ? info.errors.map((e) => `${e.status} \`${e.tag}\``).join(", ")
      : "—",
  ].join(" | ")} |`;

/**
 * How packages/auth implements the declarations above (Phase 3). Static text:
 * these are facts about effect 4.0.0-rc.112 and better-auth, not something
 * the contract can reflect.
 */
const IMPLEMENTATION_RULES = [
  "## Implementation rules (Phase 3)",
  "",
  "The contract declares the credentials; packages/auth implements them. These rules follow from how",
  "effect 4.0.0-rc.112's `HttpApiBuilder` runs security middlewares and from better-auth's cookie handling.",
  "",
  "1. **Schemes run in declaration order and a missing cookie is not a failure.** `HttpApiBuilder` tries a",
  "   middleware's `security` entries in the order they were declared (`session` first, then `apiKey`) and",
  '   `securityDecode` yields `Redacted("")` for a cookie that is absent rather than failing. The `session`',
  "   scheme implementation therefore ignores the decoded credential and calls better-auth",
  "   `getSession({ headers })` on the raw request; an empty or invalid cookie ends in 401 `Unauthorized`.",
  "2. **Bearer takes precedence.** When an `Authorization: Bearer gmk_…` header is present the `session`",
  "   scheme refuses (fails with `Unauthorized`) instead of looking at the cookie, so an invalid, expired",
  "   or revoked key can never fall through to a valid cookie in the same request.",
  "3. **A bearer on a `Session`-only endpoint is `Forbidden(scope)`.** `Session` declares the cookie scheme",
  '   only; its implementation answers 403 `Forbidden({ reason: "scope" })` when a bearer header is present,',
  "   never 401, so the client learns the credential kind is wrong rather than missing.",
  "4. **The declared cookie name is the non-secure one.** OpenAPI shows `better-auth.session_token`. In",
  "   secure stages (https base URL: staging, production) better-auth writes `__Secure-better-auth.session_token`,",
  "   which the implementation reads from the raw `Cookie` header; `sessionCookieName(secure)` in",
  "   `packages/domain/src/security.ts` is the one place that spells both.",
  "5. **Role checks read D1, not the cookie cache.** `AdminOnly` reads `user.role` and `WorkspaceRole(min)`",
  "   reads the membership from D1 once per request with better-auth's cookie cache bypassed, so demoting a",
  "   user or removing a membership takes effect on their next request, not when the cookie expires.",
  "6. **The security middleware is declared last.** `HttpApiBuilder` wraps the handler with each middleware in",
  '   insertion order, so the last one declared runs outermost. `.middleware(AdminOnly).middleware(SessionOrKey("admin"))`',
  "   is the only order in which the role check sees the `CurrentUser` the credential provided; the",
  "   api.test.ts contract test asserts `securityIsOutermost` for every non-public endpoint.",
];

/** Contract decisions that are not visible in the matrix. */
const DECISIONS = [
  "## Decisions",
  "",
  "- `auth.session` (`GET /api/auth/session`) is public: an anonymous caller gets `{ user: null, credential: null }`",
  "  rather than 401, so the client can render signed-out state from one request.",
  "- `settings.deleteAccount` by a workspace owner cascades the workspace (memberships, invites, subscription,",
  "  usage). Documented here, not signalled: there is no `Conflict` for it.",
];

export const renderApiAuthMatrix = (
  api: HttpApi.Top = AppApi as unknown as HttpApi.Top,
): string => {
  const rows = [...inspectApi(api)].sort(
    (a, b) =>
      GROUP_ORDER.indexOf(a.group as (typeof GROUP_ORDER)[number]) -
      GROUP_ORDER.indexOf(b.group as (typeof GROUP_ORDER)[number]),
  );
  const counts = GROUP_ORDER.map(
    (group) => `${group} ${rows.filter((r) => r.group === group).length}`,
  ).join(", ");
  const publicRows = rows.filter((r) => r.credential === "public").length;
  const lines = [
    "# API authentication matrix",
    "",
    "<!-- Generated by packages/domain/scripts/api-auth-matrix.ts from AppApi. Do not edit by hand:",
    "     run `pnpm -F @gmacko/domain docs:api-auth`. The api-auth-matrix test fails when this file is stale. -->",
    "",
    "Every endpoint of `AppApi` (`packages/domain/src/api.ts`) names the credential it accepts. This table is",
    "read back out of the contract with `HttpApi.reflect`, so it is the contract, not a description of it.",
    "",
    `${rows.length} endpoints (${counts}); ${publicRows} public.`,
    "",
    "## Credentials",
    "",
    "| Credential | Accepts | Refuses with |",
    "| --- | --- | --- |",
    "| public | anything, including no credential | — |",
    "| `Session` | the better-auth session cookie (`better-auth.session_token`, `__Secure-` prefixed over https); on non-GET requests only when `Origin` is on the allowlist | 401 `Unauthorized` (no or invalid session), 403 `Forbidden(origin)`, 403 `Forbidden(scope)` for a bearer key |",
    "| `SessionOrKey(scope)` | the session cookie as above, **or** `Authorization: Bearer gmk_…` whose permissions include `scope` or `admin` | 401 `Unauthorized` (invalid, expired or revoked key: no fall-through to the cookie), 403 `Forbidden(scope)` (key lacks the scope), 403 `Forbidden(origin)` |",
    "",
    "Role middlewares run inside the credential middleware and read the `CurrentUser` it provided:",
    "",
    "| Role check | Requires | Refuses with |",
    "| --- | --- | --- |",
    '| `AdminOnly` | `user.role === "admin"`, read fresh (never from the cookie cache). A key\'s `admin` scope does not grant it. | 403 `Forbidden(role)` |',
    "| `WorkspaceRole(min)` | at least `min` (owner > admin > member) in the caller's current workspace | 403 `Forbidden(role)` |",
    "",
    "Rules of thumb: reads take `SessionOrKey(read)`, mutations `SessionOrKey(write)`, deletes `SessionOrKey(delete)`,",
    "everything under `/api/admin` `SessionOrKey(admin)` + `AdminOnly`. Minting and revoking API keys takes",
    "`SessionOrKey(admin)` so the operator CLI and MCP server can manage keys with a key. Deleting the account and",
    "completing bootstrap are `Session` only: a leaked key must never reach them.",
    "",
    "## Endpoints",
    "",
    "| Group | Endpoint | Method | Path | Credential | Key scope | Roles | Success | Errors |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(row),
    "",
    ...IMPLEMENTATION_RULES,
    "",
    ...DECISIONS,
    "",
  ];
  return lines.join("\n");
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  writeFileSync(API_AUTH_PATH, renderApiAuthMatrix());
  process.stdout.write(`wrote ${API_AUTH_PATH}\n`);
}
