import { AppApi } from "@gmacko/domain";
import { createFileRoute } from "@tanstack/react-router";

import { apiHandler, authHandler } from "~/server/runtime";

/** One contract endpoint that lives under better-auth's prefix. */
export interface ContractAuthRoute {
  readonly method: string;
  /** The endpoint's path template (`/api/auth/:id/...`), prefixes applied. */
  readonly path: string;
}

/**
 * The contract's own `auth` group shares better-auth's prefix
 * (`/api/auth/session`, `/api/auth/secret`); those method+path pairs are the
 * HttpApi's, everything else under `/api/auth/*` is better-auth's.
 */
export const contractAuthRoutes: ReadonlyArray<ContractAuthRoute> =
  Object.values(AppApi.groups.auth.endpoints).map((endpoint) => ({
    method: endpoint.method,
    path: endpoint.path,
  }));

/**
 * Whether `pathname` is an instance of the endpoint path `template`: a
 * `:param` segment matches any one non-empty segment, a trailing `*`
 * matches the rest, every other segment matches literally. A trailing slash
 * on the request is ignored.
 */
export const matchesPathTemplate = (
  template: string,
  pathname: string,
): boolean => {
  const want = template.split("/").filter((segment) => segment !== "");
  const have = pathname.split("/").filter((segment) => segment !== "");
  for (let i = 0; i < want.length; i++) {
    const segment = want[i] as string;
    if (segment === "*") return have.length > i;
    const actual = have[i];
    if (actual === undefined) return false;
    if (segment.startsWith(":")) continue;
    if (segment !== actual) return false;
  }
  return want.length === have.length;
};

/** Whether the request is one of the contract's `auth` endpoints (method and path). */
export const isContractAuthRequest = (
  method: string,
  pathname: string,
): boolean => {
  const upper = method.toUpperCase();
  return contractAuthRoutes.some(
    (route) =>
      route.method === upper && matchesPathTemplate(route.path, pathname),
  );
};

/**
 * Splits `/api/auth/*` between the HttpApi and better-auth. Injected handlers
 * so the split is testable without the Worker runtime.
 */
export const makeAuthDispatch =
  (handlers: {
    readonly api: (request: Request) => Promise<Response>;
    readonly auth: (request: Request) => Promise<Response>;
  }) =>
  (request: Request): Promise<Response> =>
    isContractAuthRequest(request.method, new URL(request.url).pathname)
      ? handlers.api(request)
      : handlers.auth(request);

const handle = makeAuthDispatch({ api: apiHandler, auth: authHandler });

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      // Every method: better-auth answers what the contract does not claim
      // (its own 404 or 405), so nothing falls through to /api/$.
      ANY: ({ request }) => handle(request),
    },
  },
});
