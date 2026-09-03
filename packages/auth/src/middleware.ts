/**
 * Live layers for the contract's credential and role middlewares
 * (`@gmacko/domain/security`). The mechanics they honour are recorded in
 * docs/API_AUTH.md "Implementation rules (Phase 3)":
 *
 * 1. `HttpApiBuilder` tries a middleware's security schemes in declaration
 *    order and falls through to the next when one fails; a missing cookie
 *    decodes to `Redacted("")`, not a failure. So every scheme here ignores
 *    the decoded credential and looks at the raw request.
 * 2. Bearer beats cookie: any `Authorization` header (not only
 *    `Bearer gmk_…`) makes the request a bearer request, so a bad key can
 *    never fall through to a valid cookie. In `SessionOrKey` the `session`
 *    scheme exists so OpenAPI shows the cookie and always refuses; the
 *    `apiKey` scheme, tried last, is the single path for both credentials
 *    (bearer present ⇒ key path, otherwise cookie path). One path means one
 *    `RequestContext`, one session read, and the failure the builder reports
 *    is the cookie's own (`Forbidden(origin)`, not a spurious 401).
 * 3. A bearer on a `Session`-only endpoint is `Forbidden(scope)`.
 * 4. The raw `Cookie` header goes to better-auth, which reads whichever name
 *    it set (`__Secure-` prefixed over https).
 * 5. `AdminOnly` / `WorkspaceRole` read the database through `RequestContext`,
 *    never the cookie cache. The cookie path itself trusts the cache only
 *    as far as `RequestContext.session` does: it is checked against the
 *    `user` row, so a deleted user is 401 on the next request, not after
 *    the cache's maxAge.
 * 6. The credential middleware is declared last in the contract and so runs
 *    outermost; it provides `CurrentUser` (and the `RequestContext`) to the
 *    role middlewares and the handler inside it.
 *
 * A database failure inside a middleware is a defect (500), never a 401/403:
 * an outage must not read as "not signed in".
 */
import { Database, type DatabaseError } from "@gmacko/db";
import {
  AdminOnly,
  type ApiKeyScope,
  CurrentUser,
  type CurrentUserShape,
  Forbidden,
  Session,
  SessionOrKey,
  Unauthorized,
  type WorkspaceMemberRole,
  WorkspaceRole,
} from "@gmacko/domain";
import { type Context, Effect, Layer } from "effect";
import type { unhandled } from "effect/Types";
import {
  HttpServerRequest,
  type HttpServerResponse,
} from "effect/unstable/http";

import { ApiKeys, type ApiKeysShape } from "./api-keys";
import { RequestContext, type RequestContextShape } from "./request-context";
import { AuthSecurityConfig } from "./security-config";
import { Auth } from "./service";
import { toCurrentUser } from "./user";

export {
  AuthSecurityConfig,
  type AuthSecurityConfigShape,
} from "./security-config";

type Request = HttpServerRequest.HttpServerRequest;
type Wrapped = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  unhandled,
  CurrentUser
>;
type Inner = Effect.Effect<HttpServerResponse.HttpServerResponse, unhandled>;

// ---------------------------------------------------------------------------
// Request inspection
// ---------------------------------------------------------------------------

/** Methods a cookie may authenticate without an Origin check (they must not mutate). */
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The bearer token when an `Authorization` header is present: `undefined`
 * for none, `""` for a header that is not `Bearer <token>`. Any header at all
 * means "this is not a cookie request", so a non-bearer scheme is refused by
 * the key path rather than silently ignored.
 */
export const bearerOf = (request: Request): string | undefined => {
  const value = request.headers.authorization;
  if (value === undefined) return undefined;
  const match = /^bearer\s+(\S.*)$/i.exec(value.trim());
  return match?.[1]?.trim() ?? "";
};

/**
 * Non-GET requests authenticated by cookie must come from an allowlisted
 * `Origin`, or be a same-origin fetch (`Sec-Fetch-Site: same-origin`, sent
 * by browsers that omit `Origin` on same-origin non-CORS requests). The
 * origin is normalised through `URL` and compared exactly (AGENTS.md:
 * exact-host checks); `Origin: null` fails to parse and is refused.
 */
export const originAllowed = (
  request: Request,
  allowed: ReadonlySet<string>,
): boolean => {
  if (SAFE_METHODS.has(request.method)) return true;
  const origin = request.headers.origin;
  if (origin !== undefined) {
    try {
      return allowed.has(new URL(origin).origin);
    } catch {
      return false;
    }
  }
  return request.headers["sec-fetch-site"] === "same-origin";
};

/** The raw headers as a web `Headers`, the shape better-auth reads. */
export const toWebHeaders = (request: Request): Headers => {
  const source = request.source as { readonly headers?: unknown };
  if (source.headers instanceof Headers) return source.headers;
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    // The record carries its type id as a `~`-prefixed key; skip it.
    if (typeof value === "string" && !name.startsWith("~")) {
      headers.append(name, value);
    }
  }
  return headers;
};

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

interface Deps {
  readonly forRequest: (request: Request) => Effect.Effect<RequestContextShape>;
  readonly allowedOrigins: ReadonlySet<string>;
}

/**
 * The services a middleware needs are captured when its layer is built, so
 * the middleware effects themselves need nothing beyond what the router
 * provides per request (that is what their declared type allows).
 */
const makeForRequest: Effect.Effect<
  Deps["forRequest"],
  never,
  Auth | Database
> = Effect.gen(function* () {
  const auth = yield* Auth;
  const database = yield* Database;
  return (request) =>
    RequestContext.forRequest(toWebHeaders(request)).pipe(
      Effect.provideService(Auth, auth),
      Effect.provideService(Database, database),
    );
});

const makeDeps: Effect.Effect<
  Deps,
  never,
  Auth | Database | AuthSecurityConfig
> = Effect.gen(function* () {
  const forRequest = yield* makeForRequest;
  const config = yield* AuthSecurityConfig;
  return { forRequest, allowedOrigins: new Set(config.allowedOrigins) };
});

/**
 * A database failure inside a middleware is a defect. It is not logged
 * here: the router's logger reports every defect once, with the request, so
 * a manual `logError` would print it twice. `what` names the read in the
 * defect for that report.
 */
const orDie =
  (what: string) =>
  <A, E>(
    self: Effect.Effect<A, E | DatabaseError>,
  ): Effect.Effect<A, Exclude<E, DatabaseError>> =>
    self.pipe(
      Effect.catchTag("DatabaseError", (error) =>
        Effect.die(
          new Error(`${what}: database read failed`, { cause: error }),
        ),
      ),
    ) as Effect.Effect<A, Exclude<E, DatabaseError>>;

const provide = (
  wrapped: Wrapped,
  user: CurrentUserShape,
  context: RequestContextShape,
): Inner =>
  wrapped.pipe(
    Effect.provideService(CurrentUser, user),
    Effect.provideService(RequestContext, context),
  );

/** Cookie session → `CurrentUser(credential: "session")`, with the Origin rule on non-GET. */
const cookiePath = (
  deps: Deps,
  wrapped: Wrapped,
  request: Request,
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  unhandled | Unauthorized | Forbidden
> =>
  Effect.gen(function* () {
    const context = yield* deps.forRequest(request);
    const session = yield* context.session;
    if (session === null) return yield* new Unauthorized();
    if (!originAllowed(request, deps.allowedOrigins)) {
      return yield* new Forbidden({ reason: "origin" });
    }
    return yield* provide(
      wrapped,
      toCurrentUser(session.user, "session"),
      context,
    );
  });

/** `gmk_` bearer → `CurrentUser(credential: "key")` when the key holds `scope` or `admin`. */
const keyPath = (
  deps: Deps,
  keys: ApiKeysShape,
  scope: ApiKeyScope,
  wrapped: Wrapped,
  request: Request,
  bearer: string,
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  unhandled | Unauthorized | Forbidden
> =>
  Effect.gen(function* () {
    const context = yield* deps.forRequest(request);
    const key = yield* keys.authenticate(bearer).pipe(orDie("api key lookup"));
    if (
      !key.permissions.includes(scope) &&
      !key.permissions.includes("admin")
    ) {
      return yield* new Forbidden({ reason: "scope" });
    }
    return yield* provide(wrapped, toCurrentUser(key.user, "key"), context);
  });

// ---------------------------------------------------------------------------
// Credential middlewares
// ---------------------------------------------------------------------------

export const SessionLive: Layer.Layer<
  Session,
  never,
  Auth | Database | AuthSecurityConfig
> = Layer.effect(Session)(
  Effect.map(makeDeps, (deps) =>
    Session.of({
      session: (wrapped) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          // Rule 3: the endpoint takes a session only; a bearer of any kind
          // is the wrong credential, not a missing one.
          if (bearerOf(request) !== undefined) {
            return yield* new Forbidden({ reason: "scope" });
          }
          return yield* cookiePath(deps, wrapped, request);
        }),
    }),
  ),
);

/** The service shape shared by the four `SessionOrKey(scope)` tags. */
type ShapeOf<K> = K extends Context.Key<unknown, infer S> ? S : never;
type SessionOrKeyShape = ShapeOf<ReturnType<typeof SessionOrKey<"read">>>;
type WorkspaceRoleShape = ShapeOf<ReturnType<typeof WorkspaceRole<"owner">>>;

const sessionOrKeyLive = <Self>(
  tag: Context.Service<Self, SessionOrKeyShape>,
  scope: ApiKeyScope,
): Layer.Layer<Self, never, Auth | Database | AuthSecurityConfig | ApiKeys> =>
  Layer.effect(tag)(
    Effect.gen(function* () {
      const deps = yield* makeDeps;
      const keys = yield* ApiKeys;
      return tag.of({
        // Rule 2: `session` is declared so OpenAPI shows the cookie scheme and
        // always refuses; the builder falls through to `apiKey`, the single
        // path for both credentials. A cookie request therefore builds one
        // `RequestContext`, reads the session once, and the failure the
        // builder reports last is the cookie's own.
        session: () => Effect.fail(new Unauthorized()),
        apiKey: (wrapped) =>
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest;
            const bearer = bearerOf(request);
            return bearer === undefined
              ? yield* cookiePath(deps, wrapped, request)
              : yield* keyPath(deps, keys, scope, wrapped, request, bearer);
          }),
      });
    }),
  );

/** Built once per scope, like the tags themselves (see security.ts). */
const sessionOrKeyLayers = {
  read: sessionOrKeyLive(SessionOrKey("read"), "read"),
  write: sessionOrKeyLive(SessionOrKey("write"), "write"),
  delete: sessionOrKeyLive(SessionOrKey("delete"), "delete"),
  admin: sessionOrKeyLive(SessionOrKey("admin"), "admin"),
} as const;

/** The live layer for `SessionOrKey(scope)`. */
export const SessionOrKeyLive = <S extends ApiKeyScope>(
  scope: S,
): (typeof sessionOrKeyLayers)[S] => sessionOrKeyLayers[scope];

// ---------------------------------------------------------------------------
// Role middlewares
// ---------------------------------------------------------------------------

export const AdminOnlyLive: Layer.Layer<AdminOnly, never, Auth | Database> =
  Layer.effect(AdminOnly)(
    Effect.map(makeForRequest, (forRequest) =>
      AdminOnly.of((wrapped) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const request = yield* HttpServerRequest.HttpServerRequest;
          const context = yield* forRequest(request);
          // A key's user row was read from the database moments ago (the key
          // lookup joins it); a session's may be the cookie cache's, so
          // rule 5 reads it again.
          const role =
            user.credential === "key"
              ? user.role
              : yield* context.role(user.id).pipe(orDie("AdminOnly"));
          // A user deleted since the credential was read has a `null` role;
          // by contract that is `Forbidden(role)` like any non-admin, not a
          // 401: the credential itself was valid.
          if (role !== "admin") return yield* new Forbidden({ reason: "role" });
          // The handler sees the role the decision was made on, not the
          // cookie's; a `CurrentUser.role` of "admin" is always fresh here.
          return yield* Effect.provideService(wrapped, CurrentUser, {
            ...user,
            role,
          });
        }),
      ),
    ),
  );

const RANK: Readonly<Record<WorkspaceMemberRole, number>> = {
  owner: 3,
  admin: 2,
  member: 1,
};

/**
 * The rank of a stored role, failing closed: `role` is `text` in the
 * database, so a value the contract does not know (a bad migration, a hand
 * edit) ranks 0, below every `minimum`. `RequestContext` already drops such
 * rows before they reach here; this is the second line. `Object.hasOwn`,
 * not `in`: a key such as `"constructor"` is `in` every object literal.
 */
const rankOf = (role: string | null): number =>
  role !== null && Object.hasOwn(RANK, role)
    ? RANK[role as WorkspaceMemberRole]
    : 0;

/**
 * "The current workspace" is `RequestContext.workspace(userId)`: the initial
 * workspace named in application settings when there is one, otherwise the
 * caller's earliest membership. There is no workspace id in these routes'
 * paths; when one appears, resolve it here explicitly rather than from a
 * header.
 */
const workspaceRoleLive = <Self>(
  tag: Context.Service<Self, WorkspaceRoleShape>,
  minimum: WorkspaceMemberRole,
): Layer.Layer<Self, never, Auth | Database> =>
  Layer.effect(tag)(
    Effect.map(makeForRequest, (forRequest) =>
      tag.of((wrapped) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const request = yield* HttpServerRequest.HttpServerRequest;
          const context = yield* forRequest(request);
          const scope = yield* context
            .workspace(user.id)
            .pipe(orDie(`WorkspaceRole(${minimum})`));
          if (scope === null || rankOf(scope.role) < RANK[minimum]) {
            return yield* new Forbidden({ reason: "role" });
          }
          return yield* wrapped;
        }),
      ),
    ),
  );

const workspaceRoleLayers = {
  owner: workspaceRoleLive(WorkspaceRole("owner"), "owner"),
  admin: workspaceRoleLive(WorkspaceRole("admin"), "admin"),
  member: workspaceRoleLive(WorkspaceRole("member"), "member"),
} as const;

/** The live layer for `WorkspaceRole(minimum)`. */
export const WorkspaceRoleLive = <R extends WorkspaceMemberRole>(
  minimum: R,
): (typeof workspaceRoleLayers)[R] => workspaceRoleLayers[minimum];

// ---------------------------------------------------------------------------
// Everything
// ---------------------------------------------------------------------------

/**
 * Every middleware the contract declares, plus the `ApiKeys` service they
 * (and Phase 4's key-management handlers) use. Needs `Auth`, `Database` and
 * `AuthSecurityConfig` from the app.
 */
export const SecurityLive = Layer.mergeAll(
  SessionLive,
  SessionOrKeyLive("read"),
  SessionOrKeyLive("write"),
  SessionOrKeyLive("delete"),
  SessionOrKeyLive("admin"),
  AdminOnlyLive,
  WorkspaceRoleLive("owner"),
  WorkspaceRoleLive("admin"),
  WorkspaceRoleLive("member"),
).pipe(Layer.provideMerge(ApiKeys.layer));
