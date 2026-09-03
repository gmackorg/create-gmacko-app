/**
 * Cross-cutting middleware declarations that are part of the contract because
 * they add a status a client can see: the rate limit (429) and the endpoint
 * boundary (500). Like the security declarations these are tags only;
 * packages/api implements them.
 *
 * Neither provides nor requires `CurrentUser`, so they are transparent to the
 * credential/role ordering rule (docs/API_AUTH.md, rule 6): a rate limit may
 * be declared after the credential middleware (it runs outermost and rejects
 * before any database read) without changing what the role check sees.
 */
import { Context, Schema } from "effect";
import { HttpApiMiddleware } from "effect/unstable/httpapi";

import { InternalError, RateLimited } from "./errors";

/**
 * The five scopes `@gmacko/config`'s `platformPrimitives.rateLimits.scopes`
 * names; packages/api asserts the two lists agree. Each limited endpoint is
 * annotated with the scope its calls count against.
 */
export const RateLimitScope = Schema.Literals([
  "auth",
  "contact",
  "signup",
  "api-keys",
  "operator-api",
]);
export type RateLimitScope = typeof RateLimitScope.Type;

/** Endpoint annotation: which scope the `RateLimit` middleware counts the call against. */
export class RateLimitScopeAnnotation extends Context.Service<
  RateLimitScopeAnnotation,
  RateLimitScope
>()("@gmacko/domain/RateLimitScope") {}

/**
 * Rejects with 429 `RateLimited` once the caller exceeds the annotated
 * scope's allowance. Declared last on an endpoint so it runs outermost.
 */
export class RateLimit extends HttpApiMiddleware.Service<RateLimit>()(
  "@gmacko/domain/RateLimit",
  { error: RateLimited },
) {}

/**
 * The api-level boundary of every endpoint (added once in api.ts, before
 * `HealthApi`): one span named `group.endpoint`, one duration sample, and
 * the translation of anything unhandled (a defect, a database failure inside
 * a middleware) into 500 `InternalError`. The cause goes to the log; the
 * body never carries detail (see `InternalError`).
 */
export class EndpointBoundary extends HttpApiMiddleware.Service<EndpointBoundary>()(
  "@gmacko/domain/EndpointBoundary",
  { error: InternalError },
) {}
