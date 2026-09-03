import { SecurityLive } from "@gmacko/auth/middleware";
import type { AuthSecurityConfig } from "@gmacko/auth/security-config";
import { type Auth, CurrentUser } from "@gmacko/auth/service";
import { Database, type DatabaseError } from "@gmacko/db";
import {
  ForgeHealth,
  ForgeUnhealthy,
  HealthApi,
  HealthStatus,
  LiveStatus,
  ReadyStatus,
  Unhealthy,
  UnhealthyReport,
} from "@gmacko/domain/health";
import { Session } from "@gmacko/domain/security";
import { type Context, Effect, FileSystem, Layer, Path, Schema } from "effect";
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
} from "effect/unstable/httpapi";

import { AppConfig, type AppConfigShape } from "./config";

export { AppConfig, Stage } from "./config";

export const SessionUser = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: Schema.Literals(["user", "admin"]),
});

export const Me = Schema.Struct({
  user: SessionUser,
});

/**
 * Who the request's cookie belongs to, through the contract's `Session`
 * middleware: anonymous is 401, a bearer is 403 `Forbidden(scope)`. Spike
 * C's proof that a session survives the in-process transport from an SSR
 * loader; TODO(Phase 4): superseded by `AppApi`'s `auth.session`.
 */
export class SessionApi extends HttpApiGroup.make("session")
  .add(HttpApiEndpoint.get("me", "/me", { success: Me }).middleware(Session))
  .prefix("/session") {}

/**
 * The groups this app serves today: the Spike C session probe and the
 * contract's HealthApi. TODO(Phase 4): replace with `AppApi` from
 * @gmacko/domain once every group has handlers. HealthApi goes after the
 * prefix, as in AppApi, so the ForgeGraph probe keeps its absolute path.
 */
export class GmackoApi extends HttpApi.make("gmacko")
  .add(SessionApi)
  .prefix("/api")
  .add(HealthApi) {}

/** A database round trip slower than this counts as degraded, as before. */
const DEGRADED_AFTER_MS = 2000;

/**
 * Health responses never carry driver detail outside development
 * (AGENTS.md); the DatabaseError itself goes to the log.
 */
const failureDetail = (
  config: AppConfigShape,
  error: DatabaseError,
  generic: string,
): string =>
  config.stage === "development"
    ? `${generic}: ${error.reason}${error.cause instanceof Error ? ` (${error.cause.message})` : ""}`
    : generic;

const logPingFailure = (probe: string, error: DatabaseError) =>
  Effect.logError(`${probe}: database ping failed`, error);

export const HealthHandlers = HttpApiBuilder.group(
  GmackoApi,
  "health",
  (handlers) =>
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const database = yield* Database;
      return handlers
        .handle("live", () =>
          Effect.succeed(new LiveStatus({ status: "ok", stage: config.stage })),
        )
        .handle("ready", () =>
          database.ping.pipe(
            Effect.map(
              (latencyMs) => new ReadyStatus({ status: "ok", latencyMs }),
            ),
            Effect.catchTag("DatabaseError", (error) =>
              logPingFailure("readiness probe", error).pipe(
                Effect.andThen(
                  Effect.fail(
                    new Unhealthy({
                      status: "unhealthy",
                      detail: failureDetail(
                        config,
                        error,
                        "database unavailable",
                      ),
                    }),
                  ),
                ),
              ),
            ),
          ),
        )
        .handle("full", () =>
          database.ping.pipe(
            Effect.map((responseTime) => {
              const degraded = responseTime > DEGRADED_AFTER_MS;
              return new HealthStatus({
                status: degraded ? "degraded" : "healthy",
                timestamp: new Date(),
                version: config.version,
                checks: {
                  database: {
                    status: degraded ? "warn" : "pass",
                    responseTime,
                  },
                },
              });
            }),
            Effect.catchTag("DatabaseError", (error) =>
              logPingFailure("health report", error).pipe(
                Effect.andThen(
                  Effect.fail(
                    new UnhealthyReport({
                      status: "unhealthy",
                      timestamp: new Date(),
                      version: config.version,
                      checks: {
                        database: {
                          status: "fail",
                          message: failureDetail(
                            config,
                            error,
                            "Database connection failed",
                          ),
                        },
                      },
                    }),
                  ),
                ),
              ),
            ),
          ),
        )
        .handle("forge", () =>
          Effect.timed(database.ping).pipe(
            Effect.map(([, latencyMs]) => {
              const degraded = latencyMs > DEGRADED_AFTER_MS;
              return new ForgeHealth({
                status: degraded ? "degraded" : "healthy",
                version: "1.0",
                timestamp: new Date(),
                checks: {
                  database: {
                    status: degraded ? "degraded" : "healthy",
                    latencyMs,
                    checkedAt: new Date(),
                  },
                },
              });
            }),
            Effect.catchTag("DatabaseError", (error) =>
              logPingFailure("forge health", error).pipe(
                Effect.andThen(
                  Effect.fail(
                    new ForgeUnhealthy({
                      status: "unhealthy",
                      version: "1.0",
                      timestamp: new Date(),
                      checks: {
                        database: {
                          status: "unhealthy",
                          latencyMs: 0,
                          checkedAt: new Date(),
                          error: failureDetail(
                            config,
                            error,
                            "connection failed",
                          ),
                        },
                      },
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
    handlers.handle("me", () =>
      Effect.map(CurrentUser, (user) => ({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      })),
    ),
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
 * Every HttpApi handler group plus the security middlewares they declare;
 * needs `Database | AppConfig | Auth | AuthSecurityConfig` from the app and
 * the router (+ its phantom request requirement) from
 * `HttpRouter.toWebHandler`, so the type is left to inference.
 */
export const ApiLive = HttpApiBuilder.layer(GmackoApi).pipe(
  Layer.provide(Layer.mergeAll(HealthHandlers, SessionHandlers)),
  Layer.provide(SecurityLive),
  Layer.provide(PlatformLive),
);

/** The per-request services an entry point may hand the API (`RequestContext`, for one). */
export type RequestServices = Context.Context<never>;

/** A fetch-style handler that also accepts the request's services. */
export type ApiHandler = (
  request: Request,
  context?: RequestServices,
) => Promise<Response>;

/**
 * The fetch-style handler for `/api/*` and `/.well-known/forge-health`, over
 * the given services. `runtime.ts` passes the production layers (sharing its
 * memo map); tests pass the sqlite-node ones. One `http.server` span per
 * request. The handler's optional second argument is merged into the request
 * fiber's services: the SSR path uses it to share one `RequestContext`
 * across every call a render makes.
 */
export const makeApiHandler = (
  services: Layer.Layer<Database | AppConfig | Auth | AuthSecurityConfig>,
  options?: { readonly memoMap?: Layer.MemoMap },
): { readonly handler: ApiHandler; readonly dispose: () => Promise<void> } =>
  HttpRouter.toWebHandler(ApiLive.pipe(Layer.provideMerge(services)), {
    ...options,
    middleware: HttpMiddleware.tracer,
  });
