/**
 * `RateLimiter`: the five config scopes (`@gmacko/config`
 * `platformPrimitives.rateLimits.scopes`, mirrored by the contract's
 * `RateLimitScope`), three layers, and the live `RateLimit` middleware that
 * applies the service to every endpoint annotated with a scope.
 *
 * Which layer to use, and why there are three:
 *
 * - `layerMemory` — a fixed window per (scope, client) in the isolate's
 *   memory. Deliberately weak: Workers run many isolates, each with its own
 *   counters, so the effective allowance is N × isolates and resets when an
 *   isolate is evicted. Tests and hosts with no Cloudflare bindings use it.
 * - `layerD1` — the `rate_limit_window` table: one row per (scope, client,
 *   window), incremented by a guarded upsert. It is the only counter that is
 *   global, so it is what sign-up and magic-link send go through, where the
 *   cost of an over-count is an account or an email rather than a read.
 * - `layerCloudflare` — the Rate Limiting bindings named in wrangler.jsonc,
 *   with `layerD1` under it for any scope with no binding. A binding counts
 *   per colo, not globally, which is the right trade for the read-mostly API
 *   scopes: no database round trip on the hot path.
 *
 * All three fail *open* on their own failure (a database outage, a binding
 * error): a limiter that cannot count must not lock every caller out. The
 * refusal path is the only one that produces `RateLimited`.
 */
import { hashSecret } from "@gmacko/auth/api-keys";
import { Database, type DatabaseShape } from "@gmacko/db";
import { rateLimitWindow } from "@gmacko/db/schema";
import {
  CurrentUser,
  type RateLimit,
  RateLimited,
  type RateLimitScope,
  RateLimitScopeAnnotation,
  RateLimit as RateLimitTag,
  sessionCookieName,
} from "@gmacko/domain";
import { lt, sql } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";
import {
  HttpEffect,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";

import type { Stage } from "./config";

export interface RateLimitPolicy {
  /** Calls allowed per window. */
  readonly limit: number;
  readonly windowMs: number;
}

export type RateLimits = Readonly<Record<RateLimitScope, RateLimitPolicy>>;

const MINUTE = 60_000;

/** Per client, per minute. What every deployed stage uses. */
export const defaultRateLimits: RateLimits = {
  auth: { limit: 20, windowMs: MINUTE },
  contact: { limit: 5, windowMs: MINUTE },
  signup: { limit: 5, windowMs: MINUTE },
  "api-keys": { limit: 10, windowMs: MINUTE },
  "operator-api": { limit: 120, windowMs: MINUTE },
};

/**
 * Development: the same allowances × 20. Not a relaxation for its own sake —
 * the development stage is driven by the Playwright suite, which signs in,
 * creates keys and submits the contact form dozens of times a minute from one
 * address, so an allowance sized for one human is simply the wrong number
 * there. It is still a limit, so a runaway loop is still caught.
 *
 * These must stay in step with the top-level `ratelimits` in
 * apps/web/wrangler.jsonc, which is the development configuration (the
 * per-stage `env` blocks carry `defaultRateLimits`).
 */
export const developmentRateLimits: RateLimits = Object.fromEntries(
  Object.entries(defaultRateLimits).map(([scope, policy]) => [
    scope,
    { limit: policy.limit * 20, windowMs: policy.windowMs },
  ]),
) as RateLimits;

/**
 * The policies a stage runs with. Alongside `canAutoCreateAccounts`: a value
 * chosen by stage, not a different code path.
 */
export const rateLimitsFor = (stage: Stage): RateLimits =>
  stage === "development" ? developmentRateLimits : defaultRateLimits;

export interface RateLimiterShape {
  /** Counts one call for `client` against `scope`; `RateLimited` once over the allowance. */
  readonly consume: (
    scope: RateLimitScope,
    client: string,
  ) => Effect.Effect<void, RateLimited>;
}

/**
 * A Cloudflare Rate Limiting binding, structurally: `workers-types` calls it
 * `RateLimit`, which collides with the contract's middleware of that name, and
 * the shape is one method.
 */
export interface RateLimitBinding {
  readonly limit: (options: {
    readonly key: string;
  }) => Promise<{ readonly success: boolean }>;
}

/** The bindings wrangler.jsonc declares, by scope. A missing scope falls to D1. */
export type RateLimitBindings = Partial<
  Readonly<Record<RateLimitScope, RateLimitBinding>>
>;

type Consume = RateLimiterShape["consume"];

/** Allows the call and says why, for a limiter that could not count. */
const allowAfter = (
  message: string,
  fields: Record<string, unknown>,
): Effect.Effect<void> =>
  Effect.andThen(Effect.logWarning(message, fields), Effect.void);

/** See `RateLimiter.layerD1`. */
const consumeD1 =
  (database: DatabaseShape, limits: RateLimits): Consume =>
  (scope, client) =>
    Effect.clockWith((clock) =>
      Effect.flatMap(clock.currentTimeMillis, (now) => {
        const policy = limits[scope];
        const windowStart = Math.floor(now / policy.windowMs) * policy.windowMs;
        const resetAt = windowStart + policy.windowMs;
        return database.db
          .insert(rateLimitWindow)
          .values({
            key: `${scope}:${client}:${windowStart}`,
            scope,
            count: 1,
            expiresAt: new Date(resetAt),
          })
          .onConflictDoUpdate({
            target: rateLimitWindow.key,
            set: { count: sql`${rateLimitWindow.count} + 1` },
            // The guard: no row comes back once the window is spent.
            setWhere: lt(rateLimitWindow.count, policy.limit),
          })
          .returning({ count: rateLimitWindow.count })
          .pipe(
            Effect.flatMap((rows) =>
              rows.length > 0
                ? Effect.void
                : Effect.fail(
                    new RateLimited({
                      retryAfterSeconds: Math.max(
                        1,
                        Math.ceil((resetAt - now) / 1000),
                      ),
                    }),
                  ),
            ),
            Effect.catchTag("DatabaseError", (cause) =>
              allowAfter("rate limit counter unavailable; allowing", {
                scope,
                cause,
              }),
            ),
          );
      }),
    );

interface Window {
  count: number;
  resetAt: number;
}

/** Bound on remembered (scope, client) pairs before the oldest are dropped. */
const MAX_WINDOWS = 10_000;

export class RateLimiter extends Context.Service<
  RateLimiter,
  RateLimiterShape
>()("@gmacko/api/RateLimiter") {
  /** Fixed windows in this isolate's memory (see the module comment). */
  static layerMemory = (
    limits: RateLimits = defaultRateLimits,
  ): Layer.Layer<RateLimiter> =>
    Layer.sync(RateLimiter)(() => {
      const windows = new Map<string, Window>();
      return RateLimiter.of({
        consume: (scope, client) =>
          Effect.clockWith((clock) =>
            Effect.flatMap(clock.currentTimeMillis, (now) => {
              const policy = limits[scope];
              const key = `${scope}\u0000${client}`;
              const current = windows.get(key);
              if (current === undefined || current.resetAt <= now) {
                if (windows.size >= MAX_WINDOWS) {
                  const oldest = windows.keys().next().value;
                  if (oldest !== undefined) windows.delete(oldest);
                }
                windows.set(key, {
                  count: 1,
                  resetAt: now + policy.windowMs,
                });
                return Effect.void;
              }
              if (current.count >= policy.limit) {
                return Effect.fail(
                  new RateLimited({
                    retryAfterSeconds: Math.max(
                      1,
                      Math.ceil((current.resetAt - now) / 1000),
                    ),
                  }),
                );
              }
              current.count += 1;
              return Effect.void;
            }),
          ),
      });
    });

  /**
   * The `rate_limit_window` table: one row per (scope, client, window start),
   * created or incremented by a single guarded upsert
   * (`ON CONFLICT … DO UPDATE SET count = count + 1 WHERE count < limit
   * RETURNING count`). No rows come back exactly when the guard refused, so
   * the whole read-check-write is one D1 round trip and one statement, which
   * is what makes it safe without a transaction (D1 has none).
   *
   * A new window is a new row rather than a reset, so nothing has to expire
   * in place; `Jobs.pruneRateLimitWindows` deletes the past ones on the cron
   * tick.
   */
  static layerD1 = (
    limits: RateLimits = defaultRateLimits,
  ): Layer.Layer<RateLimiter, never, Database> =>
    Layer.effect(RateLimiter)(
      Effect.map(Database, (database) =>
        RateLimiter.of({ consume: consumeD1(database, limits) }),
      ),
    );

  /**
   * Cloudflare Rate Limiting bindings by scope (wrangler.jsonc `ratelimits`),
   * with `layerD1` behind them for every scope that has no binding — which is
   * `signup`, on purpose: a binding counts per colo, and sign-up is the one
   * scope where that is not good enough.
   */
  static layerCloudflare = (options: {
    readonly bindings: RateLimitBindings;
    readonly limits?: RateLimits | undefined;
  }): Layer.Layer<RateLimiter, never, Database> => {
    const limits = options.limits ?? defaultRateLimits;
    return Layer.effect(RateLimiter)(
      Effect.map(Database, (database) => {
        const fallback = consumeD1(database, limits);
        return RateLimiter.of({
          consume: (scope, client) => {
            const binding = options.bindings[scope];
            if (binding === undefined) return fallback(scope, client);
            const policy = limits[scope];
            return Effect.tryPromise(() =>
              binding.limit({ key: `${scope}:${client}` }),
            ).pipe(
              // Fail open: a binding that errors must not lock callers out.
              Effect.catchCause((cause) =>
                Effect.as(
                  allowAfter("rate limit binding failed; allowing", {
                    scope,
                    cause,
                  }),
                  { success: true },
                ),
              ),
              Effect.flatMap((outcome) =>
                outcome.success
                  ? Effect.void
                  : Effect.fail(
                      new RateLimited({
                        // A binding's window is `period` in wrangler.jsonc,
                        // which must equal the scope's `windowMs`.
                        retryAfterSeconds: Math.max(
                          1,
                          Math.ceil(policy.windowMs / 1000),
                        ),
                      }),
                    ),
              ),
            );
          },
        });
      }),
    );
  };
}

export const RETRY_AFTER_HEADER = "retry-after";

/** Enough of a SHA-256 to tell credentials apart; never the credential itself. */
const fingerprint = (secret: string): Effect.Effect<string> =>
  Effect.map(hashSecret(secret), (hex) => hex.slice(0, 16));

/**
 * The session cookie as sent (either name, see `sessionCookieName`), or
 * `undefined`. The cookie is not validated here: the key only has to tell
 * callers apart, and the credential middleware inside decides whether it is
 * good.
 */
const sessionCookieOf = (
  request: HttpServerRequest.HttpServerRequest,
): string | undefined =>
  request.cookies[sessionCookieName(true)] ??
  request.cookies[sessionCookieName(false)];

/** Cloudflare's client address, else the first `X-Forwarded-For` hop, else the socket. */
const addressOf = (
  request: HttpServerRequest.HttpServerRequest,
): string | undefined =>
  request.headers["cf-connecting-ip"] ??
  request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ??
  Option.getOrUndefined(request.remoteAddress);

/**
 * Who is calling, for the counter key. `RateLimit` is declared last on an
 * endpoint and so runs outermost, before the credential middleware has read
 * anything, so the identity is the credential *as sent*, in this order:
 *
 * 1. `user:<id>` when a `CurrentUser` is already in context (an entry point
 *    that authenticated the request before handing it to the API);
 * 2. `key:<hash>` for any `Authorization` header, valid or not: a caller
 *    hammering an endpoint with a bad key is one caller;
 * 3. `session:<hash>` for the session cookie, so in-process SSR calls, which
 *    carry the browser's cookie but no client address, are keyed per user
 *    rather than sharing one bucket;
 * 4. `ip:<address>` for anonymous calls (`cf-connecting-ip`, the first
 *    `X-Forwarded-For` hop, the socket address);
 * 5. `anon:<random>` with a warning when there is nothing to key on at all:
 *    a per-request key, so the limit is not enforced, rather than one shared
 *    bucket that every such call would exhaust for every other.
 *
 * Credentials are keyed by a hash prefix so the counter map never holds a
 * secret.
 */
export const clientKeyOf = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const user = yield* Effect.serviceOption(CurrentUser);
    if (Option.isSome(user)) return `user:${user.value.id}`;
    const authorization = request.headers.authorization?.trim();
    if (authorization !== undefined && authorization !== "") {
      return `key:${yield* fingerprint(authorization)}`;
    }
    const cookie = sessionCookieOf(request);
    if (cookie !== undefined && cookie !== "") {
      return `session:${yield* fingerprint(cookie)}`;
    }
    const address = addressOf(request);
    if (address !== undefined && address !== "") return `ip:${address}`;
    yield* Effect.logWarning(
      "rate limit: request carries no credential and no client address; counted alone",
    );
    return `anon:${crypto.randomUUID()}`;
  });

/** The session cookie on a plain fetch `Request`, either name. */
const sessionCookieOfRequest = (request: Request): string | undefined => {
  const header = request.headers.get("cookie");
  if (header === null) return undefined;
  const wanted = [sessionCookieName(true), sessionCookieName(false)];
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (wanted.includes(name)) return part.slice(separator + 1).trim();
  }
  return undefined;
};

/**
 * `clientKeyOf` for a plain fetch `Request`: the routes that are not HttpApi
 * endpoints — better-auth's own `/api/auth/*` — have no `HttpServerRequest`
 * and no `CurrentUser`, so the order is the same minus that first step.
 */
export const clientKeyOfRequest = (request: Request): Effect.Effect<string> =>
  Effect.gen(function* () {
    const authorization = request.headers.get("authorization")?.trim();
    if (authorization !== undefined && authorization !== "") {
      return `key:${yield* fingerprint(authorization)}`;
    }
    const cookie = sessionCookieOfRequest(request);
    if (cookie !== undefined && cookie !== "") {
      return `session:${yield* fingerprint(cookie)}`;
    }
    const address =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (address !== undefined && address !== null && address !== "") {
      return `ip:${address}`;
    }
    yield* Effect.logWarning(
      "rate limit: request carries no credential and no client address; counted alone",
    );
    return `anon:${crypto.randomUUID()}`;
  });

/** Counts one call against `scope` for a plain fetch `Request`. */
export const consumeForRequest = (
  scope: RateLimitScope,
  request: Request,
): Effect.Effect<void, RateLimited, RateLimiter> =>
  Effect.flatMap(clientKeyOfRequest(request), (client) =>
    Effect.flatMap(RateLimiter, (limiter) => limiter.consume(scope, client)),
  );

/**
 * The 429 for a route outside the HttpApi, with the same body the contract's
 * `RateLimited` encodes to and the same `Retry-After` header the middleware
 * sets, so a client cannot tell the two paths apart.
 */
export const rateLimitedResponse = (refused: RateLimited): Response =>
  new Response(
    JSON.stringify({
      _tag: "RateLimited",
      retryAfterSeconds: refused.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        [RETRY_AFTER_HEADER]: String(refused.retryAfterSeconds),
      },
    },
  );

/**
 * The contract's `RateLimit` middleware over the `RateLimiter` service. A
 * refusal also sets `Retry-After` (seconds) on the 429, through a
 * pre-response handler since the error body is encoded outside the
 * middleware.
 */
export const RateLimitLive: Layer.Layer<RateLimit, never, RateLimiter> =
  Layer.effect(RateLimitTag)(
    Effect.map(RateLimiter, (limiter) =>
      RateLimitTag.of((httpEffect, { endpoint }) => {
        const scope = Context.getOption(
          endpoint.annotations,
          RateLimitScopeAnnotation,
        );
        if (Option.isNone(scope)) return httpEffect;
        return Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
          clientKeyOf(request).pipe(
            Effect.flatMap((client) => limiter.consume(scope.value, client)),
            Effect.tapError((refused) =>
              HttpEffect.appendPreResponseHandler((_request, response) =>
                Effect.succeed(
                  response.status === 429
                    ? HttpServerResponse.setHeader(
                        response,
                        RETRY_AFTER_HEADER,
                        String(refused.retryAfterSeconds),
                      )
                    : response,
                ),
              ),
            ),
            Effect.andThen(httpEffect),
          ),
        );
      }),
    ),
  );
