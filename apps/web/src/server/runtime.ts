/**
 * The only module in the repo allowed to import `cloudflare:workers`.
 *
 * Bindings enter Effect here, as services (`AppConfig`, `Database`,
 * `Background`, `Auth`, observability); `@gmacko/api` turns them into the
 * web handler. Every request shares the ManagedRuntime built below, and
 * module scope does no I/O.
 */
import { env, waitUntil } from "cloudflare:workers";
import {
  type ApiHandler,
  AppConfig,
  Background,
  makeWebHandler,
} from "@gmacko/api";
import { RequestContext } from "@gmacko/auth/request-context";
import { Auth } from "@gmacko/auth/service";
import { Database } from "@gmacko/db";
import { Context, Effect, Layer, ManagedRuntime } from "effect";

import { AuthLive } from "./auth";
import { fromBindings } from "./config";
import { flushTelemetry, Observability } from "./observability";

/**
 * Deliberately fails fast at module load: a misconfigured STAGE should stop
 * the Worker from starting (visible in the deploy) rather than surface as a
 * 500 on the first request.
 */
const config = fromBindings(env, { version: __APP_VERSION__ });

const AppConfigLive = Layer.succeed(AppConfig)(config);
// D1 bindings are safe to hold at module scope; one client per isolate.
const DatabaseLive = Database.layer(env.DB);

/** Every service the app provides, independent of HTTP. Shared by all handlers. */
const ServicesLive = Layer.mergeAll(
  AppConfigLive,
  Background.layer(waitUntil),
  DatabaseLive,
  AuthLive.pipe(Layer.provide(Layer.mergeAll(AppConfigLive, DatabaseLive))),
  Observability.layer({
    endpoint: config.otlp.endpoint,
    headers: config.otlp.headers,
    serviceName: "gmacko-web",
    serviceVersion: config.version,
  }),
);

/** One runtime per isolate; `scheduled` and queue handlers run effects here. */
export const runtime = ManagedRuntime.make(ServicesLive);

/**
 * Ends every request by flushing telemetry on `waitUntil`, so a span is
 * exported even though the isolate idles right after the response.
 */
const flushAfter =
  (respond: ApiHandler): ApiHandler =>
  async (request, context) => {
    try {
      return await respond(request, context);
    } finally {
      await runtime.runPromise(flushTelemetry);
    }
  };

// Share the memo map so the services above are built once, not per layer.
const api = makeWebHandler(ServicesLive, { memoMap: runtime.memoMap });

/**
 * Fetch-style handler for everything under /api/* (except /api/auth) and
 * /.well-known/forge-health. A direct API request comes without `context`:
 * the security middleware then builds the request's `RequestContext` itself.
 * The SSR path passes `renderContext(...)` so every call of one render
 * shares it.
 */
export const apiHandler: ApiHandler = flushAfter(api.handler);

/**
 * The per-request services for one incoming page request: its
 * `RequestContext`, built once and handed to every in-process API dispatch
 * the render makes (see lib/api.ts).
 */
export const renderContext = (
  headers: Headers,
): Promise<Context.Context<never>> =>
  runtime
    .runPromise(RequestContext.make(headers))
    .then((context) => Context.make(RequestContext, context));

/** better-auth's handler for /api/auth/*. */
export const authHandler: (request: Request) => Promise<Response> = flushAfter(
  (request) =>
    runtime.runPromise(Effect.flatMap(Auth, (auth) => auth.handler(request))),
);

/**
 * TODO(Phase 5): delete with the tRPC routes. The legacy router only needs
 * `authApi.getSession`, which the new instance provides.
 */
export const authApi = () =>
  runtime.runPromise(Effect.map(Auth, (auth) => auth.instance.api));
