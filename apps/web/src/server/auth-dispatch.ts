/**
 * The `/api/auth/*` split, with no Worker runtime in it.
 *
 * `routes/api/auth.$.ts` is the only caller: it supplies the real handlers
 * from `~/server/runtime` (the one module that touches `cloudflare:workers`)
 * and hands the result to `createFileRoute`. Everything here is pure, so the
 * suite exercises the real functions instead of a stand-in for them.
 */
import { AppApi, type RateLimitScope } from "@gmacko/domain";

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
  for (const [index, segment] of want.entries()) {
    if (segment === "*") return have.length > index;
    const actual = have[index];
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
 * Which rate-limit scope one of better-auth's own routes counts against, or
 * `null` for the ones that are not limited here (every GET, and the contract's
 * endpoints, which the `RateLimit` middleware already covers).
 *
 * `signup` is the D1-backed global counter (packages/api/src/rate-limit.ts):
 * sign-up and the magic-link send are the two paths that create an account or
 * send mail, where a per-colo count is not good enough. Everything else that
 * writes goes to the `auth` scope, which is a Cloudflare Rate Limiting
 * binding — enough for a sign-in or callback flood, and no database round
 * trip on the way in.
 */
export const authRateLimitScope = (
  method: string,
  pathname: string,
): RateLimitScope | null => {
  if (method.toUpperCase() !== "POST") return null;
  const path = pathname.replace(/\/+$/, "");
  if (
    path === "/api/auth/sign-in/magic-link" ||
    path.startsWith("/api/auth/sign-up")
  ) {
    return "signup";
  }
  return "auth";
};

/** The two halves of `/api/auth/*`, plus the gate in front of better-auth's half. */
export interface AuthDispatchHandlers {
  readonly api: (request: Request) => Promise<Response>;
  readonly auth: (request: Request) => Promise<Response>;
  /** Answers a 429 to send instead, or `null` to allow. */
  readonly guard?:
    | ((scope: RateLimitScope, request: Request) => Promise<Response | null>)
    | undefined;
}

/**
 * Splits `/api/auth/*` between the HttpApi and better-auth, rate limiting
 * better-auth's half (the HttpApi's half is limited by the contract's
 * middleware). Injected handlers so the split is testable without the Worker
 * runtime.
 */
export const makeAuthDispatch =
  (handlers: AuthDispatchHandlers) =>
  async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (isContractAuthRequest(request.method, pathname)) {
      return handlers.api(request);
    }
    const scope = authRateLimitScope(request.method, pathname);
    if (scope !== null && handlers.guard !== undefined) {
      const refused = await handlers.guard(scope, request);
      if (refused !== null) return refused;
    }
    return handlers.auth(request);
  };
