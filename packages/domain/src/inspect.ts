/**
 * Reads the contract back out of an `HttpApi` (via `HttpApi.reflect`): one
 * row per endpoint with its route, credential, roles, statuses and errors.
 * The credential matrix in docs/API_AUTH.md and the contract tests are both
 * derived from this, so neither can drift from the declarations.
 */
import { Context, Predicate, type Schema } from "effect";
import {
  HttpApi,
  type HttpApiGroup,
  HttpApiMiddleware,
} from "effect/unstable/httpapi";

import { type RateLimitScope, RateLimitScopeAnnotation } from "./middleware";
import { ApiKeyScope } from "./roles";

export interface EndpointInfo {
  readonly group: string;
  readonly id: string;
  readonly method: string;
  readonly path: string;
  /** `public`, `Session`, or `SessionOrKey(<scope>)`. */
  readonly credential: string;
  /** The API-key scope a key needs, or `null` when keys are not accepted. */
  readonly scope: ApiKeyScope | null;
  /** Role middlewares layered on the credential (`AdminOnly`, `WorkspaceRole(admin)`). */
  readonly roles: ReadonlyArray<string>;
  /** Keys of the security middlewares (the ones with a scheme). */
  readonly securityMiddlewares: ReadonlyArray<string>;
  /**
   * `true` when a security middleware is the *last* credential-or-role entry
   * of the endpoint's middleware list. rc.112's `HttpApiBuilder`
   * (`applyMiddleware`) wraps the handler with each middleware in insertion
   * order, so the last one runs outermost: only then does the credential
   * middleware run before the role checks that `require` the `CurrentUser`
   * it provides. Middlewares that neither provide nor require `CurrentUser`
   * (`RateLimit`, `EndpointBoundary`) are transparent to this rule and may
   * sit outside the credential. `false` for public endpoints (nothing to be
   * outermost).
   */
  readonly securityIsOutermost: boolean;
  /** The `RateLimit` scope the endpoint is annotated with, or `null` when unlimited. */
  readonly rateLimit: RateLimitScope | null;
  readonly successStatus: number;
  readonly errors: ReadonlyArray<{
    readonly status: number;
    readonly tag: string;
  }>;
}

const SESSION_KEY = "@gmacko/domain/Session";
const SESSION_OR_KEY_PREFIX = "@gmacko/domain/SessionOrKey/";
const ADMIN_ONLY_KEY = "@gmacko/domain/AdminOnly";
const WORKSPACE_ROLE_PREFIX = "@gmacko/domain/WorkspaceRole/";

/** The credential columns of an `EndpointInfo`, which is where these land. */
type EndpointCredential = Pick<EndpointInfo, "credential" | "scope">;

/** The scope suffix of a `SessionOrKey` middleware key, when it names one. */
const apiKeyScopes: ReadonlyArray<string> = ApiKeyScope.literals;
const isApiKeyScope = (value: string): value is ApiKeyScope =>
  apiKeyScopes.includes(value);

const describeCredential = (
  securityKeys: ReadonlyArray<string>,
): EndpointCredential => {
  if (securityKeys.length === 0) return { credential: "public", scope: null };
  const [key] = securityKeys;
  if (key === SESSION_KEY) return { credential: "Session", scope: null };
  if (key?.startsWith(SESSION_OR_KEY_PREFIX)) {
    const scope = key.slice(SESSION_OR_KEY_PREFIX.length);
    if (isApiKeyScope(scope)) {
      return { credential: `SessionOrKey(${scope})`, scope };
    }
  }
  return { credential: securityKeys.join(" + "), scope: null };
};

const describeRole = (key: string): string | null => {
  if (key === ADMIN_ONLY_KEY) return "AdminOnly";
  if (key.startsWith(WORKSPACE_ROLE_PREFIX)) {
    return `WorkspaceRole(${key.slice(WORKSPACE_ROLE_PREFIX.length)})`;
  }
  return null;
};

/**
 * The schema's `identifier` annotation: the `_tag` for our error classes. Read
 * from the AST, because an endpoint's `error` option wraps the class in a
 * JSON codec that keeps the annotations but not the class statics.
 */
const nameOf = (schema: Schema.Top): string => {
  const identifier = schema.ast.annotations?.identifier;
  return Predicate.isString(identifier) ? identifier : "(anonymous)";
};

/**
 * Generic over `Id`/`Groups` exactly as `HttpApi.reflect` is, and for the same
 * reason: `HttpApi.Top` is invariant in its groups (a group's `prefix()`
 * returns its own type, so `Groups` sits in both positions), which makes no
 * concrete `AppApi` assignable to it. Taking the api the way `reflect` does
 * keeps that assertion out of every caller.
 */
export const inspectApi = <
  Id extends string,
  Groups extends HttpApiGroup.Constraint,
>(
  api: HttpApi.HttpApi<Id, Groups>,
): ReadonlyArray<EndpointInfo> => {
  const rows: Array<EndpointInfo> = [];
  HttpApi.reflect(api, {
    onGroup: () => {},
    onEndpoint: ({ group, endpoint, middleware, successes, errors }) => {
      const security: Array<string> = [];
      const roles: Array<string> = [];
      // Only the middlewares that take part in the CurrentUser flow: the
      // credential (provides it) and the roles (require it).
      const credentialOrRole = [...middleware].filter(
        (service) =>
          HttpApiMiddleware.isSecurity(service) ||
          describeRole(service.key) !== null,
      );
      const last = credentialOrRole[credentialOrRole.length - 1];
      const securityIsOutermost =
        last !== undefined && HttpApiMiddleware.isSecurity(last);
      for (const service of credentialOrRole) {
        if (HttpApiMiddleware.isSecurity(service)) {
          security.push(service.key);
          continue;
        }
        const role = describeRole(service.key);
        if (role) roles.push(role);
      }
      const rateLimit = Context.getOption(
        endpoint.annotations,
        RateLimitScopeAnnotation,
      );
      const successStatus =
        [...successes.keys()].sort((a, b) => a - b)[0] ?? 204;
      const errorRows = [...errors.entries()]
        .flatMap(([status, schemas]) =>
          schemas.map((schema) => ({ status, tag: nameOf(schema) })),
        )
        .sort((a, b) => a.status - b.status || a.tag.localeCompare(b.tag));
      rows.push({
        group: group.identifier,
        id: endpoint.identifier,
        method: endpoint.method,
        path: endpoint.path,
        ...describeCredential(security),
        roles,
        securityMiddlewares: security,
        securityIsOutermost,
        rateLimit: rateLimit._tag === "Some" ? rateLimit.value : null,
        successStatus,
        errors: errorRows,
      });
    },
  });
  return rows;
};
