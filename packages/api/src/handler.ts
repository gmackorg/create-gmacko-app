/**
 * `makeWebHandler`: `ApiLive` as a fetch-style handler over the app's
 * services, with the per-request plumbing that lives outside any endpoint:
 * CORS (from `AppConfig.allowedOrigins`), the request id, and the trace id
 * header the endpoint boundary fills in.
 *
 * The built-in `http.server` span is disabled for this handler: the endpoint
 * boundary opens the one span per call, named `group.endpoint` and parented
 * on the caller's `traceparent`, so a trace has one root per API call.
 */
import type { Context } from "effect";
import { Effect, Layer } from "effect";
import {
  HttpEffect,
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";

import { RequestTrace, type RequestTraceShape } from "./boundary";
import { AppConfig, type AppConfigShape } from "./config";
import { type ApiLiveOptions, type AppServices, makeApiLive } from "./layer";

/** The per-request services an entry point may hand the API (`RequestContext`, for one). */
export type RequestServices = Context.Context<never>;

/** A fetch-style handler that also accepts the request's services. */
export type ApiHandler = (
  request: Request,
  context?: RequestServices,
) => Promise<Response>;

export interface WebHandler {
  readonly handler: ApiHandler;
  readonly dispose: () => Promise<void>;
}

export interface WebHandlerOptions extends ApiLiveOptions {
  /** Share the app runtime's memo map so services are built once, not per layer. */
  readonly memoMap?: Layer.MemoMap | undefined;
  /** Silence the per-request "Sent HTTP response" log line (tests). */
  readonly disableLogger?: boolean | undefined;
}

export const REQUEST_ID_HEADER = "x-request-id";
export const TRACE_ID_HEADER = "x-trace-id";

/** Built once per config object; the config is a module-scope constant in the app. */
const corsByConfig = new WeakMap<
  AppConfigShape,
  ReturnType<typeof HttpMiddleware.cors>
>();
const corsFor = (config: AppConfigShape) => {
  let cors = corsByConfig.get(config);
  if (cors === undefined) {
    const allowed = new Set(config.allowedOrigins);
    cors = HttpMiddleware.cors({
      // A predicate, not the list: with one allowed origin the list form
      // echoes it unconditionally, and an unknown origin must get no
      // allow-origin header at all.
      allowedOrigins: (origin) => allowed.has(origin),
      credentials: true,
      // An explicit list, never an echo of the request's own: the W3C trace
      // context headers so a browser client can propagate its trace, and the
      // request id it may mint.
      allowedHeaders: [
        "authorization",
        "content-type",
        "traceparent",
        "tracestate",
        REQUEST_ID_HEADER,
      ],
      exposedHeaders: [REQUEST_ID_HEADER, TRACE_ID_HEADER],
      maxAge: 600,
    });
    corsByConfig.set(config, cors);
  }
  return cors;
};

const traceHeaders = (
  response: HttpServerResponse.HttpServerResponse,
  trace: RequestTraceShape,
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.setHeaders(response, {
    [REQUEST_ID_HEADER]: trace.requestId,
    ...(trace.traceId === undefined
      ? {}
      : { [TRACE_ID_HEADER]: trace.traceId }),
  });

/** The web handler over `services`; the app calls this once at module scope. */
export const makeWebHandler = (
  services: Layer.Layer<AppServices>,
  options?: WebHandlerOptions,
): WebHandler => {
  const api = makeApiLive(options).pipe(Layer.provideMerge(services));
  return HttpRouter.toWebHandler(
    Layer.mergeAll(
      api,
      // The endpoint boundary owns the span (see the module comment).
      Layer.succeed(HttpMiddleware.TracerDisabledWhen)(() => true),
    ),
    {
      memoMap: options?.memoMap,
      disableLogger: options?.disableLogger,
      middleware: (app) =>
        Effect.gen(function* () {
          const config = yield* AppConfig;
          const request = yield* HttpServerRequest.HttpServerRequest;
          const trace: RequestTraceShape = {
            requestId:
              request.headers[REQUEST_ID_HEADER] ?? crypto.randomUUID(),
            traceId: undefined,
          };
          // The response is sent as soon as the router produces it, so the
          // headers go on through a pre-response handler (as CORS's do),
          // not by mapping the returned value.
          yield* HttpEffect.appendPreResponseHandler((_request, response) =>
            Effect.succeed(traceHeaders(response, trace)),
          );
          return yield* corsFor(config)(app).pipe(
            Effect.provideService(RequestTrace, trace),
            Effect.annotateLogs("request.id", trace.requestId),
          );
        }),
    },
  );
};
