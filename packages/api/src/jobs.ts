/**
 * `Jobs`: the maintenance work behind the Cron Trigger
 * (`wrangler.jsonc` `triggers.crons`, dispatched by `scheduled` in
 * apps/web/src/server/worker.ts).
 *
 * A stub in one specific sense: it is cron-only, so there is no retry, no
 * backoff and no fan-out behind it. The interface is the one a Queues
 * consumer will implement (TODOS.md, "Queues-backed Jobs service"), so the
 * callers and the tests do not move when it lands. Every job must be
 * idempotent for the same reason: Queues deliver at least once, and two
 * cron ticks can overlap.
 */
import { Database, type DatabaseError } from "@gmacko/db";
import { rateLimitWindow } from "@gmacko/db/schema";
import { lt } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

export interface JobsShape {
  /**
   * Deletes the `rate_limit_window` rows whose window has closed, and answers
   * how many. Nothing reads a closed window (the key carries the window
   * start), so this is housekeeping, not correctness.
   */
  readonly pruneRateLimitWindows: Effect.Effect<number, DatabaseError>;
  /**
   * Everything the nightly tick runs. Never fails: a job's failure is logged
   * and the next one still runs, because a cron tick has nobody to report to.
   */
  readonly runScheduled: Effect.Effect<void>;
}

export class Jobs extends Context.Service<Jobs, JobsShape>()(
  "@gmacko/api/Jobs",
) {
  static layer: Layer.Layer<Jobs, never, Database> = Layer.effect(Jobs)(
    Effect.map(Database, (database) => {
      const pruneRateLimitWindows = Effect.clockWith((clock) =>
        Effect.flatMap(clock.currentTimeMillis, (now) =>
          database.updateWhere(
            database.db
              .delete(rateLimitWindow)
              .where(lt(rateLimitWindow.expiresAt, new Date(now))),
          ),
        ),
      );
      return Jobs.of({
        pruneRateLimitWindows,
        runScheduled: pruneRateLimitWindows.pipe(
          Effect.flatMap((deleted) =>
            Effect.logInfo("pruned rate limit windows", { deleted }),
          ),
          Effect.ignoreCause({
            log: true,
            message: "pruning rate limit windows failed",
          }),
        ),
      });
    }),
  );
}
