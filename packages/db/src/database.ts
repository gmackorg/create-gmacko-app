/**
 * The Database service: Drizzle's Effect API on Cloudflare D1, with every
 * query failing as `DatabaseError` (SqlError is mapped once, here) and the
 * multi-statement primitives D1 actually offers (`batch`, guarded writes)
 * instead of interactive transactions, which D1 does not have.
 *
 * Error channel, by surface:
 * - `db.*`, `first`, `batch`, `updateWhere`, `ping`: fail with `DatabaseError`.
 * - `sql` (the raw tagged template and `sql.unsafe`): fails with the driver's
 *   `SqlError`. It is the one escape hatch that bypasses the mapping, so every
 *   caller must `Effect.mapError(toDatabaseError)` (exported below) before the
 *   error leaves the data layer.
 * - Result-mapper failures (drizzle decoding a row, e.g. malformed JSON in a
 *   `json` column, or a custom `fromDriver`) are thrown inside the mapper, not
 *   raised through the driver, so they surface as defects, not `DatabaseError`.
 */
import type { D1Database } from "@cloudflare/workers-types";
import * as D1Client from "@effect/sql-d1/D1Client";
import { sql as dsql, type SQL } from "drizzle-orm";
import { drizzle as drizzlePlain } from "drizzle-orm/d1";
import {
  type EffectDrizzleQueryError,
  type QueryEffectHKTBase,
} from "drizzle-orm/effect-core";
import * as D1Drizzle from "drizzle-orm/effect-d1";
import type { SQLiteAsyncDatabase } from "drizzle-orm/sqlite-core";
import type { SQLiteEffectDatabase } from "drizzle-orm/sqlite-core/effect";
import {
  Cause,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Schema,
} from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import type { SqlClient } from "effect/unstable/sql/SqlClient";
import { isSqlError, type SqlError } from "effect/unstable/sql/SqlError";
import type * as Statement from "effect/unstable/sql/Statement";

import { type Relations, relations } from "./relations";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * - `unique`: a UNIQUE constraint (services map it to a domain Conflict).
 * - `constraint`: any other constraint (FK, CHECK, NOT NULL).
 * - `syntax`: the statement does not parse.
 * - `schema`: the statement parses but names a missing table/column/function;
 *   almost always an unapplied migration, so it is distinguished from `syntax`.
 * - `other`: anything else (connection, I/O, driver internals).
 */
export const DatabaseErrorReason = Schema.Literals([
  "unique",
  "constraint",
  "syntax",
  "schema",
  "other",
]);
export type DatabaseErrorReason = typeof DatabaseErrorReason.Type;

/**
 * The only error the data layer produces. `reason` is derived from the
 * driver's `SqlError` so services can turn a unique violation into a typed
 * domain error without inspecting driver internals; `cause` keeps the full
 * chain (drizzle query error → SqlError → sqlite error) for logs and traces.
 */
export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
  "DatabaseError",
  {
    reason: DatabaseErrorReason,
    cause: Schema.Defect(),
  },
) {}

const isDrizzleQueryError = (u: unknown): u is EffectDrizzleQueryError =>
  typeof u === "object" &&
  u !== null &&
  "_tag" in u &&
  u._tag === "EffectDrizzleQueryError";

const findSqlError = (u: unknown): SqlError | undefined => {
  if (isSqlError(u)) return u;
  if (Cause.isCause(u)) {
    const error = Cause.findErrorOption(u);
    return Option.isSome(error) ? findSqlError(error.value) : undefined;
  }
  if (isDrizzleQueryError(u)) return findSqlError(u.cause);
  return undefined;
};

/** Every `message` down the `cause` chain, joined; sqlite's text is stable. */
const messagesOf = (u: unknown, depth = 0): string => {
  if (depth > 5 || typeof u !== "object" || u === null) return "";
  const message =
    "message" in u && typeof u.message === "string" ? u.message : "";
  const cause = "cause" in u ? messagesOf(u.cause, depth + 1) : "";
  return `${message}\n${cause}`;
};

/**
 * `@effect/sql-sqlite-node` classifies by sqlite error code, but
 * `@effect/sql-d1` (rc.112) reports every failure as `UnknownError`, so the
 * D1 message text is the fallback. Both drivers then agree on `reason`.
 */
const reasonOf = (error: SqlError | undefined): DatabaseErrorReason => {
  switch (error?.reason._tag) {
    case "UniqueViolation":
      return "unique";
    case "ConstraintError":
      return "constraint";
    case "SqlSyntaxError": {
      // sqlite-node files "no such table" under SqlSyntaxError too; split it.
      return /no such (table|column|function)/i.test(messagesOf(error?.reason))
        ? "schema"
        : "syntax";
    }
    default: {
      const text = messagesOf(error?.reason);
      if (/UNIQUE constraint failed/i.test(text)) return "unique";
      if (/constraint failed|SQLITE_CONSTRAINT/i.test(text))
        return "constraint";
      if (/no such (table|column|function)/i.test(text)) return "schema";
      if (/syntax error|incomplete input/i.test(text)) return "syntax";
      return "other";
    }
  }
};

/** Idempotent: a `DatabaseError` passes through untouched. */
export const toDatabaseError = (error: unknown): DatabaseError =>
  error instanceof DatabaseError
    ? error
    : new DatabaseError({
        reason: reasonOf(findSqlError(error)),
        cause: error,
      });

// ---------------------------------------------------------------------------
// The wrapped Drizzle instance
// ---------------------------------------------------------------------------

/**
 * Drizzle parameterises every query builder's Effect signature on this HKT,
 * so swapping the driver's `EffectDrizzleQueryError` for `DatabaseError` here
 * changes the error channel of `db.select()…`, `.returning()`, `db.query.*`
 * and the raw helpers while leaving every inferred row type untouched.
 */
export interface DatabaseQueryEffectHKT extends QueryEffectHKTBase {
  readonly error: DatabaseError;
  readonly context: never;
}

/**
 * Drizzle's Effect query API, failing with `DatabaseError`. `transaction` is
 * removed: D1 has no interactive transactions (the driver dies on it), so
 * exposing it would only make tests pass on sqlite-node and fail on D1.
 */
export type DatabaseDrizzle = Omit<
  SQLiteEffectDatabase<DatabaseQueryEffectHKT, unknown, Relations>,
  "transaction"
>;

/**
 * Promise-based drizzle on the same database; for better-auth's adapter only.
 * Typed as the async sqlite surface rather than the D1 class so the sqlite-node
 * test layer can supply one too (via drizzle's `sqlite-proxy` driver).
 */
export type PlainDatabase = SQLiteAsyncDatabase<"async", unknown, Relations>;

/** Anything with drizzle's `toSQL()`: query builders and relational queries. */
export interface BatchItem {
  readonly toSQL: () => {
    readonly sql: string;
    readonly params: ReadonlyArray<unknown>;
  };
}
/** D1 returns batch rows keyed by column name, un-mapped by drizzle. */
export type BatchRow = Record<string, unknown>;
export type BatchResult<Items extends ReadonlyArray<BatchItem>> = {
  readonly [K in keyof Items]: ReadonlyArray<BatchRow>;
};

/** The minimal RETURNING projection `updateWhere` asks for: one constant per row. */
export interface GuardedWriteProjection {
  readonly n: SQL;
}
/**
 * A write whose WHERE clause carries the precondition (see `updateWhere`):
 * drizzle's UPDATE/DELETE builder, whose `returning(fields)` overload accepts
 * the projection above.
 */
export interface GuardedWrite {
  readonly returning: (
    fields: GuardedWriteProjection,
  ) => Effect.Effect<ReadonlyArray<unknown>, DatabaseError>;
}

export interface DatabaseShape {
  /** Query builder + `db.query.*`; every call fails with `DatabaseError`. */
  readonly db: DatabaseDrizzle;
  /**
   * The raw `sql` tagged template (+ `sql.unsafe`) for the rare hand-written
   * statement. Fails with the driver's `SqlError`; wrap with `toDatabaseError`.
   * Typed as the statement constructor only, so `withTransaction` is not
   * reachable from the service.
   */
  readonly sql: Statement.Constructor;
  /**
   * The first row, or the caller's typed error on zero rows. `DatabaseError`
   * passes through untouched, so an outage is a 500, never a 404.
   */
  readonly first: <A, E>(
    query: Effect.Effect<ReadonlyArray<A>, DatabaseError>,
    orFail: () => E,
  ) => Effect.Effect<A, E | DatabaseError>;
  /**
   * Atomic multi-statement write (D1 `batch`): all statements apply or none.
   * Statements cannot branch on an earlier statement's result; use a guarded
   * write for read-check-write. Results are raw rows per statement.
   */
  readonly batch: <const Items extends ReadonlyArray<BatchItem>>(
    items: Items,
  ) => Effect.Effect<BatchResult<Items>, DatabaseError>;
  /**
   * Guarded write: runs an UPDATE/DELETE whose WHERE clause encodes the
   * precondition and returns the changed-row count via `RETURNING 1`
   * (identical on D1 and sqlite-node; no columns are decoded). 0 means
   * another actor won the race; the caller raises Conflict.
   */
  readonly updateWhere: (
    write: GuardedWrite,
  ) => Effect.Effect<number, DatabaseError>;
  /** `SELECT 1` round-trip latency in milliseconds, for the health check. */
  readonly ping: Effect.Effect<number, DatabaseError>;
  /** Promise-based drizzle for better-auth's adapter only. Nothing else may use it. */
  readonly plain: PlainDatabase;
}

/** The pieces that differ between the D1 layer and the sqlite-node test layer. */
export interface DatabaseBackend {
  readonly db: SQLiteEffectDatabase<QueryEffectHKTBase, unknown, Relations>;
  readonly sql: SqlClient;
  /** Runs the statements atomically; the test layer emulates this with a transaction. */
  readonly runBatch: (
    statements: ReadonlyArray<Statement.Statement<BatchRow>>,
  ) => Effect.Effect<ReadonlyArray<ReadonlyArray<BatchRow>>, SqlError>;
  /** Called once per `makeDatabase`; the instance is memoised as `plain`. */
  readonly plain: () => PlainDatabase;
}

type Leaf = (
  ...args: ReadonlyArray<unknown>
) => Effect.Effect<unknown, unknown>;
type PreparedLike = Record<"run" | "all" | "get" | "values", Leaf>;
type SessionLike = {
  prepareQuery: (...args: ReadonlyArray<unknown>) => PreparedLike;
};
const leaves = ["run", "all", "get", "values"] as const;

/**
 * Every builder (select/insert/update/delete, `db.query.*`, `db.run/all/get/
 * values`, `$count`) executes through `session.prepareQuery`, whose prepared
 * query wraps driver failures in `EffectDrizzleQueryError`. Patching that one
 * method on our own instance maps them to `DatabaseError` without touching
 * drizzle's prototypes or proxying builders.
 */
const rewire = (backend: DatabaseBackend["db"]): DatabaseDrizzle => {
  const session = backend._.session as unknown as SessionLike;
  const prepareQuery = session.prepareQuery;
  session.prepareQuery = function (this: SessionLike, ...args) {
    const prepared = prepareQuery.call(this, ...args);
    for (const leaf of leaves) {
      const original = prepared[leaf];
      prepared[leaf] = function (this: PreparedLike, ...leafArgs) {
        return Effect.mapError(
          original.call(this, ...leafArgs),
          toDatabaseError,
        );
      };
    }
    return prepared;
  };
  // Belt and braces for the type-level removal: fail loudly on every driver,
  // not only on D1, so a stray `transaction` cannot pass the Node suite.
  Object.defineProperty(backend, "transaction", {
    value: () =>
      Effect.die(
        new Error(
          "Database.db.transaction is unavailable: D1 has no interactive transactions. Use Database.batch or a guarded write (updateWhere).",
        ),
      ),
    writable: false,
  });
  return backend as unknown as DatabaseDrizzle;
};

/**
 * RETURNING projection for guarded writes: a constant per changed row, so the
 * count costs no column decoding and no result mapping (see `updateWhere`).
 */
const guardedWriteProjection: GuardedWriteProjection = { n: dsql`1` };

export const makeDatabase = (backend: DatabaseBackend): DatabaseShape => {
  const db = rewire(backend.db);
  const { sql } = backend;
  // One promise-flavoured drizzle per service instance: better-auth's adapter
  // keeps a reference, and a fresh instance per access would defeat drizzle's
  // per-instance caches (relations, dialect) for no gain.
  const plain = backend.plain();
  return {
    db,
    sql,
    first: (query, orFail) =>
      Effect.flatMap(query, (rows) =>
        rows.length > 0
          ? Effect.succeed(rows[0] as (typeof rows)[number])
          : Effect.fail(orFail()),
      ),
    batch: (items) =>
      backend
        .runBatch(
          items.map((item) => {
            const query = item.toSQL();
            return sql.unsafe<BatchRow>(query.sql, query.params);
          }),
        )
        .pipe(
          Effect.map(
            (results) => results as unknown as BatchResult<typeof items>,
          ),
          Effect.mapError(toDatabaseError),
        ),
    updateWhere: (write) =>
      Effect.map(
        write.returning(guardedWriteProjection),
        (rows) => rows.length,
      ),
    ping: Effect.timed(sql`select 1`).pipe(
      Effect.map(([duration]) => Duration.toMillis(duration)),
      Effect.mapError(toDatabaseError),
    ),
    plain,
  };
};

// ---------------------------------------------------------------------------
// Service + D1 layer
// ---------------------------------------------------------------------------

export class Database extends Context.Service<Database, DatabaseShape>()(
  "@gmacko/db/Database",
) {
  /**
   * Production layer over a D1 binding. `bookmark` is accepted for the D1
   * Sessions API (read replication) but unused: `@effect/sql-d1` takes a
   * `D1Database`, not a `D1DatabaseSession`, so threading a bookmark waits
   * for driver support. Replication is off at launch.
   */
  static layer = (
    d1: D1Database,
    _options?: { readonly bookmark?: string },
  ): Layer.Layer<Database> =>
    Layer.effect(Database)(
      Effect.gen(function* () {
        const client = yield* D1Client.make({
          db: d1,
          spanAttributes: { "db.system.name": "sqlite", "db.namespace": "d1" },
        });
        const db = yield* D1Drizzle.makeWithDefaults({ relations }).pipe(
          Effect.provideService(D1Client.D1Client, client),
        );
        return makeDatabase({
          db,
          sql: client,
          runBatch: (statements) => client.batch(statements),
          plain: () => drizzlePlain(d1, { relations }),
        });
      }),
    ).pipe(Layer.provide(Reactivity.layer));
}
