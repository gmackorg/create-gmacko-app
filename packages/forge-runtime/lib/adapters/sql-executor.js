/**
 * SQL facade seam (plan §10.2). D1Storage compiles logical plans to SQL; an
 * executor runs them. The atomic primitive is `batch` — a D1 batch, which is
 * transactional — so every facade exposes it. Drizzle and Effect's Connection
 * are alternative front doors to the same batch.
 */
import { Effect } from "effect";
import { drizzle } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";
/** Raw D1 binding. */
export function rawD1Executor(db) {
    const prep = (s) => db.prepare(s.sql).bind(...s.params);
    return {
        facade: "raw-d1",
        first: (s) => prep(s).first(),
        all: async (s) => (await prep(s).all()).results,
        run: async (s) => ({ changes: (await prep(s).run()).meta.changes }),
        batch: async (statements) => (await db.batch(statements.map(prep))).map((r) => ({ changes: r.meta?.changes ?? 0 })),
    };
}
/**
 * Drizzle's D1 driver as the query facade. Drizzle's `batch()` only accepts its
 * own query-builder objects (it binds through `preparedQuery.stmt`), not raw
 * SQL, so the atomic batch delegates to the D1 binding — the one tested
 * transactional primitive (plan §10.2). Reads and single statements go
 * through drizzle so a project that adopts drizzle for its own queries shares
 * one client.
 */
export function drizzleD1Executor(db) {
    const d = drizzle(db);
    const raw = rawD1Executor(db);
    const toDrizzle = (s) => {
        // Bind positional params with drizzle's param placeholders.
        const chunks = s.sql.split("?");
        let built = sql.raw(chunks[0] ?? "");
        for (let i = 1; i < chunks.length; i++)
            built = sql `${built}${s.params[i - 1]}${sql.raw(chunks[i] ?? "")}`;
        return built;
    };
    return {
        facade: "drizzle",
        first: async (s) => (await d.all(toDrizzle(s)))[0] ?? null,
        all: async (s) => (await d.all(toDrizzle(s))),
        run: async (s) => ({ changes: Number((await d.run(toDrizzle(s))).meta?.changes ?? 0) }),
        batch: (statements) => raw.batch(statements),
    };
}
/**
 * Effect 4 `SqlConnection`-shaped facade. Effect's Connection has no batch
 * primitive, so reads go through an Effect Connection built on D1 and the
 * atomic batch delegates to D1 — never to a JS-level transaction callback.
 */
export function effectSqlExecutor(db) {
    const raw = rawD1Executor(db);
    const connection = {
        execute: (sqlText, params) => Effect.promise(() => raw.all({ sql: sqlText, params: [...params] })),
        executeRaw: (sqlText, params) => Effect.promise(() => raw.run({ sql: sqlText, params: [...params] })),
    };
    return {
        facade: "effect-sql",
        first: async (s) => (await Effect.runPromise(connection.execute(s.sql, s.params)))[0] ?? null,
        all: (s) => Effect.runPromise(connection.execute(s.sql, s.params)),
        run: (s) => Effect.runPromise(connection.executeRaw(s.sql, s.params)),
        batch: (statements) => raw.batch(statements),
    };
}
