/**
 * Reads the contract back out of an `HttpApi` (via `HttpApi.reflect`): one
 * row per endpoint with its route, credential, roles, statuses and errors.
 * The credential matrix in docs/API_AUTH.md and the contract tests are both
 * derived from this, so neither can drift from the declarations.
 */
import { HttpApi, HttpApiMiddleware } from "effect/unstable/httpapi";

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
   * `true` when a security middleware is the *last* entry of the endpoint's
   * middleware list. rc.112's `HttpApiBuilder` (`applyMiddleware`) wraps the
   * handler with each middleware in insertion order, so the last one runs
   * outermost: only then does the credential middleware run before the role
   * checks that `require` the `CurrentUser` it provides. `false` for public
   * endpoints (nothing to be outermost).
   */
  readonly securityIsOutermost: boolean;
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

const describeCredential = (
  securityKeys: ReadonlyArray<string>,
): { credential: string; scope: ApiKeyScope | null } => {
  if (securityKeys.length === 0) return { credential: "public", scope: null };
  const [key] = securityKeys;
  if (key === SESSION_KEY) return { credential: "Session", scope: null };
  if (key?.startsWith(SESSION_OR_KEY_PREFIX)) {
    const scope = key.slice(SESSION_OR_KEY_PREFIX.length);
    if (ApiKeyScope.literals.includes(scope as ApiKeyScope)) {
      return {
        credential: `SessionOrKey(${scope})`,
        scope: scope as ApiKeyScope,
      };
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
const nameOf = (schema: {
  readonly ast: { readonly annotations?: unknown };
}): string => {
  const annotations = schema.ast.annotations as
    | { readonly identifier?: unknown }
    | undefined;
  return typeof annotations?.identifier === "string"
    ? annotations.identifier
    : "(anonymous)";
};

export const inspectApi = (api: HttpApi.Top): ReadonlyArray<EndpointInfo> => {
  const rows: Array<EndpointInfo> = [];
  HttpApi.reflect(api, {
    onGroup: () => {},
    onEndpoint: ({ group, endpoint, middleware, successes, errors }) => {
      const security: Array<string> = [];
      const roles: Array<string> = [];
      const ordered = [...middleware];
      const last = ordered[ordered.length - 1];
      const securityIsOutermost =
        last !== undefined && HttpApiMiddleware.isSecurity(last);
      for (const service of ordered) {
        if (HttpApiMiddleware.isSecurity(service)) {
          security.push(service.key);
          continue;
        }
        const role = describeRole(service.key);
        if (role) roles.push(role);
      }
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
        successStatus,
        errors: errorRows,
      });
    },
  });
  return rows;
};
