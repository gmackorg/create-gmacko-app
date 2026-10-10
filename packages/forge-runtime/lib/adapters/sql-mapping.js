/** Shared column mapping for SQL adapters, derived from the compiled SqlSchema in the bundle. */
import { scaleOf } from "../model.js";
import { formatMinor, toMinor } from "../codecs.js";
export class SqlMapping {
    model;
    tables = new Map();
    constructor(model) {
        this.model = model;
        const schema = model.bundle.sql;
        for (const t of schema.tables)
            if (t.resource)
                this.tables.set(t.resource, t);
    }
    table(r) {
        const t = this.tables.get(r.id);
        if (!t)
            throw new Error(`no table for ${r.id}`);
        return t;
    }
    column(r, field) {
        const c = this.table(r).columns.find((x) => x.field === field);
        if (!c)
            throw new Error(`no column for ${r.id}.${field}`);
        return c;
    }
    /** Unique constraint name for a failed UNIQUE index message, by table + columns. */
    uniqueByColumns(table, columns) {
        const schema = this.model.bundle.sql;
        const set = [...columns].sort().join(",");
        const matches = schema.indexes.filter((i) => i.unique && i.table === table && [...i.columns].sort().join(",") === set);
        // SQLite reports columns, not the failed partial-index name. Do not guess when several match.
        return matches.length === 1 ? matches[0].constraint : undefined;
    }
    toColumn(f, value) {
        if (value === null || value === undefined)
            return null;
        const storage = this.column(this.model.resources.find((r) => r.fields.includes(f)), f.name).storage;
        switch (storage) {
            case "minorUnits":
                return Number(toMinor(String(value), scaleOf(f.type)));
            case "bool":
                return value ? 1 : 0;
            case "json":
                return JSON.stringify(value);
            default:
                return value;
        }
    }
    fromColumn(f, value) {
        if (value === null || value === undefined)
            return null;
        const storage = this.column(this.model.resources.find((r) => r.fields.includes(f)), f.name).storage;
        switch (storage) {
            case "minorUnits":
                return formatMinor(BigInt(value), scaleOf(f.type));
            case "bool":
                return value === 1 || value === true;
            case "json":
                return typeof value === "string" ? JSON.parse(value) : value;
            default:
                return value;
        }
    }
    /** Stored record (wire form) -> column map. */
    toRow(r, rec) {
        const row = {};
        for (const f of r.fields) {
            if (f.derived)
                continue;
            const c = this.column(r, f.name);
            row[c.name] = this.toColumn(f, rec[f.name]);
        }
        return row;
    }
    fromRow(r, row) {
        const rec = {};
        for (const f of r.fields) {
            if (f.derived)
                continue;
            const c = this.column(r, f.name);
            rec[f.name] = this.fromColumn(f, row[c.name]);
        }
        return rec;
    }
}
