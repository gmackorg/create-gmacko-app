/**
 * PostgreSQL adapter (FORGE-033/034). The relational plan and the guarded
 * mutation protocol are the SQL ones already executed on D1: every commit is a
 * list of statements beginning with a guarded assertion. PostgreSQL evaluates that predicate
 * natively and aborts on false, without writing a shared `_forge_assert` row. A batch is
 * one transaction; PostgreSQL error classes are mapped onto the same stable
 * outcomes (unique conflict, missing reference, precondition failed,
 * serialization retry). Text columns carry `COLLATE "C"` so keyset order is
 * the same byte order D1 and DynamoDB produce.
 *
 * Facades (plan §5.2): `raw-pg` (node-postgres) and `drizzle-pg`
 * (drizzle-orm/node-postgres). Both bind parameters positionally, never
 * interpolate, and run the atomic batch through one `BEGIN … COMMIT` on a
 * single pooled connection whose transaction-local settings are reset on
 * every exit path, so a pooled connection never retains a prior tenant.
 */
import { type Pool } from "pg";
import type { Model } from "../model.js";
import { D1Storage } from "./d1.js";
import type { SqlExecutor } from "./sql-executor.js";
/** `?` placeholders (shared SQL plan) → `$n`; the one SQLite-only clause in the plan gets its standard form. */
export declare function toPositional(sql: string): string;
/** Map a PostgreSQL error to the message vocabulary the shared classifier understands. */
export declare function translateError(e: unknown, statementSql: string): Error;
/** node-postgres facade. */
export declare function rawPgExecutor(pool: Pool): SqlExecutor;
/**
 * drizzle-orm/node-postgres facade: reads and single statements through drizzle's
 * `sql` template (positional binds), the atomic batch through one pg transaction —
 * drizzle exposes no batch primitive on Postgres, and a JS-level transaction
 * callback would be the wrong layer for the guarded protocol.
 */
export declare function drizzlePgExecutor(pool: Pool): Promise<SqlExecutor>;
/** The same storage semantics as D1, on PostgreSQL. */
export declare class PostgresStorage extends D1Storage {
    protected readonly assertCreateAbsent = false;
    constructor(executor: SqlExecutor, model: Model);
    /**
     * A serialization failure under SERIALIZABLE is the expected outcome of concurrency, not a
     * fault: PostgreSQL's own guidance is to retry the whole transaction. Every commit in this
     * protocol retains real business guard reads, which can overlap on predicate locks even
     * when the application considers the commands independent. Inheriting D1's budget (3
     * attempts inside 75ms) meant independent concurrent writes failed with a 503 at a
     * double-digit rate — the same calls that succeed on D1 and DynamoDB, which is precisely the
     * kind of divergence the differential suite exists to catch.
     *
     * Full jitter spreads each retry across the entire exponential window. A fixed exponential
     * floor with a small additive jitter synchronizes losing writers into repeated collisions
     * on shared predicate locks, even when their business records are independent (#82).
     * Ten attempts retain the previous expected total sleep (~2.27s); the maximum is ~4.54s.
     * Exhaustion still returns TransientConflict: finite retries cannot guarantee progress
     * under arbitrary load, including false-positive SERIALIZABLE conflicts.
     */
    protected readonly retryAttempts = 10;
    protected retryDelayMs(attempt: number): number;
}
export declare function createPostgresStorage(pool: Pool, model: Model): PostgresStorage;
