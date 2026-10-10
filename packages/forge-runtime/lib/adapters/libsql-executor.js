import { err } from "../errors.js";
function statement(s) {
    const args = s.params.map((value) => {
        if (value === null ||
            typeof value === "string" ||
            typeof value === "bigint" ||
            (typeof value === "number" && Number.isFinite(value)) ||
            value instanceof Uint8Array ||
            value instanceof ArrayBuffer)
            return value;
        throw err("ValidationFailed", "Unsupported libSQL parameter");
    });
    return { sql: s.sql, args };
}
function changes(result) {
    if (!Number.isSafeInteger(result.rowsAffected) || result.rowsAffected < 0)
        throw err("StorageUnavailable", "Invalid libSQL affected-row result");
    return { changes: result.rowsAffected };
}
export function libsqlExecutor(client) {
    return {
        facade: "libsql",
        first: async (s) => {
            const result = await client.execute(statement(s));
            return (result.rows[0] ?? null);
        },
        all: async (s) => (await client.execute(statement(s))).rows,
        run: async (s) => changes(await client.execute(statement(s))),
        batch: async (statements) => {
            if (!statements.length)
                return [];
            const result = await client.batch(statements.map(statement), "write");
            if (result.length !== statements.length)
                throw err("StorageUnavailable", "Incomplete libSQL batch result");
            return result.map(changes);
        },
    };
}
