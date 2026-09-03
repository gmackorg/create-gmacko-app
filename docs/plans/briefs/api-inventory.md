# tRPC API inventory (source for the Effect HttpApi contract, Phase 1)

Read-only survey of `/Volumes/dev/create-gmacko-app` (branch `fix/mobile-e2e-ios-scheme`, HEAD `c92f309`).
Everything below is transcribed from the code; line references are to the files named.

Source files:
- `packages/api/src/trpc.ts` (context, procedures, middleware)
- `packages/api/src/root.ts` (router composition: `admin`, `auth`, `post`, `settings`)
- `packages/api/src/router/auth.ts`, `post.ts`, `settings.ts`, `admin.ts`
- `packages/api/src/router/v1/index.ts` (pure re-export of the same routers under a "v1" name; no behaviour)
- `packages/api/src/openapi.ts`, `versioning.ts`, `middleware/{versioning,deprecation}.ts`
- `packages/db/src/schema.ts`, `packages/db/src/auth-schema.ts`, `packages/db/src/client.ts` (drizzle + postgres-js, `casing: "snake_case"`)
- `packages/validators/src/index.ts` (contains only an `unused` placeholder export — nothing to migrate)
- `packages/config/src/integrations.ts`
- `packages/auth/src/index.ts` (`isPlatformAdminRole`, `canManageWorkspace`)

Procedure count: **auth 2, post 4, settings 14, admin 11 = 31 procedures.**

---

## 0. Cross-cutting: context, procedure types, middleware

### `createTRPCContext({ headers, authApi })` — `packages/api/src/trpc.ts:84-124`

1. If `Authorization` header starts with `Bearer gmk_`, the key is validated (`validateApiKey`, lines 52-82):
   - `sha256(key)` hex → lookup `api_keys` where `keyHash = hash AND revokedAt IS NULL`, limit 1.
   - Reject if `expiresAt && expiresAt < now`.
   - **Side effect on every request** (including public procedures): `UPDATE api_keys SET lastUsedAt = now() WHERE id = keyRecord.id`.
   - Then loads the full `user` row by `apiKeys.userId`. Context becomes `{ authApi, session: { user: <drizzle user row>, session: null }, apiKeyAuth: { userId, permissions, keyId }, db }`.
2. **If the API key is invalid / expired / revoked / user missing, it silently falls through** to cookie/session auth (`authApi.getSession({ headers })`). There is no 401 for a bad key.
3. Otherwise `{ authApi, session: <better-auth session | null>, apiKeyAuth: null, db }`.

Session shapes (lines 18-42):
```ts
interface AuthUser { id: string; name: string; email: string; emailVerified: boolean; createdAt: Date; updatedAt: Date; image?: string | null }
interface SessionRecord { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }
type AuthSession = { user: AuthUser; session: SessionRecord | null } | null
```
Note: under API-key auth `session.user` is the **full drizzle `user` row** (includes `role: "user" | "admin"` and `image: string | null`); under cookie auth it is better-auth's user object, which is typed without `role` (the admin layout in Next casts `(session.user as { role?: string }).role`).

### Procedure builders (`trpc.ts:212-270`)

| builder | behaviour |
|---|---|
| `publicProcedure` | `timingMiddleware` only |
| `protectedProcedure` | `timingMiddleware` + throws `TRPCError{ code: "UNAUTHORIZED" }` (no message) when `!ctx.session?.user`. Accepts **either** a cookie session **or** any valid API key. **API-key permissions are never checked here.** |
| `apiKeyReadProcedure` / `apiKeyWriteProcedure` / `apiKeyDeleteProcedure` / `apiKeyAdminProcedure` | `createApiKeyProcedure(perm)`: `UNAUTHORIZED "API key required"` if no `apiKeyAuth`; `FORBIDDEN "API key lacks '<perm>' permission"` unless permissions include `"admin"` or `perm`; then `UNAUTHORIZED` if no session user. **Exported but not used by any router.** |
| `adminProcedure` (`router/admin.ts:34-55`, local to admin router) | `protectedProcedure` + DB lookup `SELECT role FROM user WHERE id = session.user.id`; throws `FORBIDDEN "Admin access required"` unless `isPlatformAdminRole(role)` (`role === "admin"`). Adds `ctx.adminUser = { ...session.user, role }`. Works for API-key auth as well (role comes from DB, not from key permissions). |

**Consequence for the contract:** today every `protectedProcedure` accepts any API key regardless of its `permissions` array. The plan's `SessionOrKey("read"/"write"/"admin")` rule will be the first time permissions are enforced — a behaviour change for existing keys (e.g. a `["read"]` key can currently `post.create`).

### `timingMiddleware` (`trpc.ts:160-203`)
- Dev only (`t._config.isDev`): artificial random delay 100–499 ms per call.
- OTel span `trpc.<path>` with attrs `rpc.system="trpc"`, `rpc.method=<path>`, `rpc.type=<query|mutation>`; records `getMetrics().trpcDuration` (ms, attr `rpc.method`) and on error `trpcErrors` (+1, attrs `rpc.method`, `error.type`=`error.name`).

### Error formatter (`trpc.ts:131-143`)
- Transformer: `superjson` (Dates survive as `Date` on clients; `undefined` fields preserved).
- `data.zodError` = `z.flattenError(cause)` when the cause is a `ZodError`, else `null`. Input validation failures surface as `BAD_REQUEST` with `zodError` populated.

### HTTP mounting
- Next.js: `apps/nextjs/src/app/api/trpc/[trpc]/route.ts` — `fetchRequestHandler({ endpoint: "/api/trpc", router: appRouter, createContext })`, GET+POST+OPTIONS, CORS `*`, `onError` logs `{ err, path }` with `@gmacko/logging` module `trpc-handler`. **No versioning, deprecation or OpenAPI code is wired in** (see §6).
- TanStack Start: `apps/tanstack-start/src/routes/api/trpc.$.ts` (parallel mount; consumes `post.*` only).
- Server components / server actions in Next call `appRouter.createCaller(await createTRPCContext({ headers, authApi: auth.api }))` directly (in-process, no HTTP).

---

## 1. `auth` router — `packages/api/src/router/auth.ts` (2 procedures)

### 1.1 `auth.getSession`
- kind: **query**; type: **public**
- input: none
- output: `ctx.session` → `AuthSession` (see §0): `{ user: AuthUser | <user row>, session: SessionRecord | null } | null`
- errors: none
- DB: none directly (context may have done the api_keys lookup/update)
- side effects: none
- flags: none
- consumers: **none via tRPC.** Next.js pages call `auth.api.getSession` directly (`apps/nextjs/src/auth/server.ts`). Exposed publicly by `openapi.ts` as `GET /v1/trpc/auth.getSession`.
- REST mapping: `GET /api/auth/session` (group `auth`, id `session`), **public**; returns `Session | null`. No domain errors. (Candidate to drop if better-auth's own `/api/auth/get-session` is deemed sufficient.)

### 1.2 `auth.getSecretMessage`
- kind: **query**; type: **protected**
- input: none
- output: `string` literal `"you can see this secret message!"`
- errors: `UNAUTHORIZED` (no session)
- DB / side effects / flags: none
- consumers: **none** (template leftover)
- REST mapping: drop, or `GET /api/auth/secret` SessionOrKey("read") if a smoke endpoint is wanted. Errors: `Unauthorized`.

---

## 2. `post` router — `packages/api/src/router/post.ts` (4 procedures)

Shared row type — `Post` table (`schema.ts:29-37`):
```ts
{ id: string /*uuid*/; title: string /*varchar 256*/; content: string /*text*/; createdAt: Date; updatedAt: Date | null }
```
Post has **no owner column**; there is no per-user scoping anywhere in this router.

### 2.1 `post.all`
- kind: **query**; type: **public**
- input: none
- output: `Post[]` — `db.query.Post.findMany({ orderBy: desc(Post.id), limit: 10 })`. Note: ordered by **uuid desc**, i.e. effectively arbitrary, not newest-first; hard limit 10, no pagination.
- errors: none
- DB: read `post`
- consumers: Next `apps/nextjs/src/app/page.tsx:175` (RSC prefetch) + `_components/posts.tsx:121` (`useSuspenseQuery`, `RouterOutputs["post"]["all"]`); Expo `apps/expo/src/app/index.tsx:184`; TanStack Start `routes/index.tsx:29,158`; operator tool `list_posts`.
- REST: `GET /api/posts` (group `posts`, id `list`), **public**. Errors: none (InternalError only).

### 2.2 `post.byId`
- kind: **query**; type: **public**
- input: `z.object({ id: z.string() })` (any string, not validated as uuid — a non-uuid string makes Postgres throw → `INTERNAL_SERVER_ERROR`)
- output: `Post | undefined` (`findFirst`). **Does not throw NOT_FOUND**; returns `undefined` (serialised by superjson).
- errors: none explicit
- DB: read `post`
- consumers: Expo `apps/expo/src/app/post/[id].tsx:9`; operator tool `get_post` (prints "Post not found" on falsy).
- REST: `GET /api/posts/:id` (id `byId`), **public**. Domain errors: `NotFound` (contract should turn `undefined` into 404 — behaviour change to note for Expo, which currently renders on `undefined`). Path param should be `Schema.UUID`-ish or keep `string` and map PG cast errors to `NotFound`/`BadRequest`.

### 2.3 `post.create`
- kind: **mutation**; type: **protected**
- input: `CreatePostSchema` (`schema.ts:39-46`) = `createInsertSchema(Post, { title: z.string().max(256), content: z.string().max(256) }).omit({ id, createdAt, updatedAt })` → `{ title: string /*max 256, empty allowed*/; content: string /*max 256, empty allowed*/ }`. (drizzle-zod refinements **replace** the generated column schema, so there is no `min(1)`; the OpenAPI doc's `minLength: 1` is wrong.)
- output: `ctx.db.insert(Post).values(input)` **without `.returning()`** → postgres-js `RowList` (an empty array with `count`/`command` props); superjson serialises it as `[]`. The created post is **not returned**.
- errors: `UNAUTHORIZED`; zod `BAD_REQUEST` on >256 chars.
- DB: insert `post`
- consumers: Next `_components/posts.tsx:30-53` (TanStack Form with `onSubmit: CreatePostSchema` validator; ignores result, invalidates `post` path); Expo `index.tsx:55` (ignores result); TanStack Start `routes/index.tsx:67,88` (same form pattern); operator `create_post` (JSON-stringifies the result — prints `[]`).
- REST: `POST /api/posts` (id `create`), **SessionOrKey("write")**. Return the created `Post` (201) — improvement over today; all consumers ignore the body so it is safe. Errors: `Unauthorized`, `Forbidden`.

### 2.4 `post.delete`
- kind: **mutation**; type: **protected**
- input: **bare** `z.string()` (the post id — not wrapped in an object)
- output: `ctx.db.delete(Post).where(eq(Post.id, input))` without `.returning()` → `[]` after superjson. **No NOT_FOUND, no ownership check** — any authenticated user (or any API key) can delete any post.
- errors: `UNAUTHORIZED`; PG cast error for non-uuid → `INTERNAL_SERVER_ERROR`
- DB: delete `post`
- consumers: Next `_components/posts.tsx:152-176` (`deletePost.mutate(props.post.id)`); Expo `index.tsx:187`; TanStack Start `routes/index.tsx:187`; operator `delete_post`.
- REST: `DELETE /api/posts/:id` (id `remove`), **SessionOrKey("write")** per plan rule (there is a `"delete"` permission in the enum; plan may prefer `SessionOrKey("delete")` — decide). Errors: `Unauthorized`, `Forbidden`, `NotFound` (new; use `.returning({id})`). Response `{ success: true }` or 204.

---

## 3. `settings` router — `packages/api/src/router/settings.ts` (14 procedures)

Helpers used by several procedures are listed in §5.b. `getWorkspaceScope(ctx)` (lines 72-125) is called by `getWorkspaceContext`, `getBillingOverview`, `listInvites`, `createInvite`; its resolution:
1. `SELECT id, role FROM user WHERE id = session.user.id` (platform role).
2. `applicationSettings.findFirst()`.
3. Membership: if `settings.initialWorkspaceId` → membership of this user in that workspace; else the user's earliest membership (`asc(createdAt), asc(id)`).
4. `fallbackWorkspace` = the initial workspace when the user has **no** membership but `initialWorkspaceId` is set (so non-members still "see" the initial workspace, with `role: null`).
5. Returns `{ currentWorkspace: workspace row | null | undefined, currentWorkspaceId: string | null, currentWorkspaceRole: WorkspaceRole | null, canManageCurrentWorkspace: boolean, platformRole: "user"|"admin" (default "user"), isPlatformAdmin: boolean }`.

### 3.1 `settings.getLaunchState`
- kind: **query**; type: **public**
- input: none
- output:
  ```ts
  {
    announcementMessage: string | null;      // settings ?? null
    announcementTone: string;                // settings (varchar 24) ?? "info"
    allowedEmailDomains: string[];           // settings ?? []
    canAutoCreateAccounts: boolean;          // = NODE_ENV !== "production"
    inviteOnly: boolean;                     // = !signupEnabled
    maintenanceMode: boolean;                // settings ?? false
    signupEnabled: boolean;                  // settings ?? true
    stripeConfigured: boolean;               // integrations.stripe (const false)
    publicAnnouncementVisible: boolean;      // Boolean(announcementMessage)
    canUseWaitlist: true;                    // literal true
  }
  ```
- errors: none
- DB: read `application_settings` (findFirst)
- flags: `integrations.stripe`; `process.env.NODE_ENV`
- consumers: Next `app/page.tsx:62-75` (server caller, gates maintenance + shows banner) and `_components/auth-showcase.tsx:69-90` (server action: redirects to `/?maintenance=1` or `/?waitlist=1` before social sign-in). Both cast `caller.settings as { getLaunchState: ... }` (type workaround).
- REST: `GET /api/launch/state` (group `launch`, id `state`), **public**. Errors: none.

### 3.2 `settings.submitWaitlistEntry`
- kind: **mutation**; type: **public**
- input:
  ```ts
  z.object({
    email: z.string().email(),
    message: z.string().max(1000).optional(),
    referralCode: z.string().max(120).optional(),
    source: z.enum(["landing","contact","referral","blocked-signup"]).default("landing"),
  })
  ```
- behaviour: `email = input.email.trim().toLowerCase()`; SELECT by `(email, source)`; if exists → UPDATE `message`, `referralCode`, **`status: "pending"`** (re-submitting resets an `approved`/`dismissed`/`contacted` entry back to pending) `.returning({id,email,source,status})`; else INSERT with `status: "pending"` `.returning(...)`.
- output: `{ id: string; email: string; source: WaitlistSource; status: WaitlistStatus }` — TS type is actually `{id,email,source,status} | { id: string }` because of `updated ?? existing`; in practice always the 4-field shape. Non-null: insert returns `created` typed `| undefined`.
- errors: zod `BAD_REQUEST`; select-then-insert race on unique `(email, source)` → `INTERNAL_SERVER_ERROR`.
- DB: read/insert/update `waitlist_entry`; **not** in a transaction.
- side effects: none (no email sent)
- flags: none (`getLaunchState.canUseWaitlist` is always true)
- consumers: Next `_components/waitlist-form.tsx:18-54` (server action; sends `email`, optional `message`, `source` from props; used on `/` when invite-only/blocked and on `/contact` with `source="contact"`).
- REST: `POST /api/waitlist` (group `waitlist`, id `submit`), **public**. Errors: `Conflict` (if we stop resetting status / make the upsert atomic), `RateLimited` (platformPrimitives.rateLimits has scope `"contact"`/`"signup"` — not enforced today). Return the 4-field entry.

### 3.3 `settings.getWorkspaceContext`
- kind: **query**; type: **protected**
- input: none
- output:
  ```ts
  {
    workspace: { id: string; name: string; slug: string } | null;
    workspaceRole: "owner" | "admin" | "member" | null;
    platformRole: "user" | "admin";
    canManageWorkspace: boolean;      // role owner|admin
    isPlatformAdmin: boolean;
    inviteAllowlistCount: number;     // count of allowlist rows for currentWorkspaceId (computed even when !canManageWorkspace)
  }
  ```
- errors: `UNAUTHORIZED`
- DB: read `user`, `application_settings`, `workspace_membership`, `workspace`, `workspace_invite_allowlist` (ids only)
- consumers: Next `settings/page.tsx:97` (server caller; gates the collaboration section); Expo `settings.tsx:403`; operator `get_workspace_context`.
- REST: `GET /api/workspace/context` (group `workspace`, id `context`), **SessionOrKey("read")**. Errors: `Unauthorized`, `Forbidden`.

### 3.4 `settings.getPlatformPrimitives`
- kind: **query**; type: **protected**
- input: none
- output (all from `platformPrimitives` const, `integrations.ts:42-72`):
  ```ts
  {
    featureFlags:  { enabled: boolean; provider: "local" };
    jobs:          { enabled: boolean; provider: "local" };
    rateLimits:    { enabled: boolean; scopes: string[] };   // ["auth","contact","signup","api-keys","operator-api"]
    botProtection: { enabled: boolean; provider: "local-rate-limit" };
    compliance:    { enabled: boolean; dataExport: boolean; dataDeletion: boolean };
    emailDelivery: { enabled: boolean; provider: "resend" | "sendgrid" | "none"; requiredEnv: string[] };
  }
  ```
- errors: `UNAUTHORIZED`
- DB / side effects: none
- consumers: **none** (only `settings.test.ts:1195`). Same payload is embedded in `admin.getLaunchControls.platformPrimitives`.
- REST: `GET /api/platform/primitives` (group `platform`, id `primitives`), **SessionOrKey("read")**, or drop and rely on the admin copy. Errors: `Unauthorized`.

### 3.5 `settings.getBillingOverview`
- kind: **query**; type: **protected**
- input: none
- output:
  ```ts
  {
    billing: {
      customerPortalAvailable: boolean;   // integrations.stripe && !!subscription.stripeCustomerId
      plan: { amountInCents: number; currency: string; description: string | null; id: string; interval: "month"|"year"; key: string; name: string } | null;
      plans: { amountInCents: number; currency: string; id: string; interval: "month"|"year"; isDefault: boolean; key: string; name: string }[];
      providerConfigured: boolean;        // integrations.stripe
      subscription: { cancelAtPeriodEnd: boolean; currentPeriodEnd: Date | null; currentPeriodStart: Date | null; provider: "manual"|"stripe"; status: WorkspaceSubscriptionStatus } | null;
      visible: boolean;                   // saasFeatures.billing
    };
    usage: {
      currentPeriodEnd: Date | null;      // subscription.currentPeriodEnd ?? UTC month end
      currentPeriodStart: Date | null;    // subscription.currentPeriodStart ?? UTC month start
      limits: { currentUsage: number; key: string; period: "day"|"month"|"all_time"; value: number | null }[];
      meters: { aggregation: "sum"|"max"; currentUsage: number; key: string; latestPeriodEnd: Date | null; latestPeriodStart: Date | null; name: string; unit: string }[];
      visible: boolean;                   // saasFeatures.billing || saasFeatures.metering
    };
  }
  ```
  - No-workspace branch (no `currentWorkspaceId` **or** no `currentWorkspace`): returns `plan: null, plans: [], subscription: null, visible: false` for both, `providerConfigured: integrations.stripe`, all dates `null`.
  - Plan selection: subscription's plan → `isDefault` plan → first plan (ordered `amountInCents asc, name asc`) → null. `active` column is **ignored** (inactive plans listed).
  - Rollups: all rollups for the workspace, ordered `periodEnd desc, createdAt desc`; first per meter wins ("latest").
  - Limits are matched to meters by `limit.key === meter.key`.
- errors: `UNAUTHORIZED`
- DB (all reads, `Promise.all`, no transaction): `billing_plan`, `workspace_subscription`, `usage_meter`, `workspace_usage_rollup`, then `billing_plan_limit`; plus `getWorkspaceScope` reads. **DB is queried even when both `visible` flags are false.**
- flags: `saasFeatures.billing`, `saasFeatures.metering`, `integrations.stripe`
- consumers: Next `settings/page.tsx:98-99` (casts to a locally declared `BillingOverview` type — the TS shape it expects is listed at lines 12-63 and matches the above with `string` for the enums); Expo `settings.tsx:538`; operator `get_billing_overview`.
- REST: `GET /api/billing/overview` (group `billing`, id `overview`), **SessionOrKey("read")**. Errors: `Unauthorized`.

### 3.6 `settings.listInvites`
- kind: **query**; type: **protected**
- input: none
- output: `{ id: string; email: string; role: WorkspaceRole }[]` ordered `createdAt asc, id asc`; **returns `[]` (no error)** when there is no current workspace or the caller cannot manage it.
- errors: `UNAUTHORIZED`
- DB: `getWorkspaceScope` reads + `workspace_invite_allowlist`
- consumers: Next `settings/page.tsx:100-102` (only if `canManageWorkspace`); Expo `settings.tsx:407` (enabled when canManage).
- REST: `GET /api/workspace/invites` (group `workspace`, id `invites.list`), **SessionOrKey("read")**. Errors: `Unauthorized`; optionally `Forbidden(reason:"workspace-manager-required")` instead of the silent `[]` (behaviour change; both consumers already gate on `canManageWorkspace`).

### 3.7 `settings.createInvite`
- kind: **mutation**; type: **protected**
- input: `z.object({ email: z.string().email(), role: z.enum(["admin","member"]).default("member") })`
- behaviour: scope check; `inviteEmail = trim().toLowerCase()`; loads **all** allowlist rows for the workspace and does a case-insensitive duplicate check in memory; INSERT `{ workspaceId, email: inviteEmail, role, invitedByUserId: session.user.id }` `.returning({id,email,role})`.
- output: `{ id: string; email: string; role: WorkspaceRole }` (typed `| undefined`)
- errors:
  - `UNAUTHORIZED`
  - `FORBIDDEN "Workspace invite access requires manager permissions"` — no current workspace or `!canManageCurrentWorkspace`
  - `BAD_REQUEST "An invite already exists for that email"` — duplicate (should be `Conflict`)
  - race → unique `(workspaceId,email)` violation → `INTERNAL_SERVER_ERROR`
- DB: reads via scope; read+insert `workspace_invite_allowlist`; **not transactional**
- side effects: **no email is sent** (allowlist only)
- flags: none in the router (UI gating: Next shows the section only when `canManageWorkspace && workspace`; `saasFeatures.collaboration` is not consulted here)
- consumers: Next `settings/page.tsx:108-141` (server action; `role` restricted to `COLLABORATION_ROLES = ["member","admin"]`; any thrown error → redirect `?inviteError=create`); Expo `settings.tsx:412-444` (`{ email: inviteEmail.trim(), role: inviteRole }`, role state `"admin" | "member"`).
- REST: `POST /api/workspace/invites` (id `invites.create`), **SessionOrKey("write")**. Errors: `Unauthorized`, `Forbidden(reason:"workspace-manager-required")`, `Conflict` (duplicate email), `BadRequest` (validation).

### 3.8 `settings.acceptInvite`
- kind: **mutation**; type: **protected**
- input: `z.object({ inviteId: z.string() })`
- behaviour: `workspaceInviteAllowlist.findMany()` (**entire table**) then `.find(id)`; email must equal `session.user.email` (case-insensitive); role must not be `"owner"`; loads all memberships of the user; if user has a membership in a **different** workspace → forbidden; membership = existing membership in that workspace **or** INSERT `{ workspaceId, userId, role: invite.role }` `.returning({ workspaceId, role })`; then DELETE the invite row.
- output: `{ workspaceId: string; role: WorkspaceRole }` — but when an existing membership is reused the value is the **full membership row** `{ id, workspaceId, userId, role, createdAt, updatedAt }` (TS union). Contract should normalise to `{ workspaceId, role }`.
- errors:
  - `UNAUTHORIZED`
  - `NOT_FOUND "Invite not found"`
  - `FORBIDDEN "Invite not found for this account"` (email mismatch)
  - `BAD_REQUEST "Owner invites are not supported in v1"`
  - `FORBIDDEN "This account is already attached to a different workspace"`
- DB: read `workspace_invite_allowlist`, `workspace_membership`; insert `workspace_membership`; delete `workspace_invite_allowlist`. **Two writes, not in a transaction** (membership can be created and the invite left behind on failure).
- flags: none
- consumers: **none in apps** (only `settings.test.ts:747-994`). There is no UI to accept an invite; the allowlist is currently only consumed by the auth sign-up gate (outside this survey).
- REST: `POST /api/workspace/invites/:inviteId/accept` (id `invites.accept`), **SessionOrKey("write")**. Errors: `Unauthorized`, `NotFound`, `Forbidden(reason:"invite-email-mismatch" | "already-in-other-workspace")`, `BadRequest("owner-invites-unsupported")`. Should be wrapped in a transaction.

### 3.9 `settings.getPreferences`
- kind: **query** (with a **write side effect**); type: **protected**
- input: none
- behaviour: `userPreferences.findFirst({ userId })`; if missing → `INSERT (userId) RETURNING *` and return it.
- output: `userPreferences` row:
  ```ts
  { id: string; userId: string; theme: string /*varchar 20, default "system"*/; language: string /*varchar 10, "en"*/; timezone: string /*varchar 50, "UTC"*/; emailNotifications: boolean; pushNotifications: boolean; createdAt: Date; updatedAt: Date | null }
  ```
  (TS type includes `| undefined` from destructuring the insert.) Note the DB column `theme` is a free `varchar`, only the input schema restricts it to `light|dark|system`.
- errors: `UNAUTHORIZED`
- DB: read (+ first-time insert) `user_preferences`
- consumers: Next `settings/_components/preferences.tsx:16`; Expo `settings.tsx:50`; operator `get_preferences`.
- REST: `GET /api/preferences` (group `preferences`, id `get`), **SessionOrKey("read")** — note a read endpoint performing an insert; either keep (idempotent upsert) or return defaults without persisting. Errors: `Unauthorized`.

### 3.10 `settings.updatePreferences`
- kind: **mutation**; type: **protected**
- input: `UpdateUserPreferencesSchema` (`schema.ts:318-331`) = `createInsertSchema(userPreferences, { theme: z.enum(["light","dark","system"]).default("system"), language: z.string().max(10).default("en"), timezone: z.string().max(50).default("UTC") }).omit({id,createdAt,updatedAt}).partial().omit({ userId })` → nominal type
  ```ts
  { theme?: "light"|"dark"|"system"; language?: string /*max 10*/; timezone?: string /*max 50*/; emailNotifications?: boolean; pushNotifications?: boolean }
  ```
  **Verified bug (zod 4.3.6 installed):** `.partial()` over `.default()` fields still applies the defaults, so `parse({ emailNotifications: false })` yields `{ theme: "system", language: "en", timezone: "UTC", emailNotifications: false }`. Every partial update from the UI toggles (Next `preferences.tsx:31-45`, Expo `settings.tsx:64-80`, operator `update_preferences`) therefore **resets theme/language/timezone to defaults**. The Effect Schema equivalent must make these fields truly optional with no defaults (and the plan should decide whether to preserve or fix — fixing is clearly intended behaviour).
- behaviour: findFirst; if missing INSERT `{ userId, ...input }` RETURNING *; else UPDATE SET input WHERE userId RETURNING *.
- output: `userPreferences` row (as 3.9), typed `| undefined`.
- errors: `UNAUTHORIZED`; zod `BAD_REQUEST`
- DB: read + insert/update `user_preferences` (select-then-write, no transaction; unique `userId` race → 500)
- consumers: Next `preferences.tsx:20` (`{theme}` / `{emailNotifications}` / `{pushNotifications}`); Expo `settings.tsx:54-80` (`{theme}`, `{language}`, `{emailNotifications}`, `{pushNotifications}`); operator `update_preferences` (any of the 5 keys as string/boolean).
- REST: `PATCH /api/preferences` (id `update`), **SessionOrKey("write")**. Errors: `Unauthorized`, `BadRequest`.

### 3.11 `settings.listApiKeys`
- kind: **query**; type: **protected**
- input: none
- output: `{ id: string; name: string; keyPrefix: string; permissions: string[]; lastUsedAt: Date | null; expiresAt: Date | null; createdAt: Date }[]` — own keys, `revokedAt IS NULL`, ordered `createdAt desc`. (Expired keys are still listed.)
- errors: `UNAUTHORIZED`
- DB: read `api_keys`
- consumers: Next `settings/_components/api-keys.tsx:35`; Expo `settings.tsx:196`; operator `list_api_keys`.
- REST: `GET /api/api-keys` (group `apiKeys`, id `list`), **SessionOrKey("read")**. Errors: `Unauthorized`.

### 3.12 `settings.createApiKey`
- kind: **mutation**; type: **protected** (plan: **Session-only**)
- input:
  ```ts
  z.object({
    name: z.string().min(1).max(100),
    permissions: z.array(z.enum(["read","write","delete","admin"])).min(1),
    expiresInDays: z.number().int().positive().optional(),
  })
  ```
- behaviour: `key = "gmk_" + randomBytes(32).toString("base64url")`; `keyHash = sha256 hex`; `keyPrefix = key.slice(0,12)`; `expiresAt = now + days*86400000 | null`; INSERT RETURNING `{id,name,keyPrefix,permissions,expiresAt}`; returns `{ ...created, key }`.
- output: `{ id: string; name: string; keyPrefix: string; permissions: string[]; expiresAt: Date | null; key: string /*plaintext, shown once*/ }`
- errors: `UNAUTHORIZED`; zod `BAD_REQUEST`
- DB: insert `api_keys`
- side effects: none (no email)
- flags: none (no cap on key count; any user may mint an `"admin"`-permission key — which only matters once permissions are enforced; it never grants platform-admin)
- consumers: Next `api-keys.tsx:39-67` (`{ name, permissions }`, shows `data.key` once); Expo `settings.tsx:200-232` (`{ name, permissions }`); operator `create_api_key` (`name`, comma-separated `permissions` default `["read"]`, optional `expiresInDays`).
- REST: `POST /api/api-keys` (id `create`), **Session-only** (per plan). Errors: `Unauthorized`, `Forbidden(reason:"session-required")` for key-authenticated callers, `BadRequest`. Note the operator CLI/MCP currently call this **with an API key** (`packages/operator-core/src/index.ts:91-98`) — Session-only will break `create_api_key` via CLI/MCP; flag for the plan.

### 3.13 `settings.revokeApiKey`
- kind: **mutation**; type: **protected** (plan: **Session-only**)
- input: `z.object({ id: z.string() })`
- behaviour: UPDATE `revokedAt = now()` WHERE `id AND userId = me AND revokedAt IS NULL` RETURNING id.
- output: `{ success: boolean }` — `false` when not found / not owned / already revoked (no error).
- errors: `UNAUTHORIZED`; non-uuid id → PG cast error → 500
- DB: update `api_keys`
- consumers: Next `api-keys.tsx:52-87`; Expo `settings.tsx:214`; operator `revoke_api_key` (again called with an API key today).
- REST: `DELETE /api/api-keys/:id` (id `revoke`), **Session-only**. Errors: `Unauthorized`, `Forbidden`, `NotFound` (replace `success:false`). Return 204 or `{ success: true }`.

### 3.14 `settings.deleteAccount`
- kind: **mutation**; type: **protected** (plan: **Session-only**)
- input: none
- behaviour: `DELETE FROM user WHERE id = me RETURNING id`.
- output: `{ success: boolean }`
- errors: `UNAUTHORIZED`
- DB: delete `user` → FK cascades (`auth-schema.ts`, `schema.ts`): `session`, `account`, `api_keys`, `user_preferences`, `workspace_membership`, **`workspace` where `ownerUserId = me` (cascade — the owner deleting their account deletes the whole workspace, and transitively its memberships, invite allowlist, subscription, usage rollups)**, `workspace_invite_allowlist` where `invitedByUserId = me`; `application_settings.setupCompletedByUserId` and `waitlist_entry.reviewedByUserId` → set null; `application_settings.initialWorkspaceId` → set null if the workspace went away.
- side effects: none besides cascades (compliance flag `platformPrimitives.compliance.dataDeletion` is not checked)
- consumers: Expo `settings.tsx:679-700` (then `authClient.signOut()`); scaffold test only mentions it by name.
- REST: `DELETE /api/account` (group `account`, id `delete`), **Session-only**. Errors: `Unauthorized`, `Forbidden(reason:"session-required")`, possibly `Conflict(reason:"workspace-owner")` if the plan wants to block owner self-deletion.

---

## 4. `admin` router — `packages/api/src/router/admin.ts` (11 procedures)

All `adminProcedure` entries add `FORBIDDEN "Admin access required"` after `UNAUTHORIZED`. Platform admin = `user.role === "admin"` looked up from DB per request.

### 4.1 `admin.getLaunchControls`
- kind: **query**; type: **admin**
- input: none
- output:
  ```ts
  {
    maintenanceMode: boolean;             // ?? false
    signupEnabled: boolean;               // ?? true
    announcementMessage: string | null;   // ?? null
    announcementTone: string;             // ?? "info"
    allowedEmailDomains: string[];        // ?? []
    platformPrimitives: <same 6-key object as settings.getPlatformPrimitives>;
    waitlistCount: number;                // waitlistEntry.findMany().length (loads all rows)
  }
  ```
- errors: `UNAUTHORIZED`, `FORBIDDEN`
- DB: read `application_settings`, `waitlist_entry` (all rows), `user` (role)
- flags: `platformPrimitives`
- consumers: **none** (tests only, `admin.test.ts:598`). No admin launch UI exists in `apps/nextjs/src/app/admin/*`.
- REST: `GET /api/admin/launch` (group `admin`, id `launch.get`), **SessionOrKey("admin")**. Errors: `Unauthorized`, `Forbidden(reason:"admin-required")`.

### 4.2 `admin.updateLaunchControls`
- kind: **mutation**; type: **admin**
- input:
  ```ts
  z.object({
    maintenanceMode: z.boolean().optional(),
    signupEnabled: z.boolean().optional(),
    announcementMessage: z.string().max(2000).nullable().optional(),   // null clears
    announcementTone: z.enum(["info","warning","critical"]).optional(),
    allowedEmailDomains: z.array(z.string().min(1)).optional(),
  })
  ```
- behaviour: findFirst; if a row exists UPDATE SET (undefined keys skipped by drizzle; `updatedAt` always bumped via `$onUpdateFn`) WHERE id RETURNING 6 cols; else INSERT the values (undefined → column defaults) RETURNING same.
- output: `{ id: string; maintenanceMode: boolean; signupEnabled: boolean; announcementMessage: string | null; announcementTone: string; allowedEmailDomains: string[] }` (typed `| undefined`)
- errors: `UNAUTHORIZED`, `FORBIDDEN`, zod `BAD_REQUEST`
- DB: read + update/insert `application_settings`; **not transactional** (two concurrent first-writes could create two settings rows; every reader uses `findFirst()` with no ordering).
- consumers: **none** (no UI).
- REST: `PATCH /api/admin/launch` (id `launch.update`), **SessionOrKey("admin")**. Errors: `Unauthorized`, `Forbidden`, `BadRequest`.

### 4.3 `admin.listWaitlistEntries`
- kind: **query**; type: **admin**
- input: none
- output: `{ id: string; email: string; source: WaitlistSource; status: WaitlistStatus; message: string | null; referralCode: string | null; reviewedByUserId: string | null; reviewedAt: Date | null; createdAt: Date }[]` — **no ordering, no pagination**.
- errors: `UNAUTHORIZED`, `FORBIDDEN`
- DB: read `waitlist_entry`
- consumers: **none** (tests only).
- REST: `GET /api/admin/waitlist` (id `waitlist.list`), **SessionOrKey("admin")**. Consider `limit/offset` + `status` filter. Errors: `Unauthorized`, `Forbidden`.

### 4.4 `admin.reviewWaitlistEntry`
- kind: **mutation**; type: **admin**
- input: `z.object({ waitlistEntryId: z.string(), status: z.enum(["pending","contacted","approved","dismissed"]) })`
- behaviour — **uses `ctx.db.transaction`** (`admin.ts:177-227`):
  ```ts
  return ctx.db.transaction(async (tx) => {
    const currentSettings = await tx.query.applicationSettings.findFirst();
    const currentWaitlistEntry = (await tx.query.waitlistEntry.findMany()).find((entry) => entry.id === input.waitlistEntryId) ?? null;   // full-table scan
    if (!currentWaitlistEntry) throw NOT_FOUND "Waitlist entry not found";
    const [updated] = await tx.update(waitlistEntry).set({ status, reviewedByUserId: ctx.session.user.id, reviewedAt: new Date() }).where(eq(id)).returning({ id, status, reviewedByUserId, reviewedAt });
    if (!updated) throw NOT_FOUND "Waitlist entry not found";
    if (input.status === "approved" && currentWaitlistEntry.status !== "approved" && currentSettings?.initialWorkspaceId) {
      await tx.insert(workspaceInviteAllowlist).values({ workspaceId: currentSettings.initialWorkspaceId, email: currentWaitlistEntry.email, role: "member", invitedByUserId: ctx.session.user.id });
    }
    return updated;
  });
  ```
- output: `{ id: string; status: WaitlistStatus; reviewedByUserId: string | null; reviewedAt: Date | null }`
- errors: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND "Waitlist entry not found"` (x2 paths); **unique violation on `(workspaceId, email)`** when an allowlist entry already exists for that email (e.g. approve → dismiss → approve again, or an invite was created manually) → `INTERNAL_SERVER_ERROR` and the whole transaction rolls back (status not updated).
- DB: read `application_settings`, `waitlist_entry`; update `waitlist_entry`; insert `workspace_invite_allowlist`
- side effects: no email
- consumers: **none** (tests only).
- REST: `POST /api/admin/waitlist/:id/review` (id `waitlist.review`), body `{ status }`, **SessionOrKey("admin")**. Errors: `Unauthorized`, `Forbidden`, `NotFound`, `Conflict` (allowlist already has the email — or make the insert `onConflictDoNothing`).

### 4.5 `admin.bootstrapStatus`
- kind: **query**; type: **public**
- input: none
- output:
  ```ts
  { isInitialized: boolean; requiresSetup: boolean /* = !isInitialized */; hasExistingWorkspace: boolean; setupCompletedAt: Date | null; initialWorkspaceId: string | null }
  ```
- errors: none
- DB: read `application_settings`, `workspace` (limit 1)
- consumers: Next `app/page.tsx:74` (server caller; renders the first-run setup screen when `requiresSetup`).
- REST: `GET /api/bootstrap/status` (group `bootstrap`, id `status`), **public**. Errors: none.

### 4.6 `admin.completeBootstrap`
- kind: **mutation**; type: **protected** (NOT admin — any signed-in user; first-come-first-served) (plan: **Session-only**)
- input: `z.object({ workspaceName: z.string().min(2).max(120) })`
- behaviour — **uses `ctx.db.transaction`** (`admin.ts:250-347`):
  ```ts
  return ctx.db.transaction(async (tx) => {
    const existingSettings = await tx.query.applicationSettings.findFirst();
    const existingWorkspace = await tx.select().from(workspace).limit(1);
    if (existingSettings?.setupCompletedAt) throw BAD_REQUEST "Bootstrap has already been completed";
    if (existingWorkspace.length > 0)     throw BAD_REQUEST "Bootstrap has already started";
    const [createdWorkspace] = await tx.insert(workspace).values({ name, slug: slugifyWorkspaceName(name), ownerUserId: me }).returning({ id, name, slug, ownerUserId });
    if (!createdWorkspace) throw INTERNAL_SERVER_ERROR "Failed to create the initial workspace";
    await tx.insert(workspaceMembership).values({ workspaceId, userId: me, role: "owner" });
    const [updatedUser] = await tx.update(user).set({ role: "admin" }).where(eq(user.id, me)).returning({ id, role });
    if (!updatedUser) throw NOT_FOUND "Bootstrap user not found";
    const [settings] = existingSettings
      ? await tx.update(applicationSettings).set({ setupCompletedAt: new Date(), setupCompletedByUserId: me, initialWorkspaceId }).where(eq(id, existingSettings.id)).returning({ id, setupCompletedAt, setupCompletedByUserId, initialWorkspaceId })
      : await tx.insert(applicationSettings).values({ setupCompletedAt: new Date(), setupCompletedByUserId: me, initialWorkspaceId }).returning({ ...same });
    return { setupCompleted: true, settings, workspace: createdWorkspace };
  });
  ```
  (`admin.test.ts:480` asserts nothing is persisted when it fails mid-flight.)
- output: `{ setupCompleted: true; settings: { id: string; setupCompletedAt: Date | null; setupCompletedByUserId: string | null; initialWorkspaceId: string | null } | undefined; workspace: { id: string; name: string; slug: string; ownerUserId: string } }`
- errors: `UNAUTHORIZED`; `BAD_REQUEST` (x2, → `Conflict`); `INTERNAL_SERVER_ERROR`; `NOT_FOUND "Bootstrap user not found"`; zod `BAD_REQUEST`.
- DB: reads `application_settings`, `workspace`; writes `workspace`, `workspace_membership`, `user`, `application_settings`.
- consumers: Next `app/page.tsx:78-108` (server action `completeBootstrap(formData)`; trims name, requires length ≥ 2, then `redirect("/settings")`).
- REST: `POST /api/bootstrap/complete` (id `complete`), **Session-only**. Errors: `Unauthorized`, `Forbidden(reason:"session-required")`, `Conflict(reason:"already-completed" | "already-started")`, `BadRequest`, `InternalError`.

### 4.7 `admin.stats`
- kind: **query**; type: **admin**
- input: none
- output: `{ totalUsers: number; totalWorkspaces: number; adminUsers: number; regularUsers: number }` — computed by loading **all** `user` and `workspace` rows into memory.
- errors: `UNAUTHORIZED`, `FORBIDDEN`
- DB: read `user`, `workspace`
- consumers: Next `admin/page.tsx:5` (prefetch), `admin/_components/dashboard.tsx:12`; invalidated by `users-list.tsx:36`.
- REST: `GET /api/admin/stats` (id `stats`), **SessionOrKey("admin")**. Errors: `Unauthorized`, `Forbidden`.

### 4.8 `admin.listWorkspaces`
- kind: **query**; type: **admin**
- input: none
- output: `{ id: string; name: string; slug: string; ownerUserId: string; membershipCount: number; createdAt: Date }[]` ordered `createdAt asc`; membership counts computed in memory from **all** `workspace_membership` rows.
- errors: `UNAUTHORIZED`, `FORBIDDEN`
- DB: read `workspace`, `workspace_membership`
- consumers: **none** (tests only, `admin.test.ts:506`).
- REST: `GET /api/admin/workspaces` (id `workspaces.list`), **SessionOrKey("admin")**. Errors: `Unauthorized`, `Forbidden`.

### 4.9 `admin.listUsers`
- kind: **query**; type: **admin**
- input: `z.object({ limit: z.number().min(1).max(100).default(20), offset: z.number().min(0).default(0) }).optional()` (whole object optional; `limit`/`offset` not `.int()`)
- output:
  ```ts
  {
    users: { id: string; name: string; email: string; role: "user"|"admin"; image: string | null; emailVerified: boolean; createdAt: Date }[];   // ordered createdAt asc
    total: number;      // BUG: `select({ count: user.id }).from(user)` returns the first row's id, so total = users.length when any user exists, else 0 — it is NOT a count
    hasMore: boolean;   // users.length === limit
  }
  ```
- errors: `UNAUTHORIZED`, `FORBIDDEN`, zod `BAD_REQUEST`
- DB: read `user` (x2)
- consumers: Next `admin/page.tsx:6` + `dashboard.tsx:15` (`{ limit: 5 }`, uses `data.users[]` only), `admin/users/page.tsx:5` + `users-list.tsx:26` (`{ limit: 20 }`, uses `data.users` only; local `User` type has `role: string | null`). No consumer reads `total`/`hasMore`.
- REST: `GET /api/admin/users?limit&offset` (id `users.list`), **SessionOrKey("admin")**. Fix `total` with a real `count(*)`. Errors: `Unauthorized`, `Forbidden`, `BadRequest`.

### 4.10 `admin.updateUserRole`
- kind: **mutation**; type: **admin**
- input: `z.object({ userId: z.string(), role: z.enum(userRoleEnum /* ["user","admin"] */) })`
- behaviour: if `userId === me && role !== "admin"` → BAD_REQUEST; UPDATE `user SET role` RETURNING `{id,name,email,role}`; NOT_FOUND if no row.
- output: `{ id: string; name: string; email: string; role: "user"|"admin" }`
- errors: `UNAUTHORIZED`, `FORBIDDEN`, `BAD_REQUEST "Cannot remove your own admin privileges"`, `NOT_FOUND "User not found"`
- DB: update `user`
- consumers: Next `admin/users/_components/users-list.tsx:30-45` (`{ userId, role }`, then invalidates `listUsers` and `stats`).
- REST: `PATCH /api/admin/users/:userId/role` (id `users.updateRole`), body `{ role }`, **SessionOrKey("admin")**. Errors: `Unauthorized`, `Forbidden(reason:"cannot-demote-self")`, `NotFound`, `BadRequest`.

### 4.11 `admin.getUser`
- kind: **query**; type: **admin**
- input: `z.object({ userId: z.string() })`
- output: `{ id: string; name: string; email: string; role: "user"|"admin"; image: string | null; emailVerified: boolean; createdAt: Date; updatedAt: Date }`
- errors: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND "User not found"`
- DB: read `user`
- consumers: **none** (the `getUser` hit in `packages/flags/src/server.ts:109` is an unrelated doc comment).
- REST: `GET /api/admin/users/:userId` (id `users.byId`), **SessionOrKey("admin")**. Errors: `Unauthorized`, `Forbidden`, `NotFound`.

---

## 5. Lists

### 5.a Shared types / enums (all in `packages/db/src/schema.ts` and `auth-schema.ts`)

| name | values / shape | used by |
|---|---|---|
| `UserRole` / `userRoleEnum` (`auth-schema.ts:3`) | `"user" \| "admin"` | admin.updateUserRole input, listUsers/getUser output, getWorkspaceContext.platformRole |
| `WorkspaceRole` / `workspaceRoleEnum` (`schema.ts:8`) | `"owner" \| "admin" \| "member"` | membership/invite rows; createInvite input is the subset `"admin" \| "member"` |
| `WaitlistSource` / `waitlistSourceEnum` (`schema.ts:169`) | `"landing" \| "contact" \| "referral" \| "blocked-signup"` | submitWaitlistEntry, listWaitlistEntries |
| `WaitlistStatus` / `waitlistStatusEnum` (`schema.ts:177`) | `"pending" \| "contacted" \| "approved" \| "dismissed"` | submitWaitlistEntry, reviewWaitlistEntry, listWaitlistEntries |
| `BillingInterval` (`schema.ts:10`) | `"month" \| "year"` | getBillingOverview.plan(s).interval |
| `WorkspaceSubscriptionStatus` (`schema.ts:12`) | `"free" \| "trialing" \| "active" \| "past_due" \| "canceled" \| "incomplete"` | getBillingOverview.subscription.status |
| `BillingProvider` (`schema.ts:22`) | `"manual" \| "stripe"` | getBillingOverview.subscription.provider |
| `BillingLimitPeriod` (`schema.ts:24`) | `"day" \| "month" \| "all_time"` | getBillingOverview.usage.limits[].period |
| `UsageAggregation` (`schema.ts:26`) | `"sum" \| "max"` | getBillingOverview.usage.meters[].aggregation |
| `ApiKeyPermission` (`trpc.ts:10`) | `"read" \| "write" \| "delete" \| "admin"` | createApiKey input; `api_keys.permissions` column is untyped `json string[]` so list/create outputs are `string[]` |
| announcement tone | input enum `"info" \| "warning" \| "critical"` (`admin.ts:106`), stored as free `varchar(24)`, output typed `string` | getLaunchState, getLaunchControls, updateLaunchControls |
| theme | input enum `"light" \| "dark" \| "system"` (`schema.ts:319`), stored as `varchar(20)`, output `string` | getPreferences, updatePreferences |
| `AuthUser`, `SessionRecord`, `AuthSession`, `ApiKeyAuth` (`trpc.ts:10-42`) | see §0 | auth.getSession |
| `PlatformPrimitives` payload (`integrations.ts:42-72`) | see 3.4 | getPlatformPrimitives, getLaunchControls |

### 5.b Helper functions worth keeping as service logic

| helper | file:lines | notes |
|---|---|---|
| `hashApiKey(key)` | `trpc.ts:48-50` **and duplicated** `settings.ts:35-37` | `sha256(key).hex` |
| `validateApiKey(key)` | `trpc.ts:52-82` | lookup by hash, revoked/expired checks, `lastUsedAt` touch |
| `generateApiKey()` | `settings.ts:31-33` | `"gmk_" + randomBytes(32).toString("base64url")` |
| `getKeyPrefix(key)` | `settings.ts:39-41` | first 12 chars (matches `keyPrefix varchar(12)`) |
| `getDefaultUsagePeriod()` | `settings.ts:43-53` | UTC calendar-month `{ periodStart, periodEnd }` |
| `getLaunchDefaults()` | `settings.ts:55-70` | `signupEnabled=true, maintenanceMode=false, canAutoCreateAccounts = NODE_ENV !== "production"`, `announcementTone: "info"`, `allowedEmailDomains: []` |
| `getWorkspaceScope(ctx)` | `settings.ts:72-125` | current-workspace resolution (see §3 intro) — the core "WorkspaceService" |
| `slugifyWorkspaceName(name)` | `admin.ts:19-27` | lowercase, non-alnum → `-`, trim dashes, fallback `"workspace"` |
| `adminProcedure` role check | `admin.ts:34-55` | DB role lookup → `Forbidden("admin-required")` |
| `isPlatformAdminRole(role)` / `canManageWorkspace(role)` | `packages/auth/src/index.ts:12-22` | `role === "admin"`; `role === "owner" \|\| "admin"` |
| Plan selection + latest-rollup-per-meter logic | `settings.ts:322-348, 337-342` | billing overview service |

### 5.c OpenAPI / versioning / deprecation today (`openapi.ts`, `versioning.ts`, `middleware/*`)

- `openapi.ts` hand-writes an OpenAPI 3.0.3 document with exactly five paths, all prefixed by `versionedPath` (default `/v1`) and all under the tRPC path style:
  - `GET  /v1/trpc/auth.getSession` → `{ user: { id, email, name } }`
  - `GET  /v1/trpc/post.all` → array of `{ id, title, content, createdAt }`
  - `GET  /v1/trpc/post.byId?id=` → same object; declares `404` (the procedure never returns 404)
  - `POST /v1/trpc/post.create` (bearerAuth) body `{ title minLength 1, content minLength 1 }` → the post object (actual: `[]`, and no `min(1)`)
  - `POST /v1/trpc/post.delete` (bearerAuth) body `{ id }` (actual input is a bare string)
  - security scheme `bearerAuth` (http bearer); tags `auth`, `post`; every op has optional `X-API-Version` request header and `X-API-Version` response header.
  - `getOpenApiSpec()` returns `{"error":"OpenAPI not enabled"}` unless `integrations.openapi` (currently `false`). `generateVersionedApiDocument`/`generateAllVersionedSpecs` produce one doc per `API_VERSIONS = ["v1","v2"]`.
  - **Nothing serves this document** — no route in `apps/nextjs` or `apps/tanstack-start` imports `@gmacko/api/openapi`.
- `versioning.ts`: `ApiVersion = "v1"|"v2"`, default/current `v1`; `resolveApiVersion(url, headers)` priority URL (`/api/v1/...`, `/v1/...`) > headers (`x-api-version`, `api-version`) > default; `createVersionContext` adds `isDeprecated`/`deprecationMessage` from a mutable `VERSION_DEPRECATION_MAP` (both versions not deprecated; `markVersionDeprecated` mutates at runtime); `getVersionResponseHeaders` → `X-API-Version`, plus `Deprecation: true` / `X-Deprecation-Notice` when deprecated; `stripVersionFromPath` / `addVersionToPath` helpers; `isFeatureAvailable(feature, version, map)`.
- `middleware/versioning.ts`: `assertMinVersion` → `BAD_REQUEST "Feature 'X' requires API version vN or higher..."`, `assertMaxVersion` → `NOT_FOUND "Feature 'X' was removed in API version ..."`, `validateVersionHeader`.
- `middleware/deprecation.ts`: `DeprecationMeta { deprecated, message?, replacement?, sunsetDate?, replacementVersion? }`, `deprecated()`, `formatDeprecationWarning`, `getDeprecationHeaders` → `Deprecation: true`, `X-Deprecated-Endpoint`, `X-Replacement-Endpoint`, `Sunset`, `X-Deprecation-Notice`; `assertVersionAvailable` → `NOT_FOUND "Endpoint 'p' is not available in API version vN"`; `DeprecationRegistry` singleton `deprecationRegistry`.
- **Wiring status:** `packages/api/src/index.ts` re-exports the versioning helpers, and `package.json` exposes `./openapi`, `./versioning`, `./deprecation` subpaths, but **no router, procedure, or HTTP handler uses any of it**: there is no `/api/v1/trpc` route, no version header is read, no `X-API-Version`/`Deprecation` response header is emitted, no `deprecationRegistry.register` call exists. `router/v1/index.ts` is a bare re-export. Safe to drop all of it and let Effect HttpApi's generated OpenAPI replace `openapi.ts`.

### 5.d Zod schemas used by clients that need Effect Schema equivalents

| schema | defined | client usage | notes |
|---|---|---|---|
| `CreatePostSchema` | `packages/db/src/schema.ts:39-46` (drizzle-zod) | `apps/nextjs/src/app/_components/posts.tsx:4,51` and `apps/tanstack-start/src/routes/index.tsx:2,88` as TanStack Form `validators.onSubmit`; server `post.create` input | `{ title: string.max(256); content: string.max(256) }`; consider adding `min(1)` (UI currently allows empty) |
| `UpdateUserPreferencesSchema` | `schema.ts:328-331` | server-only input for `settings.updatePreferences`; clients send hand-built partials (Next `preferences.tsx`, Expo `settings.tsx`, operator-core `normalizePreferenceArgs`) | Effect version must be all-optional **without defaults** (see 3.10 bug) |
| `CreateUserPreferencesSchema` | `schema.ts:318-326` | not imported by any client; base of the above | `{ userId; theme default "system"; language max10 default "en"; timezone max50 default "UTC"; emailNotifications?; pushNotifications? }` |
| inline input schemas | routers | Next server actions and Expo build inputs by hand matching them | createApiKey, createInvite, submitWaitlistEntry, updateLaunchControls, reviewWaitlistEntry, listUsers, updateUserRole, completeBootstrap — all transcribed above |
| `@gmacko/validators` | `packages/validators/src/index.ts` | **not imported anywhere** in apps/packages | only the `unused` placeholder; nothing to port |
| `RouterOutputs["post"]["all"][number]` | `@gmacko/api` inferred | Expo `index.tsx:15`, Next `posts.tsx` | clients depend on inferred output types; the contract's `Post` schema must round-trip `Date` for `createdAt`/`updatedAt` (superjson today) |

### 5.e Consumer matrix (which page / tool calls what)

| procedure | Next.js (RSC / action / client) | Expo | TanStack Start | operator-core tool (CLI + MCP) |
|---|---|---|---|---|
| auth.getSession | — (uses better-auth directly) | — | — | — |
| auth.getSecretMessage | — | — | — | — |
| post.all | `page.tsx` prefetch, `posts.tsx` PostList | `index.tsx` | `routes/index.tsx` | `list_posts` |
| post.byId | — | `post/[id].tsx` | — | `get_post` |
| post.create | `posts.tsx` CreatePostForm | `index.tsx` CreatePost | `routes/index.tsx` | `create_post` |
| post.delete | `posts.tsx` PostCard | `index.tsx` | `routes/index.tsx` | `delete_post` |
| settings.getLaunchState | `page.tsx` (RSC), `auth-showcase.tsx` (action) | — | — | — |
| settings.submitWaitlistEntry | `waitlist-form.tsx` (action; `/` + `/contact`) | — | — | — |
| settings.getWorkspaceContext | `settings/page.tsx` (RSC) | `settings.tsx` | — | `get_workspace_context` |
| settings.getPlatformPrimitives | — | — | — | — |
| settings.getBillingOverview | `settings/page.tsx` (RSC) | `settings.tsx` | — | `get_billing_overview` |
| settings.listInvites | `settings/page.tsx` (RSC) | `settings.tsx` | — | — |
| settings.createInvite | `settings/page.tsx` (action) | `settings.tsx` | — | — |
| settings.acceptInvite | — | — | — | — |
| settings.getPreferences | `settings/_components/preferences.tsx` | `settings.tsx` | — | `get_preferences` |
| settings.updatePreferences | `preferences.tsx` | `settings.tsx` | — | `update_preferences` |
| settings.listApiKeys | `settings/_components/api-keys.tsx` | `settings.tsx` | — | `list_api_keys` |
| settings.createApiKey | `api-keys.tsx` | `settings.tsx` | — | `create_api_key` (uses API key auth!) |
| settings.revokeApiKey | `api-keys.tsx` | `settings.tsx` | — | `revoke_api_key` (uses API key auth!) |
| settings.deleteAccount | — | `settings.tsx` AccountSection | — | — |
| admin.getLaunchControls | — | — | — | — |
| admin.updateLaunchControls | — | — | — | — |
| admin.listWaitlistEntries | — | — | — | — |
| admin.reviewWaitlistEntry | — | — | — | — |
| admin.bootstrapStatus | `page.tsx` (RSC) | — | — | — |
| admin.completeBootstrap | `page.tsx` (action) | — | — | — |
| admin.stats | `admin/page.tsx`, `admin/_components/dashboard.tsx` | — | — | — |
| admin.listWorkspaces | — | — | — | — |
| admin.listUsers | `admin/page.tsx`, `dashboard.tsx`, `admin/users/page.tsx`, `users-list.tsx` | — | — | — |
| admin.updateUserRole | `admin/users/_components/users-list.tsx` | — | — | — |
| admin.getUser | — | — | — | — |

Unused by any app or tool (tests only or nothing): `auth.getSession`, `auth.getSecretMessage`, `settings.getPlatformPrimitives`, `settings.acceptInvite`, `admin.getLaunchControls`, `admin.updateLaunchControls`, `admin.listWaitlistEntries`, `admin.reviewWaitlistEntry`, `admin.listWorkspaces`, `admin.getUser` (10 of 31).

Client transports: Next client components → `createTRPCOptionsProxy` over `/api/trpc` (cookie); Next RSC/actions → in-process `createCaller`; Expo → `httpBatchLink` to `/api/trpc` with `Cookie` header from `authClient.getCookie()` and `x-trpc-source: expo-react`; `@gmacko/trpc-client` (`packages/trpc-client/src/client.ts`) → `httpBatchLink` (or `httpLink`) to `${baseUrl}/api/trpc`, `Authorization: Bearer <apiKey>` when given, else `credentials` mode; operator-core/mcp-server/trpc-cli sit on top of `@gmacko/trpc-client` (`GMACKO_API_KEY`, `GMACKO_API_URL`, mcp-server refuses every tool except `auth_help` without a key).

---

## 6. Proposed REST contract summary (one line per endpoint)

| id | method + path | auth | domain errors |
|---|---|---|---|
| auth.session | `GET /api/auth/session` | public | — |
| auth.secret (drop?) | `GET /api/auth/secret` | SessionOrKey(read) | Unauthorized |
| posts.list | `GET /api/posts` | public | — |
| posts.byId | `GET /api/posts/:id` | public | NotFound |
| posts.create | `POST /api/posts` | SessionOrKey(write) | Unauthorized, Forbidden |
| posts.remove | `DELETE /api/posts/:id` | SessionOrKey(write) (or delete) | Unauthorized, Forbidden, NotFound |
| launch.state | `GET /api/launch/state` | public | — |
| waitlist.submit | `POST /api/waitlist` | public | Conflict?, RateLimited? |
| workspace.context | `GET /api/workspace/context` | SessionOrKey(read) | Unauthorized |
| platform.primitives | `GET /api/platform/primitives` | SessionOrKey(read) | Unauthorized |
| billing.overview | `GET /api/billing/overview` | SessionOrKey(read) | Unauthorized |
| workspace.invites.list | `GET /api/workspace/invites` | SessionOrKey(read) | Unauthorized, Forbidden? |
| workspace.invites.create | `POST /api/workspace/invites` | SessionOrKey(write) | Unauthorized, Forbidden(workspace-manager-required), Conflict |
| workspace.invites.accept | `POST /api/workspace/invites/:inviteId/accept` | SessionOrKey(write) | Unauthorized, NotFound, Forbidden(email-mismatch / other-workspace), BadRequest(owner) |
| preferences.get | `GET /api/preferences` | SessionOrKey(read) | Unauthorized |
| preferences.update | `PATCH /api/preferences` | SessionOrKey(write) | Unauthorized, BadRequest |
| apiKeys.list | `GET /api/api-keys` | SessionOrKey(read) | Unauthorized |
| apiKeys.create | `POST /api/api-keys` | Session-only | Unauthorized, Forbidden(session-required) |
| apiKeys.revoke | `DELETE /api/api-keys/:id` | Session-only | Unauthorized, Forbidden, NotFound |
| account.delete | `DELETE /api/account` | Session-only | Unauthorized, Forbidden |
| admin.launch.get | `GET /api/admin/launch` | SessionOrKey(admin) | Unauthorized, Forbidden(admin-required) |
| admin.launch.update | `PATCH /api/admin/launch` | SessionOrKey(admin) | Unauthorized, Forbidden, BadRequest |
| admin.waitlist.list | `GET /api/admin/waitlist` | SessionOrKey(admin) | Unauthorized, Forbidden |
| admin.waitlist.review | `POST /api/admin/waitlist/:id/review` | SessionOrKey(admin) | Unauthorized, Forbidden, NotFound, Conflict |
| bootstrap.status | `GET /api/bootstrap/status` | public | — |
| bootstrap.complete | `POST /api/bootstrap/complete` | Session-only | Unauthorized, Forbidden, Conflict(already-completed/started), NotFound, InternalError |
| admin.stats | `GET /api/admin/stats` | SessionOrKey(admin) | Unauthorized, Forbidden |
| admin.workspaces.list | `GET /api/admin/workspaces` | SessionOrKey(admin) | Unauthorized, Forbidden |
| admin.users.list | `GET /api/admin/users?limit&offset` | SessionOrKey(admin) | Unauthorized, Forbidden, BadRequest |
| admin.users.updateRole | `PATCH /api/admin/users/:userId/role` | SessionOrKey(admin) | Unauthorized, Forbidden(cannot-demote-self), NotFound |
| admin.users.byId | `GET /api/admin/users/:userId` | SessionOrKey(admin) | Unauthorized, Forbidden, NotFound |

Domain error set needed: `Unauthorized`, `Forbidden{reason}` (reasons seen: `admin-required`, `workspace-manager-required`, `invite-email-mismatch`, `already-in-other-workspace`, `cannot-demote-self`, `session-required`), `NotFound{resource}`, `Conflict{reason}` (`invite-exists`, `already-completed`, `already-started`, `allowlist-exists`), `BadRequest` (validation + `owner-invites-unsupported`), `RateLimited` (not implemented today; scopes exist in config), `InternalError`.
