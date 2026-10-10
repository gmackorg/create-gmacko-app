import type { D1Like } from "./d1.js";
export interface SqlStatement {
    sql: string;
    params: unknown[];
}
export interface SqlExecutor {
    readonly facade: string;
    first<T = Record<string, unknown>>(s: SqlStatement): Promise<T | null>;
    all<T = Record<string, unknown>>(s: SqlStatement): Promise<T[]>;
    run(s: SqlStatement): Promise<{
        changes: number;
    }>;
    /** Atomic: all statements succeed or none is applied. */
    batch(statements: SqlStatement[]): Promise<{
        changes: number;
    }[]>;
}
/** Raw D1 binding. */
export declare function rawD1Executor(db: D1Like): SqlExecutor;
/**
 * Drizzle's D1 driver as the query facade. Drizzle's `batch()` only accepts its
 * own query-builder objects (it binds through `preparedQuery.stmt`), not raw
 * SQL, so the atomic batch delegates to the D1 binding — the one tested
 * transactional primitive (plan §10.2). Reads and single statements go
 * through drizzle so a project that adopts drizzle for its own queries shares
 * one client.
 */
export declare function drizzleD1Executor(db: D1Like): SqlExecutor;
/**
 * Effect 4 `SqlConnection`-shaped facade. Effect's Connection has no batch
 * primitive, so reads go through an Effect Connection built on D1 and the
 * atomic batch delegates to D1 — never to a JS-level transaction callback.
 */
export declare function effectSqlExecutor(db: D1Like): SqlExecutor;
