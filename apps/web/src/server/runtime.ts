/**
 * The only module in the repo allowed to import `cloudflare:workers`.
 *
 * Bindings enter Effect here, as services, and every request shares the
 * ManagedRuntime built below. Module scope does no I/O.
 */
import { env, waitUntil } from "cloudflare:workers";
import { Auth } from "@gmacko/auth/service";
import { Database } from "@gmacko/db";
import { Effect, Layer, ManagedRuntime } from "effect";

import { AppConfig, makeApiHandler } from "./api";
import { AuthLive } from "./auth";
import { Background } from "./background";
import { flushTelemetry, Observability } from "./observability";

/**
 * Deliberately fails fast at module load: a misconfigured STAGE should stop
 * the Worker from starting (visible in the deploy) rather than surface as a
 * 500 on the first request.
 */
const config = AppConfig.fromBindings(env, { version: __APP_VERSION__ });

const AppConfigLive = Layer.succeed(AppConfig)(config);
// D1 bindings are safe to hold at module scope; one client per isolate.
const DatabaseLive = Database.layer(env.DB);

/** Every service the app needs, independent of HTTP. Shared by all handlers. */
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
  (respond: (request: Request) => Promise<Response>) =>
  async (request: Request): Promise<Response> => {
    try {
      return await respond(request);
    } finally {
      await runtime.runPromise(flushTelemetry);
    }
  };

// Share the memo map so the services above are built once, not per layer.
const api = makeApiHandler(ServicesLive, { memoMap: runtime.memoMap });

/** Fetch-style handler for everything under /api/* (except /api/auth). */
export const apiHandler: (request: Request) => Promise<Response> = flushAfter(
  api.handler,
);

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
