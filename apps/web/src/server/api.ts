import { Auth } from "@gmacko/auth/service";
import { Database } from "@gmacko/db";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import {
  Etag,
  HttpMiddleware,
  HttpPlatform,
  HttpRouter,
} from "effect/unstable/http";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";

import { AppConfig, Stage } from "./config";

export { AppConfig, Stage } from "./config";

export const LiveStatus = Schema.Struct({
  status: Schema.Literal("ok"),
  stage: Stage,
});

export const ReadyStatus = Schema.Struct({
  status: Schema.Literal("ok"),
  latencyMs: Schema.Number,
});

/**
 * 503 body for a failed readiness probe. Always generic: the DatabaseError
 * goes to the server log, never to the client (AGENTS.md health invariant).
 */
export class Unhealthy extends Schema.TaggedError<Unhealthy>()("Unhealthy", {
  status: Schema.Literal("unhealthy"),
  detail: Schema.String,
}) {}

export class HealthApi extends HttpApiGroup.make("health")
  .add(HttpApiEndpoint.get("live", "/live", { success: LiveStatus }))
  .add(
    HttpApiEndpoint.get("ready", "/ready", {
      success: ReadyStatus,
      error: Unhealthy.pipe(HttpApiSchema.status(503)),
    }),
  )
  .prefix("/health") {}

export const SessionUser = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: Schema.Literals(["user", "admin"]),
});

export const Me = Schema.Struct({
  user: Schema.NullOr(SessionUser),
});

/**
 * Who the request's cookie belongs to. Spike C's proof that a session cookie
 * survives the in-process transport from an SSR loader; TODO(Phase 4): replace
 * with the `Session` middleware + `CurrentUser` from packages/domain.
 */
export class SessionApi extends HttpApiGroup.make("session")
  .add(HttpApiEndpoint.get("me", "/me", { success: Me }))
  .prefix("/session") {}

export class GmackoApi extends HttpApi.make("gmacko")
  .add(HealthApi)
  .add(SessionApi)
  .prefix("/api") {}

export const HealthHandlers = HttpApiBuilder.group(
  GmackoApi,
  "health",
  (handlers) =>
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const database = yield* Database;
      return handlers
        .handle("live", () =>
          Effect.succeed({ status: "ok" as const, stage: config.stage }),
        )
        .handle("ready", () =>
          database.ping.pipe(
            Effect.map((latencyMs) => ({ status: "ok" as const, latencyMs })),
            Effect.catchTag("DatabaseError", (error) =>
              Effect.logError(
                "readiness probe: database ping failed",
                error,
              ).pipe(
                Effect.andThen(
                  Effect.fail(
                    new Unhealthy({
                      status: "unhealthy",
                      detail: "database unavailable",
                    }),
                  ),
                ),
              ),
            ),
          ),
        );
    }),
);

export const SessionHandlers = HttpApiBuilder.group(
  GmackoApi,
  "session",
  (handlers) =>
    Effect.gen(function* () {
      const auth = yield* Auth;
      return handlers.handle("me", ({ request }) =>
        auth.currentUser(new Headers(request.headers)).pipe(
          Effect.map((user) => ({
            user: user
              ? {
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  // Declared optional in better-auth's inference; the column is NOT NULL DEFAULT 'user'.
                  role: user.role ?? "user",
                }
              : null,
          })),
        ),
      );
    }),
);

/**
 * HttpApiBuilder.layer needs the file-serving services even though this API
 * never touches a file; workerd has no filesystem, so they are no-ops.
 */
const PlatformLive = Layer.mergeAll(
  HttpPlatform.layer.pipe(Layer.provideMerge(FileSystem.layerNoop({}))),
  Path.layer,
  Etag.layer,
);

/**
 * Every HttpApi handler group; needs `Database | AppConfig | Auth` from the
 * app and the router (+ its phantom request requirement) from
 * `HttpRouter.toWebHandler`, so the type is left to inference.
 */
export const ApiLive = HttpApiBuilder.layer(GmackoApi).pipe(
  Layer.provide(Layer.mergeAll(HealthHandlers, SessionHandlers)),
  Layer.provide(PlatformLive),
);

/**
 * The fetch-style handler for `/api/*`, over the given services. `runtime.ts`
 * passes the production layers (sharing its memo map); tests pass the
 * sqlite-node ones. One `http.server` span per request.
 */
export const makeApiHandler = (
  services: Layer.Layer<Database | AppConfig | Auth>,
  options?: { readonly memoMap?: Layer.MemoMap },
) =>
  HttpRouter.toWebHandler(ApiLive.pipe(Layer.provideMerge(services)), {
    ...options,
    middleware: HttpMiddleware.tracer,
  });
