/**
 * `Health`: the four probes over one database check. The check (a
 * `Database.ping`) is cached for five seconds on success, like the legacy
 * ForgeGraph probe, so a scraper hitting all four paths costs one round
 * trip; failures are never cached, so recovery shows on the next probe.
 * Failure detail (reason, driver message) is included in development only
 * (AGENTS.md: health endpoints never leak internals in production); the
 * `DatabaseError` itself goes to the log.
 */
import { Database, type DatabaseError } from "@gmacko/db";
import {
  ForgeHealth,
  ForgeUnhealthy,
  HealthStatus,
  LiveStatus,
  ReadyStatus,
  Unhealthy,
  UnhealthyReport,
} from "@gmacko/domain/health";
import { Context, Effect, Layer } from "effect";

import { AppConfig, type AppConfigShape } from "../config";

/** A database round trip slower than this counts as degraded, as before. */
export const DEGRADED_AFTER_MS = 2000;
/** How long a successful check is reused. */
export const CHECK_TTL_MS = 5_000;

export interface DatabaseCheck {
  readonly latencyMs: number;
  readonly checkedAt: Date;
}

export interface HealthShape {
  readonly live: Effect.Effect<LiveStatus>;
  readonly ready: Effect.Effect<ReadyStatus, Unhealthy>;
  readonly full: Effect.Effect<HealthStatus, UnhealthyReport>;
  readonly forge: Effect.Effect<ForgeHealth, ForgeUnhealthy>;
}

const failureDetail = (
  config: AppConfigShape,
  error: DatabaseError,
  generic: string,
): string =>
  config.stage === "development"
    ? `${generic}: ${error.reason}${error.cause instanceof Error ? ` (${error.cause.message})` : ""}`
    : generic;

const logFailure = (probe: string, error: DatabaseError) =>
  Effect.logError(`${probe}: database ping failed`, error);

export class Health extends Context.Service<Health, HealthShape>()(
  "@gmacko/api/Health",
) {
  static layer: Layer.Layer<Health, never, Database | AppConfig> = Layer.effect(
    Health,
  )(
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const database = yield* Database;

      // Successes only: a cached failure would hide a recovery for 5 s.
      let cached: { readonly check: DatabaseCheck; readonly until: number } = {
        check: { latencyMs: 0, checkedAt: new Date(0) },
        until: 0,
      };
      const check: Effect.Effect<DatabaseCheck, DatabaseError> = Effect.gen(
        function* () {
          const now = yield* Effect.clockWith(
            (clock) => clock.currentTimeMillis,
          );
          if (now < cached.until) return cached.check;
          const latencyMs = yield* database.ping;
          const fresh = { latencyMs, checkedAt: new Date(now) };
          cached = { check: fresh, until: now + CHECK_TTL_MS };
          return fresh;
        },
      );

      return Health.of({
        live: Effect.succeed(
          new LiveStatus({ status: "ok", stage: config.stage }),
        ),
        ready: check.pipe(
          Effect.map(
            ({ latencyMs }) => new ReadyStatus({ status: "ok", latencyMs }),
          ),
          Effect.catchTag("DatabaseError", (error) =>
            logFailure("readiness probe", error).pipe(
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
        full: check.pipe(
          Effect.map(({ latencyMs }) => {
            const degraded = latencyMs > DEGRADED_AFTER_MS;
            return new HealthStatus({
              status: degraded ? "degraded" : "healthy",
              timestamp: new Date(),
              version: config.version,
              checks: {
                database: {
                  status: degraded ? "warn" : "pass",
                  responseTime: latencyMs,
                },
              },
            });
          }),
          Effect.catchTag("DatabaseError", (error) =>
            logFailure("health report", error).pipe(
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
        forge: check.pipe(
          Effect.map(({ latencyMs, checkedAt }) => {
            const degraded = latencyMs > DEGRADED_AFTER_MS;
            return new ForgeHealth({
              status: degraded ? "degraded" : "healthy",
              version: "1.0",
              timestamp: new Date(),
              checks: {
                database: {
                  status: degraded ? "degraded" : "healthy",
                  latencyMs,
                  checkedAt,
                },
              },
            });
          }),
          Effect.catchTag("DatabaseError", (error) =>
            logFailure("forge health", error).pipe(
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
      });
    }),
  );
}
