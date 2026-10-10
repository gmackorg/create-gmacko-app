/** Shared column mapping for SQL adapters, derived from the compiled SqlSchema in the bundle. */
import { type Field, type Model, type Resource } from "../model.js";
export interface SqlColumn {
    name: string;
    sqlType: string;
    nullable: boolean;
    field?: string;
    storage: string;
}
export interface SqlTable {
    name: string;
    resource?: string;
    columns: SqlColumn[];
    primaryKey: string[];
}
export interface SqlIndex {
    name: string;
    table: string;
    columns: string[];
    unique: boolean;
    query?: string;
    constraint?: string;
}
export interface SqlSchema {
    tables: SqlTable[];
    indexes: SqlIndex[];
    systemTables: SqlTable[];
}
export declare class SqlMapping {
    readonly model: Model;
    private readonly tables;
    constructor(model: Model);
    table(r: Resource): SqlTable;
    column(r: Resource, field: string): SqlColumn;
    /** Unique constraint name for a failed UNIQUE index message, by table + columns. */
    uniqueByColumns(table: string, columns: string[]): string | undefined;
    toColumn(f: Field, value: unknown): unknown;
    fromColumn(f: Field, value: unknown): unknown;
    /** Stored record (wire form) -> column map. */
    toRow(r: Resource, rec: Record<string, unknown>): Record<string, unknown>;
    fromRow(r: Resource, row: Record<string, unknown>): Record<string, unknown>;
}
