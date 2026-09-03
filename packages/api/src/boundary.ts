/**
 * The edges of an endpoint: the `EndpointBoundary` middleware (one span
 * named `group.endpoint`, one duration sample, defects → `InternalError`),
 * the request-scoped trace holder the web handler uses for response headers,
 * and the two helpers every handler is written with (`internal`, `withUser`).
 */
import type { RequestContextShape } from "@gmacko/auth/request-context";
import { RequestContext } from "@gmacko/auth/request-context";
import type { Auth } from "@gmacko/auth/service";
import { type Database, DatabaseError } from "@gmacko/db";
import {
  CurrentUser,
  type CurrentUserShape,
  EndpointBoundary,
  InternalError,
} from "@gmacko/domain";
import { Context, Effect, Layer, Metric, Option } from "effect";
import { HttpServerRequest, HttpTraceContext } from "effect/unstable/http";

// ---------------------------------------------------------------------------
// Request trace holder
// ---------------------------------------------------------------------------

export interface RequestTraceShape {
  /** `X-Request-Id` from the caller, or one minted for this request. */
  readonly requestId: string;
  /** Set by the endpoint boundary once its span exists; read for the response header. */
  traceId: string | undefined;
}

/**
 * Provided per request by the web handler (see handler.ts) so the endpoint
 * span can hand its trace id back to the response, success or failure.
 */
export class RequestTrace extends Context.Service<
  RequestTrace,
  RequestTraceShape
>()("@gmacko/api/RequestTrace") {}

// ---------------------------------------------------------------------------
// Endpoint boundary
// ---------------------------------------------------------------------------

/** Milliseconds per endpoint; attribute `endpoint` = `group.endpoint`. */
export const httpServerDuration = Metric.histogram("http.server.duration", {
  description: "API endpoint duration in milliseconds",
  boundaries: Metric.exponentialBoundaries({ start: 1, factor: 2, count: 14 }),
});

const pathOf = (url: string): string => {
  const query = url.indexOf("?");
  return query === -1 ? url : url.slice(0, query);
};

/**
 * Outermost on every `/api` endpoint (it is added at the api level after
 * the endpoint's own middlewares), so the span covers the credential and
 * role checks too, and a database failure that a middleware turned into a
 * defect ends as a 500 `InternalError` with the cause in the log.
 */
export const EndpointBoundaryLive: Layer.Layer<EndpointBoundary> =
  Layer.succeed(EndpointBoundary)(
    EndpointBoundary.of((httpEffect, { endpoint, group }) =>
      Effect.gen(function* () {
        const name = `${group.identifier}.${endpoint.identifier}`;
        const request = yield* HttpServerRequest.HttpServerRequest;
        const trace = yield* Effect.serviceOption(RequestTrace);
        const requestId = Option.map(trace, (t) => t.requestId);
        const duration = Metric.withAttributes(httpServerDuration, {
          endpoint: name,
        });
        const started = yield* Effect.clockWith(
          (clock) => clock.currentTimeMillis,
        );

        const body = Effect.gen(function* () {
          const span = yield* Effect.option(Effect.currentSpan);
          if (Option.isSome(trace) && Option.isSome(span)) {
            trace.value.traceId = span.value.traceId;
          }
          const response = yield* httpEffect.pipe(
            Effect.catchDefect((defect) =>
              Effect.logError(`${name}: unhandled defect`, defect).pipe(
                Effect.andThen(Effect.fail(new InternalError())),
              ),
            ),
          );
          yield* Effect.annotateCurrentSpan(
            "http.response.status_code",
            response.status,
          );
          return response;
        }).pipe(
          Effect.onExit(() =>
            Effect.clockWith((clock) =>
              Effect.flatMap(clock.currentTimeMillis, (now) =>
                Metric.update(duration, now - started),
              ),
            ),
          ),
          Effect.withSpan(name, {
            kind: "server",
            parent: Option.getOrUndefined(
              HttpTraceContext.fromHeaders(request.headers),
            ),
            attributes: {
              "http.request.method": request.method,
              "url.path": pathOf(request.url),
              ...(Option.isSome(requestId)
                ? { "request.id": requestId.value }
                : {}),
            },
          }),
        );

        return yield* Option.isSome(requestId)
          ? Effect.annotateLogs(body, {
              "request.id": requestId.value,
              "http.endpoint": name,
            })
          : Effect.annotateLogs(body, { "http.endpoint": name });
      }),
    ),
  );

// ---------------------------------------------------------------------------
// Handler helpers
// ---------------------------------------------------------------------------

/**
 * The data layer's `DatabaseError` becomes the contract's `InternalError`
 * here, once per handler, after the full cause (reason, driver message) is
 * logged. Handlers stay typed: a service that fails with anything else the
 * contract does not declare is a compile error.
 */
export const internal = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, Exclude<E, DatabaseError> | InternalError, R> =>
  Effect.catchIf(
    effect,
    (error): error is Extract<E, DatabaseError> =>
      error instanceof DatabaseError,
    (error) =>
      Effect.logError("database failure", error).pipe(
        Effect.andThen(Effect.fail(new InternalError())),
      ),
  ) as Effect.Effect<A, Exclude<E, DatabaseError> | InternalError, R>;

/**
 * An authenticated handler body: resolves `CurrentUser`, annotates the log
 * and the endpoint span with the user id, and applies `internal`.
 */
export const withUser = <A, E, R>(
  f: (user: CurrentUserShape) => Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  Exclude<E, DatabaseError> | InternalError,
  R | CurrentUser
> =>
  Effect.flatMap(CurrentUser, (user) =>
    internal(f(user)).pipe(
      Effect.annotateLogs("user.id", user.id),
      Effect.tap(() => Effect.annotateCurrentSpan("user.id", user.id)),
    ),
  );

/** The raw headers as a web `Headers`, the shape `RequestContext` reads. */
const toWebHeaders = (
  request: HttpServerRequest.HttpServerRequest,
): Headers => {
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

/**
 * The request's memoised reads (session, role, memberships): the ones the
 * credential middleware provided when the endpoint has one, else built for
 * this request's headers (public endpoints). Either way one session read per
 * request, however many services ask.
 */
export const requestContext: Effect.Effect<
  RequestContextShape,
  never,
  Auth | Database | HttpServerRequest.HttpServerRequest
> = Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
  RequestContext.forRequest(toWebHeaders(request)),
);
