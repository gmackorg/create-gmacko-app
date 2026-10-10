/** libSQL/Turso facade. The caller owns endpoint, credentials and client lifetime. */
import type { SqlExecutor } from "./sql-executor.js";
type Value = null | string | number | bigint | Uint8Array | ArrayBuffer;
export interface LibsqlResult {
    rows: readonly unknown[];
    rowsAffected: number;
}
export interface LibsqlClient {
    execute(statement: {
        sql: string;
        args: Value[];
    }): Promise<LibsqlResult>;
    /** libSQL's write batch is one transaction, rolling back on any failure. */
    batch(statements: {
        sql: string;
        args: Value[];
    }[], mode: "write"): Promise<LibsqlResult[]>;
}
export declare function libsqlExecutor(client: LibsqlClient): SqlExecutor;
export {};
