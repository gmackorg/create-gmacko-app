# Auth + OTLP + Sentry surface research (installed-source evidence)

Research dir: `docs/plans/briefs/auth-research`
Installed: better-auth 1.7.2, @better-auth/expo 1.7.2, auth 1.7.2 (the CLI), @better-auth/cli 1.4.21 (deprecated, see Q4),
kysely-d1 0.4.0, drizzle-orm 1.0.0-rc.5-169397b, effect 4.0.0-rc.112, @effect/opentelemetry 4.0.0-rc.112, @sentry/cloudflare 10.73.0.

Repo state read (not modified): `packages/auth/src/index.ts`, `packages/auth/script/auth-cli.ts`,
`apps/tanstack-start/src/auth/server.ts`, `apps/nextjs/src/auth/server.ts`, `pnpm-workspace.yaml`
(catalog `better-auth: 1.5.5`, `@better-auth/expo: 1.5.5`, `@better-auth/cli: 1.4.21`; overrides
`better-auth` and `@better-auth/core` -> `https://pkg.pr.new/better-auth/better-auth@e9a2a6d`).
Note: the task named `packages/legacy-auth` and `apps/web`; those paths do not exist on this branch. The
equivalent files are `packages/auth` and `apps/tanstack-start` / `apps/nextjs`.

---

## 1. better-auth 1.7.2 vs the pkg.pr.new pin (e9a2a6d)

### What the pin actually is (contradicts the premise)

`gh api repos/better-auth/better-auth/commits/e9a2a6d` -> `"msg":"change version type to minor","date":"2026-04-26"`.

`gh pr view 8814`:
```
{"number":8814,"title":"feat: allow OAuth endpoint overrides for social providers","state":"OPEN",
 "baseRefName":"next","headRefName":"feat/provider-emulator-support","mergedAt":null,
 "commits":[43d4ab0 "feat: support social provider endpoint overrides",
            b7f96c7 "fix: honor remaining provider endpoint overrides",
            bd47b38 "fix: handle remaining provider override regressions",
            d2f7def "docs: add oauth endpoint override docs",
            e9a2a6d "change version type to minor"]}
```
`gh api compare/e9a2a6d...v1.7.2` -> `{"status":"diverged","ahead_by":762,"behind_by":5}` -- all 5 PR
commits are absent from v1.7.2. The pin is NOT "PR #1367 oauth proxy and expo fixes"; it is the
unmerged upstream PR #8814 that adds `authorizationEndpoint` / `tokenEndpoint` / `userInfoEndpoint` /
`jwksEndpoint` to built-in social providers (what `packages/auth/src/index.ts` uses for the emulate stack).

### Does 1.7.2 support the endpoint overrides `packages/auth/src/index.ts` passes?

Partially. `@better-auth/core/dist/oauth2/oauth-provider.d.mts` (`type ProviderOptions`), full key list:
```
clientId?, clientSecret?, scope?, disableDefaultScope?, redirectURI?, authorizationEndpoint?, clientKey?,
disableIdTokenSignIn?, verifyIdToken?, getUserInfo?, refreshAccessToken?, mapProfileToUser?,
disableImplicitSignUp?, disableSignUp?, prompt?, responseMode?, overrideUserInfoOnSignIn?, requireEmailVerification?
```
```ts
  /**
   * Custom authorization endpoint URL.
   * Use this to override the default authorization endpoint of the provider.
   * Useful for testing with local OAuth servers or using sandbox environments.
   */
  authorizationEndpoint?: string | undefined;
```
and it is honored (`core/dist/oauth2/create-authorization-url.mjs:22`):
`const url = new URL(options.authorizationEndpoint || authorizationEndpoint);`

There is NO `tokenEndpoint`, `userInfoEndpoint`, or `jwksEndpoint` on `ProviderOptions`. The provider impls hard-code them:
- `core/dist/social-providers/github.mjs:9` `const tokenEndpoint = "https://github.com/login/oauth/access_token";`, `:66` `betterFetch("https://api.github.com/user"`
- `google.mjs:96/107` `tokenEndpoint: "https://oauth2.googleapis.com/token"`, `:146` `betterFetch("https://www.googleapis.com/oauth2/v3/certs")`
- `apple.mjs:11` `const tokenEndpoint = "https://appleid.apple.com/auth/token";`, `:89` `betterFetch("https://appleid.apple.com/auth/keys")`

Because `satisfies BetterAuthOptions` is used, passing `tokenEndpoint`/`userInfoEndpoint`/`jwksEndpoint` will be a type error
on 1.7.2 and, even cast away, silently ignored at runtime. Escape hatches that DO exist in 1.7.2:
- `ProviderOptions.getUserInfo?: (token) => Promise<{user, data} | null>` (override the user-info fetch per provider).
- `genericOAuth` plugin (`better-auth/plugins`, `better-auth/plugins/generic-oauth`), `GenericOAuthConfig` keys include
  `providerId, discoveryUrl?, authorizationUrl?, tokenUrl?, userInfoUrl?, clientId, clientSecret?, pkce?, ...` -- i.e. run the
  emulated GitHub/Google/Apple as generic providers (v1.7.0 notes: "Rewrote the generic OAuth plugin as a first-class social
  provider with OAuth 2.1 defaults (#9069) ... Callbacks move to `/api/auth/callback/:id`, `pkce` now defaults to `true`").

### oAuthProxy / expo in 1.7.2

No changelog entry between 1.7.0-beta.2 and 1.7.2 mentions oauth-proxy. Installed surface
(`better-auth/dist/plugins/oauth-proxy/index.d.mts`):
```ts
interface OAuthProxyOptions {
  currentURL?: string | undefined;
  productionURL?: string | undefined;   // "default to `BETTER_AUTH_URL`"
  maxAge?: number | undefined;          // "@default 60 (1 minute)" replay window
  secret?: string | SecretConfig | undefined; // dedicated proxy secret
}
declare const oAuthProxy: <O extends OAuthProxyOptions>(opts?: O) => { id: "oauth-proxy"; ... endpoints: { oAuthProxy: StrictEndpoint<"/oauth-proxy-callback", ...> } }
```
`oAuthProxy({ productionURL })` as used in the repo is unchanged.

Expo server plugin (`@better-auth/expo/dist/index.d.ts`):
```ts
interface ExpoOptions { disableOriginOverride?: boolean | undefined; }
declare const expo: (options?: ExpoOptions | undefined) => { id: "expo"; init: (ctx) => { options: { trustedOrigins: string[] } }; onRequest(...); hooks: {...}; endpoints: { expoAuthorizationProxy: StrictEndpoint<"/expo-authorization-proxy", { query: { authorizationURL, oauthState? } }> } }
```
Import: `import { expo } from "@better-auth/expo"`; peers `better-auth ^1.7.2`, `@better-auth/core ^1.7.2`. `expo()` unchanged.

v1.7.0 release notes, `@better-auth/expo` breaking change (client side, affects `apps/expo/src/utils/api.tsx:37` `authClient.getCookie()`):
> Switched Expo secure storage to async access ... (#10438) **Migration:** `getCookie()` now returns a promise, and custom
> storage implementations must provide both synchronous and asynchronous SecureStore methods.
`@better-auth/expo/dist/client.d.ts:123` -> `getCookie: () => Promise<string>;`

### Breaking changes 1.7.0 -> 1.7.2 relevant to the repo's options

From `gh release view v1.7.0/v1.7.1/v1.7.2`:
- `experimental: { joins: true }` -> `advanced: { database: { joins: true } }` (not used by repo).
- `advanced.trustedProxyHeaders`: "If your proxy exposes the public hostname only through `x-forwarded-host`, set
  `advanced.trustedProxyHeaders: true`. Deployments where the proxy rewrites `Host` (... Cloudflare ...) are unaffected."
- generic OAuth plugin rewrite (#9069) -- only matters if you adopt `genericOAuth` as the emulator workaround.
- Electron plugin `trustedOrigins` semantics: "host-bearing custom-scheme entries now match that host exactly" (repo uses bare `expo://`, fine).
- v1.7.2: "Allowed `~` in relative callback URLs validated by trusted-origin checks (#10041)"; "Allowed same-origin form submissions with
  `Referrer-Policy: no-referrer` (#10959)"; "Fixed programmatic migrations on Cloudflare D1 while preserving existing-index validation (#10875)".
- `@better-auth/drizzle-adapter` 1.7.2: "Fixed one-to-one Drizzle relations when `usePlural` is enabled (#10941)"; "Added validation for missing Drizzle schema fields in compound `where` clauses (#10859)".

Types unchanged vs repo usage (`@better-auth/core/dist/types/init-options.d.mts`):
```ts
trustedOrigins?: (string[] | ((request?: Request | undefined) => Awaitable<(string | undefined | null)[]>)) | undefined;   // :1217
onAPIError?: { throw?: boolean; onError?: (error: unknown, ctx: AuthContext) => void | Promise<void>; ... }             // :1419
```
magicLink (`better-auth/dist/plugins/magic-link/index.d.mts`):
```ts
sendMagicLink: (data: { email: string; url: string; token: string; metadata?: Record<string, any> }, ctx?: GenericEndpointContext) => Awaitable<void>;
allowedAttempts?: number; // @deprecated ... any value other than `1` is ignored and emits a console.warn
```
tanstack-start (`better-auth/dist/integrations/tanstack-start.d.mts`):
```ts
import { tanstackStartCookies } from "better-auth/tanstack-start";
declare const tanstackStartCookies: () => { id: "tanstack-start-cookies"; version: string; hooks: { after: [...] } };
```
Impl lazily does `await import("@tanstack/react-start/server")` (peer `@tanstack/react-start ^1.0.0`); Solid variant is `better-auth/tanstack-start/solid`.
Also: `better-auth@1.7.2` `dependencies` pin `@better-auth/core: 1.7.2` exactly, so the repo's `@better-auth/core` override must be dropped along with the pkg.pr.new override (otherwise duplicate core instances -> the `as any` hack in `apps/nextjs/src/auth/server.ts` stays).

---

## 2. drizzleAdapter with `provider: "sqlite"` on D1

Import: `import { drizzleAdapter } from "better-auth/adapters/drizzle"` (re-export of `@better-auth/drizzle-adapter`; `relations-v2` entry also exists).

`@better-auth/drizzle-adapter/dist/index.d.mts`:
```ts
interface DrizzleAdapterConfig {
  schema?: Record<string, any> | undefined;      // "The schema object that defines the tables and fields"
  provider: "pg" | "mysql" | "sqlite";
  usePlural?: boolean | undefined;               // schema key "users" instead of "user"
  debugLogs?: DBAdapterDebugLogOption | undefined;
  camelCase?: boolean | undefined;               // "By default snake case is used for table and field names when the CLI is used ... @default false"
  transaction?: boolean | undefined;             // "If the database doesn't support transactions, set this to `false` ... @default false"
  schemaName?: string | undefined;               // PostgreSQL only
}
declare const drizzleAdapter: (db: DB, config: DrizzleAdapterConfig) => (options: BetterAuthOptions) => DBAdapter<BetterAuthOptions>;
```
Schema resolution (`dist/index.mjs`): `const schema = config.schema || db._.fullSchema;` -- a `drizzle(d1, { schema })` instance works without passing `schema` explicitly.

Promise-based `drizzle-orm/d1`: yes. Every adapter method `await`s the builder (`(await builder.returning())[0]`, `await db.select()...`), and
`drizzle-orm/d1/driver.d.ts` returns `DrizzleD1Database extends SQLiteAsyncDatabase<'async', D1RunResult>`. The only `db.transaction(...)`
calls on the non-mysql path are gated by the option:
```js
transaction: config.transaction ?? false ? (cb) => db.transaction((tx) => { ... }) : false
```
(the other `db.transaction(...)` call sites at lines 115/488/529 are inside `config.provider === "mysql"` branches). So with the default
`transaction: false` the adapter never calls `db.transaction` on D1. Do NOT set `transaction: true`: `drizzle-orm/d1/session.js:73-85` implements
it as `begin` / `commit` / `rollback` raw statements, which D1 rejects.

Kysely path (issue #4732 context): better-auth 1.7.2 accepts a raw D1 binding directly. `init-options.d.mts:525`
`database?: (PostgresPool | MysqlPool | SqliteDatabase | Dialect | DBAdapterInstance | Database | DatabaseSync | D1Database | { dialect, type, casing?, debugLogs?, transaction? } | { db: Kysely<any>, type, casing?, debugLogs?, transaction? })`.
`@better-auth/kysely-adapter/dist/index.mjs`:
```js
if ("batch" in db && "exec" in db && "prepare" in db) {
  const { createD1IndexIntrospector, D1SqliteDialect } = await import("./d1-sqlite-dialect-D4qp4-wW.mjs");
  dialect = new D1SqliteDialect({ database: db }); introspectIndexes = createD1IndexIntrospector(db); transaction = false;
}
```
and the built-in dialect throws `"D1 does not support interactive transactions. Use the D1 batch() API instead."` from
`beginTransaction/commitTransaction/rollbackTransaction`. `KyselyAdapterConfig.transaction?: boolean // @default false`.
=> `kysely-d1` is not required for better-auth itself; `database: env.DB` works out of the box (Kysely tables, not the Drizzle schema).

---

## 3. Session cookie names and the `__Secure-` prefix

`better-auth/dist/cookies/cookie-utils.mjs:10-11`: `const SECURE_COOKIE_PREFIX = "__Secure-"; const HOST_COOKIE_PREFIX = "__Host-";`

`better-auth/dist/cookies/index.mjs` `createCookieGetter`:
```js
const secureCookiePrefix = (options.advanced?.useSecureCookies !== void 0
  ? options.advanced?.useSecureCookies
  : dynamicProtocol === "https" ? true : dynamicProtocol === "http" ? false
  : baseURLString ? baseURLString.startsWith("https://") : isProduction) ? SECURE_COOKIE_PREFIX : "";
...
const prefix = options.advanced?.cookiePrefix || "better-auth";
const name = options.advanced?.cookies?.[cookieName]?.name || `${prefix}.${cookieName}`;
return { name: `${secureCookiePrefix}${name}`, attributes: { secure: !!secureCookiePrefix, sameSite: "lax", path: "/", httpOnly: true, ...domain, ...options.advanced?.defaultCookieAttributes, ...overrideAttributes, ...attributes } };
```
`isProduction` = `nodeENV === "production"` (`@better-auth/core/dist/env/env-impl.mjs:32`). Precedence: `advanced.useSecureCookies` >
dynamic baseURL protocol > `baseURL.startsWith("https://")` > `NODE_ENV === "production"`.

Cookie names (`getCookies`):
- `session_token` -> `better-auth.session_token` / `__Secure-better-auth.session_token`, `maxAge: options.session?.expiresIn || sec("7d")`
- `session_data` -> `better-auth.session_data`, `maxAge: options.session?.cookieCache?.maxAge || 300`
- `account_data` -> `better-auth.account_data` (same maxAge rule)
- `dont_remember` -> `better-auth.dont_remember`
Reader helper `getSessionCookie(request, { cookiePrefix?, cookieName?, path? })` checks `__Secure-${name}` then `${name}`, and both `prefix.name` and `prefix-name`.

`session.cookieCache` (`init-options.d.mts:952`):
```ts
cookieCache?: {
  maxAge?: number;                       // @default 5 minutes (5 * 60)
  enabled?: boolean;                     // @default false
  strategy?: "compact" | "jwt" | "jwe";  // @default "compact"
  refreshCache?: boolean | { updateAge?: number };  // stateless refresh before expiry; @default false
  version?: string | ((session, user) => string) | ((session, user) => Promise<string>);  // @default "1"
};
```
`advanced` (`init-options.d.mts`): `useSecureCookies?: boolean` (:281, "By default, cookies are secure in production environments"),
`cookiePrefix?: string` (:347, default "better-auth"), `cookies?: { [key]: { name?, attributes? } }` (:331), `defaultCookieAttributes?: CookieOptions` (:337),
`crossSubDomainCookies?: { enabled: boolean; domain?: string }` (:314), `trustedProxyHeaders?: boolean` (:403), `database?.joins?: boolean` (:389).

---

## 4. Schema generation CLI for drizzle sqlite

`@better-auth/cli@1.7.2` does not exist. `pnpm view @better-auth/cli dist-tags` -> `latest: 1.4.21`, `beta: 1.5.0-beta.13`; 1.4.21 is
deprecated ("Package no longer supported") and hard-pins `better-auth: 1.4.21`, `drizzle-orm ^0.41.0`. The CLI moved to the npm package
`auth` (`pnpm view auth`: `latest: 1.7.2`, `bin: { "better-auth": "./dist/index.mjs", "auth": "./dist/index.mjs" }`, deps `better-auth: 1.7.2`,
`c12 ^4.0.0-beta.5`, `jiti ^2.7.0`). v1.7.0 notes say `npx auth@latest generate`.

Command shape (`node auth/dist/index.mjs generate --help`):
```
Usage: better-auth generate [options]
  -c, --cwd <cwd>      the working directory
  --config <config>    the path to the configuration file
  --output <output>    the file to output to the generated schema
  --adapter <adapter>  specify the adapter type (e.g., prisma, drizzle, kysely) without requiring a configured adapter
  --dialect <dialect>  specify the database dialect/provider (e.g., postgresql, mysql, sqlite). For drizzle, postgresql maps to 'pg'
  -y, --yes
```
Repo equivalent: `pnpx auth@1.7.2 generate --config script/auth-cli.ts --output ../db/src/auth-schema.ts` (replace `@better-auth/cli`).

Runtime DB at CLI time: the config file is always fully evaluated (`getConfig` -> c12 `loadConfig({ configFile, dotenv: { fileName: [".env", ".env.local"] }, jitiOptions, resolveModule: resolveAuthModule })`,
`resolveAuthModule = (mod) => mod?.auth ?? mod?.default?.auth ?? mod?.default ?? mod`). It then reads `config.options` and:
```js
if (options.adapter) adapter = createMockAdapter$1(options.adapter, options.dialect);
else adapter = await getAdapter(config)...
```
`getAdapter(config)` instantiates the real adapter (`drizzleAdapter(db, ...)(options)`), which only touches `db._.fullSchema`; no query is
issued for drizzle generation (`generateDrizzleSchema` reads `adapter.options.provider / schemaName / adapterConfig.usePlural / camelCase`).
The mock path (`--adapter drizzle --dialect sqlite`) skips the adapter entirely but then `usePlural`/`camelCase`/`schemaName` from your
config are NOT seen (`options: { adapterConfig: { adapterId }, provider }`). D1 is never needed; the module import of the D1 binding is.

Recommended fake-instance pattern for `script/auth-cli.ts`: keep the auth factory taking a `db` argument and build a drizzle instance from a
dummy client, e.g. `drizzle({} as D1Database, { schema })` from `drizzle-orm/d1` (driver only stores the client; `_.fullSchema` is populated
from `schema`), or `drizzleAdapter({ _: { fullSchema: schema } }, { provider: "sqlite" })`. Output is snake_case unless `camelCase: true`
(`convertToSnakeCase(name, camelCase)`), and an `output` of an existing directory is turned into `auth-schema.ts`.

---

## 5. `@effect/opentelemetry` 4.0.0-rc.112 and the OTLP layers

`@effect/opentelemetry/dist/index.d.ts` exports exactly: `NodeSdk, OtelLogger, OtelMetrics, OtelTracer, Resource, WebSdk`.
Package exports: `"."` and `"./*"` (e.g. `@effect/opentelemetry/OtelTracer`). Peers: `@opentelemetry/api >=1.9 <2`, `api-logs`, `resources`,
`sdk-logs`, `sdk-metrics`, `sdk-trace-base`, `sdk-trace-node`, `sdk-trace-web`, `semantic-conventions`, `effect ^4.0.0-rc.112`.

There are NO `Otlp*` layers in `@effect/opentelemetry` (contradicts the assumption). `NodeSdk.js` imports `@opentelemetry/sdk-trace-node`
(Node-only); `WebSdk.js` imports `@opentelemetry/sdk-trace-web`; `OtelTracer.js` imports only `@opentelemetry/api` + `semantic-conventions`
(no `node:` imports anywhere in the package, but it bridges to an OTel `TracerProvider` you must supply: "This module does not create
exporters or span processors by itself").
```ts
// @effect/opentelemetry/OtelTracer
export declare const layer: Layer.Layer<OtelTracer, never, OtelTracerProvider | Resource>;
export declare const layerGlobal: Layer.Layer<OtelTracer, never, Resource>;
export declare const currentOtelSpan: Effect.Effect<Otel.Span, Cause.NoSuchElementError>;
```

The OTLP-over-HTTP layers live in **effect itself**: `effect/unstable/observability` exports
`Otlp, OtlpExporter, OtlpLogger, OtlpMetrics, OtlpResource, OtlpSerialization, OtlpTracer, PrometheusMetrics`. Their `.js` files import only
`effect/*` modules (`OtlpExporter.js` uses `effect/unstable/http/HttpClient`); zero `node:` / `@opentelemetry/*` imports -> Workers-safe.

```ts
// effect/unstable/observability/Otlp
export declare const layer: (options: {
  readonly baseUrl: string;   // posts to `${baseUrl}/v1/logs`, `/v1/metrics`, `/v1/traces`
  readonly resource?: { serviceName?; serviceVersion?; attributes?: Record<string, unknown> };
  readonly headers?: Headers.Input; readonly maxBatchSize?: number;
  readonly tracerContext?: <X>(primitive: Tracer.EffectPrimitive<X>, span: Tracer.AnySpan) => X;
  readonly loggerExportInterval?: Duration.Input; readonly loggerExcludeLogSpans?: boolean; readonly loggerMergeWithExisting?: boolean;
  readonly metricsExportInterval?: Duration.Input; readonly metricsTemporality?: "cumulative" | "delta";
  readonly tracerExportInterval?: Duration.Input; readonly shutdownTimeout?: Duration.Input;
}) => Layer.Layer<never, never, HttpClient.HttpClient | OtlpSerialization.OtlpSerialization>;
export declare const layerJson: (options: /* same */) => Layer.Layer<never, never, HttpClient.HttpClient>;     // provides OtlpSerialization.layerJson
export declare const layerProtobuf: (options) => Layer.Layer<never, never, HttpClient.HttpClient>;
export declare const layerFromConfig: (options?) => Layer.Layer<never, never, HttpClient.HttpClient | OtlpSerialization>; // reads OTEL_EXPORTER_OTLP_*_ENDPOINT, OTEL_SDK_DISABLED, OTEL_BSP_* via effect Config
```
```ts
// effect/unstable/observability/OtlpTracer
export declare const layer: (options: { url: string; resource?; headers?; exportInterval?: Duration.Input; maxBatchSize?: number; context?; shutdownTimeout?: Duration.Input })
  => Layer.Layer<Exporter.Flusher, never, OtlpSerialization | HttpClient.HttpClient>;
// impl: layer = flow(make, Layer.effect(Tracer.Tracer), Layer.provideMerge(Exporter.layerFlusher))
// OtlpLogger.layer(...) -> Layer<Exporter.Flusher, never, HttpClient | OtlpSerialization> (adds mergeWithExisting?, excludeLogSpans?)
// OtlpMetrics.layer(...) -> Layer<Exporter.Flusher, never, HttpClient | OtlpSerialization> (adds temporality?)
```
HttpClient provider without Node deps: `import { FetchHttpClient } from "effect/unstable/http"`; `FetchHttpClient.layer: Layer.Layer<HttpClient.HttpClient>` (imports only effect modules).
Serialization: `OtlpSerialization.layerJson` / `layerProtobuf` (both `Layer<OtlpSerialization, never, never>`).

`Effect.withSpan` tie-in: `Tracer.Tracer` is a `Context.Reference<Tracer>` (`effect/dist/Tracer.d.ts:594`); `OtlpTracer.layer` installs it via
`Layer.effect(Tracer.Tracer)`, so any `Effect.withSpan(effect, "name", { attributes })` run under that layer is exported. `OtelTracer.currentOtelSpan`
also works "with the lightweight OTLP module, such as `OtlpTracer.layer`" (wrapper conforming to OTel `Span`).

Force flush (for `ctx.waitUntil`): `OtlpExporter.Flusher` service
```ts
readonly flush: Effect.Effect<void>;   // "Drains all registered exporters concurrently and cannot fail. ... use `Effect.timeoutOption` to bound"
readonly register: (run: Effect.Effect<void>) => Effect.Effect<void, never, Scope.Scope>;
export declare const layerFlusher: Layer.Layer<Flusher>;  // module-level constant; all Otlp* layers share one registry -> one flush drains logs+metrics+traces
```
Usage: `Effect.gen(function*(){ const f = yield* OtlpExporter.Flusher; yield* f.flush })`, i.e. `ctx.waitUntil(runtime.runPromise(flush))`.
Caveat from the docs: "`flush` cannot await an export that was already in flight when it was called ... it only waits for the exports it initiates."
Exporters also flush on scope close bounded by `shutdownTimeout` (`OtlpExporter.js:165` `Scope.addFinalizer(... Effect.timeoutOption(options.shutdownTimeout))`),
so `ManagedRuntime.dispose()` / `Layer` scope close flushes as well.

---

## 6. `@sentry/cloudflare` 10.73.0 `withSentry`

`@sentry/cloudflare/build/types/withSentry.d.ts`:
```ts
export declare function withSentry<Env = typeof cloudflareEnv, QueueHandlerMessage = unknown, CfHostMetadata = unknown,
  T extends ExportedHandler<Env, QueueHandlerMessage, CfHostMetadata> | WorkerEntrypointConstructor = ExportedHandler<Env, QueueHandlerMessage, CfHostMetadata>>
  (optionsCallback: (env: Env) => CloudflareOptions | undefined, handler: T): T;
```
First argument is a **callback `(env) => CloudflareOptions`**, not an options object (contradicts "withSentry(options, handler)").
`defineCloudflareOptions(optionsOrCallback)` normalizes a static object into that callback (`defineCloudflareOptions.d.ts`).

`fetch` + `scheduled` on one handler object: yes. `build/esm/withSentry.js`:
```js
instrumentExportedHandlerFetch(handler, optionsCallback);
instrumentHonoErrorHandler(handler);
instrumentExportedHandlerScheduled(handler, optionsCallback);
instrumentExportedHandlerEmail(handler, optionsCallback);
instrumentExportedHandlerQueue(handler, optionsCallback);
instrumentExportedHandlerTail(handler, optionsCallback);
return handler;
```
`instrumentScheduled.js`: wraps `handler.scheduled` in a `withIsolationScope` + `startSpan({ op: "faas.cron", name: \`Scheduled Cron ${controller.cron}\` ... })`,
captures with `mechanism.type: "auto.faas.cloudflare.scheduled"`, and `finally { waitUntil(flushAndDispose(client)) }`. Fetch path likewise `waitUntil(flushAndDispose(client))`.
`CloudflareOptions extends Options<CloudflareTransportOptions>, BaseCloudflareOptions { ctx?: ExecutionContextCompat }`; `BaseCloudflareOptions.skipOpenTelemetrySetup?: boolean`
("we set up some OpenTelemetry compatibility via a custom trace provider ... any spans emitted via `@opentelemetry/api` will be captured by Sentry" -- set `true` if you run
your own OTel provider). Also exported from the root: `instrumentD1WithSentry`, `wrapRequestHandler`, `instrumentDurableObjectWithSentry`, `sentryPagesPlugin`. README: "Currently only ESM handlers are supported."
