#!/usr/bin/env node
/**
 * Convert a legacy Postgres dataset into SQL that D1 accepts — the data half
 * of moving an app off the pre-migration stack (see
 * docs/legacy/postgres-to-d1.md for the whole procedure).
 *
 *   node scripts/pg-to-d1.mjs --dump legacy.sql --out data.sql
 *   node scripts/pg-to-d1.mjs --url postgres://user@host/db --out data.sql
 *   pnpm -F @gmacko/db exec wrangler d1 execute DB --remote --env staging \
 *     --file ../../data.sql --config ../../apps/web/wrangler.jsonc
 *
 * `--dump` reads `pg_dump --data-only --column-inserts` output (the
 * `--column-inserts` matters: every row has to carry its column names).
 * `--url` reads the tables live and needs the `postgres` package on the path
 * (`pnpm dlx --package=postgres node scripts/pg-to-d1.mjs --url ...`); it is
 * not a dependency of this repo, because this script runs once.
 *
 * The target schema is read from the newest drizzle snapshot in
 * `packages/db/drizzle`, so the conversion follows the real D1 schema rather
 * than a copy of it:
 *
 * - a Postgres identifier is matched to a D1 column by snake_case, so
 *   `"emailVerified"` lands in `email_verified`;
 * - a value going into a D1 `integer` column is coerced by what it looks
 *   like: `true`/`false` become 1/0, an ISO timestamp becomes epoch
 *   milliseconds (what drizzle's `timestamp_ms` mode reads), a number stays
 *   a number — which is how uuid/timestamptz/boolean/jsonb columns all end up
 *   in the two types SQLite has;
 * - a value going into a `text` column is emitted as a SQLite string literal,
 *   so a uuid becomes its text form and a `json`/`jsonb` object becomes its
 *   JSON text (what drizzle's `mode: "json"` columns store);
 * - tables are emitted parents-first, from the snapshot's foreign keys, so
 *   the file applies with foreign keys on (D1 always has them on);
 * - a table or column the D1 schema does not have is skipped with a warning
 *   on stderr rather than producing SQL that fails halfway through.
 *
 * What it does NOT do: `bytea`, arrays, and composite types have no mapping
 * here and are reported; better-auth's own tables (`user`, `session`,
 * `account`, `verification`) are carried over like any other, but check the
 * ADR note about `account.issuer` first — a 1.7 database has the column and
 * an older one does not.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRIZZLE_DIR = join(ROOT, "packages", "db", "drizzle");

// ---------------------------------------------------------------------------
// Target schema (the newest drizzle snapshot)
// ---------------------------------------------------------------------------

/** The newest `packages/db/drizzle/<timestamp>_<slug>/snapshot.json`. */
export const latestSnapshotPath = (dir = DRIZZLE_DIR) => {
  const folders = readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort();
  const latest = folders.at(-1);
  if (latest === undefined) throw new Error(`no migrations in ${dir}`);
  return join(dir, latest, "snapshot.json");
};

/**
 * `{ tables: Map<table, Map<column, type>>, parents: Map<table, Set<table>> }`
 * from a drizzle snapshot's `ddl` entries.
 */
export const readTargetSchema = (snapshotPath = latestSnapshotPath()) => {
  const { ddl } = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const tables = new Map();
  const parents = new Map();
  for (const entry of ddl) {
    if (entry.entityType !== "tables") continue;
    tables.set(entry.name, new Map());
    parents.set(entry.name, new Set());
  }
  for (const entry of ddl) {
    if (entry.entityType === "columns") {
      tables
        .get(entry.table)
        ?.set(entry.name, String(entry.type).toLowerCase());
    }
    if (entry.entityType === "fks" && entry.table !== entry.tableTo) {
      parents.get(entry.table)?.add(entry.tableTo);
    }
  }
  return { tables, parents };
};

/** Table names with every table after the tables it references. Deterministic. */
export const insertionOrder = (parents) => {
  const order = [];
  const state = new Map();
  const visit = (name) => {
    const seen = state.get(name);
    if (seen === "done") return;
    if (seen === "visiting") throw new Error(`foreign key cycle at "${name}"`);
    state.set(name, "visiting");
    for (const parent of [...(parents.get(name) ?? [])].sort()) visit(parent);
    state.set(name, "done");
    order.push(name);
  };
  for (const name of [...parents.keys()].sort()) visit(name);
  return order;
};

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

const unquoteIdentifier = (raw) => {
  const trimmed = raw.trim();
  const bare = trimmed.includes(".")
    ? trimmed.slice(trimmed.lastIndexOf(".") + 1)
    : trimmed;
  return bare.startsWith('"') && bare.endsWith('"')
    ? bare.slice(1, -1).replace(/""/g, '"')
    : bare;
};

/** `emailVerified` and `email_verified` both key on `email_verified`. */
export const toSnakeCase = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/;

/** A SQLite string literal: single quotes, `''` for an embedded quote. */
export const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** The text a Postgres string literal stands for (`''` and `E'\\n'` escapes). */
const decodeStringLiteral = (literal) => {
  const escaped = literal.startsWith("E'") || literal.startsWith("e'");
  const body = literal.slice(escaped ? 2 : 1, -1).replace(/''/g, "'");
  if (!escaped) return body;
  return body.replace(/\\(.)/g, (_, char) =>
    char === "n"
      ? "\n"
      : char === "t"
        ? "\t"
        : char === "r"
          ? "\r"
          : char === "\\"
            ? "\\"
            : char,
  );
};

const isStringLiteral = (raw) =>
  raw.startsWith("'") || raw.startsWith("E'") || raw.startsWith("e'");

/**
 * One Postgres literal as the SQLite literal for `type` (`text` or
 * `integer`). Throws on a type this script has no mapping for, so the caller
 * can report the column rather than emit something that silently loses data.
 */
export const toSqliteLiteral = (raw, type) => {
  const value = raw.trim();
  if (value.toUpperCase() === "NULL") return "null";

  const text = isStringLiteral(value) ? decodeStringLiteral(value) : value;

  if (type === "integer") {
    if (text === "true" || text === "t") return "1";
    if (text === "false" || text === "f") return "0";
    if (TIMESTAMP.test(text)) {
      // A bare `timestamp` has no zone; Postgres stores it as UTC and the D1
      // column is epoch ms, so read it as UTC rather than as local time.
      const dated = text.includes("T") ? text : text.replace(" ", "T");
      // Postgres writes the offset as `+00` or `+0000`; `Date.parse` wants
      // `+00:00`. A value with no offset at all is a bare `timestamp`, which
      // Postgres stores as UTC.
      const zoned = /(Z|[+-]\d{2}(:?\d{2})?)$/.test(dated)
        ? dated.replace(
            /([+-])(\d{2}):?(\d{2})?$/,
            (_, sign, hours, minutes) => `${sign}${hours}:${minutes ?? "00"}`,
          )
        : `${dated}Z`;
      const ms = Date.parse(zoned);
      if (Number.isNaN(ms)) throw new Error(`unparseable timestamp: ${text}`);
      return String(ms);
    }
    if (/^-?\d+$/.test(text)) return text;
    throw new Error(`cannot map ${JSON.stringify(text)} to an integer column`);
  }

  if (type === "text") {
    // uuid, enum, json and jsonb all arrive as text and stay text.
    return quote(text);
  }

  if (type === "real" || type === "numeric") {
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text)) return text;
    throw new Error(`cannot map ${JSON.stringify(text)} to a real column`);
  }

  throw new Error(`no mapping for column type "${type}"`);
};

/** A JS value (the `--url` path) as the SQLite literal for `type`. */
export const valueToSqliteLiteral = (value, type) => {
  if (value === null || value === undefined) return "null";
  if (type === "integer") {
    if (value === true) return "1";
    if (value === false) return "0";
    if (value instanceof Date) return String(value.getTime());
    if (Number.isFinite(value)) return String(Math.trunc(value));
    // Everything else — bigint, numeric strings, timestamp strings — goes
    // through the literal mapper, which rejects what it cannot map rather
    // than emitting `NaN`.
    return toSqliteLiteral(String(value), type);
  }
  if (type === "text") {
    // Objects and arrays (json/jsonb columns read through the driver) are
    // stored as their JSON encoding; `null` was handled above.
    if (value instanceof Object) return quote(JSON.stringify(value));
    return quote(String(value));
  }
  return toSqliteLiteral(String(value), type);
};

// ---------------------------------------------------------------------------
// Dump parsing
// ---------------------------------------------------------------------------

/**
 * Splits `text` on `separator` at paren depth 0 and outside string literals,
 * so a comma inside `'a, b'` or inside `f(a, b)` does not split.
 */
const splitTopLevel = (text, separator) => {
  const parts = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === "\\") {
        i += 1;
        continue;
      }
      if (char === "'") {
        if (text[i + 1] === "'") i += 1;
        else quoted = false;
      }
      continue;
    }
    if (char === "'") quoted = true;
    else if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
};

/** The index of the `;` that ends the statement starting at `from`. */
const endOfStatement = (text, from) => {
  let quoted = false;
  for (let i = from; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === "\\") i += 1;
      else if (char === "'") {
        if (text[i + 1] === "'") i += 1;
        else quoted = false;
      }
      continue;
    }
    if (char === "'") quoted = true;
    else if (char === ";") return i;
  }
  return -1;
};

/**
 * Every `INSERT INTO <table> (<columns>) VALUES (<values>);` in a
 * `pg_dump --data-only --column-inserts` file, as
 * `{ table, columns: string[], rows: string[][] }`.
 */
export const parseDump = (text) => {
  const statements = [];
  const pattern = /INSERT\s+INTO\s+([^\s(]+)\s*\(([^)]*)\)\s*VALUES\s*/gi;
  let match = pattern.exec(text);
  while (match !== null) {
    const end = endOfStatement(text, pattern.lastIndex);
    if (end === -1) {
      throw new Error(`unterminated INSERT for ${match[1]}`);
    }
    const tuples = splitTopLevel(text.slice(pattern.lastIndex, end), ",");
    statements.push({
      table: unquoteIdentifier(match[1]),
      columns: splitTopLevel(match[2], ",").map(unquoteIdentifier),
      rows: tuples.map((tuple) =>
        splitTopLevel(tuple.trim().replace(/^\(|\)$/g, ""), ","),
      ),
    });
    pattern.lastIndex = end + 1;
    match = pattern.exec(text);
  }
  return statements;
};

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * `{ sql, report }` for the parsed statements against `schema`. `report`
 * carries the per-table row counts and everything skipped, for stderr.
 */
export const convert = (statements, schema, options = {}) => {
  const verb = options.onConflict === "ignore" ? "insert or ignore" : "insert";
  const byTable = new Map();
  const skippedTables = new Set();
  const skippedColumns = new Set();
  const failures = [];

  for (const statement of statements) {
    const table = schema.tables.get(statement.table);
    if (table === undefined) {
      skippedTables.add(statement.table);
      continue;
    }
    const mapped = statement.columns.map((column) => {
      const name = toSnakeCase(column);
      if (!table.has(name)) {
        skippedColumns.add(`${statement.table}.${column}`);
        return null;
      }
      return name;
    });
    const kept = mapped.filter((name) => name !== null);
    if (kept.length === 0) continue;

    const lines = byTable.get(statement.table) ?? [];
    for (const row of statement.rows) {
      const values = [];
      let failed = false;
      for (let i = 0; i < mapped.length; i += 1) {
        const name = mapped[i];
        if (name === null) continue;
        try {
          values.push(toSqliteLiteral(row[i] ?? "NULL", table.get(name)));
        } catch (cause) {
          failures.push(`${statement.table}.${name}: ${cause.message}`);
          failed = true;
          break;
        }
      }
      if (failed) continue;
      const columns = kept.map((name) => `"${name}"`).join(", ");
      lines.push(
        `${verb} into "${statement.table}" (${columns}) values (${values.join(", ")});`,
      );
    }
    byTable.set(statement.table, lines);
  }

  const order = insertionOrder(schema.parents);
  const body = [];
  const counts = {};
  for (const table of order) {
    const lines = byTable.get(table);
    if (lines === undefined || lines.length === 0) continue;
    counts[table] = lines.length;
    body.push(`-- ${table} (${lines.length} rows)`, ...lines);
  }

  const header = [
    "-- Generated by `node scripts/pg-to-d1.mjs`. Apply with:",
    "--   wrangler d1 execute DB --remote --env <stage> --file <this file> \\",
    "--     --config apps/web/wrangler.jsonc",
    "-- Tables are parents-first, so this applies with foreign keys on.",
  ];
  return {
    sql: `${[...header, ...body].join("\n")}\n`,
    report: {
      counts,
      skippedTables: [...skippedTables].sort(),
      skippedColumns: [...skippedColumns].sort(),
      failures,
    },
  };
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const readLive = async (url, schema) => {
  let postgres;
  try {
    postgres = (await import("postgres")).default;
  } catch {
    throw new Error(
      "--url needs the `postgres` package on the path; it is not a dependency of this repo.\n" +
        "  pnpm dlx --package=postgres node scripts/pg-to-d1.mjs --url ...",
    );
  }
  const sql = postgres(url, { max: 1 });
  try {
    const statements = [];
    for (const table of insertionOrder(schema.parents)) {
      const rows = await sql`select * from ${sql(table)}`.catch(() => null);
      if (rows === null || rows.length === 0) continue;
      const columns = Object.keys(rows[0]);
      const target = schema.tables.get(table);
      statements.push({
        table,
        columns,
        rows: rows.map((row) =>
          columns.map((column) => {
            const name = toSnakeCase(column);
            const type = target?.get(name);
            // Pre-rendered: `convert` re-parses literals, and a rendered
            // literal parses back to itself.
            return type === undefined
              ? "NULL"
              : valueToSqliteLiteral(row[column], type);
          }),
        ),
      });
    }
    return statements;
  } finally {
    await sql.end({ timeout: 5 });
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const dump = flag("--dump");
  const url = flag("--url");
  const out = flag("--out");
  const onConflict = flag("--on-conflict");

  if ((dump === undefined) === (url === undefined)) {
    console.error(
      "usage: node scripts/pg-to-d1.mjs (--dump <file> | --url <postgres url>) [--out <file>] [--on-conflict ignore]",
    );
    process.exit(2);
  }

  const schema = readTargetSchema();
  const statements =
    dump === undefined
      ? await readLive(url, schema)
      : parseDump(readFileSync(dump, "utf8"));

  const { sql, report } = convert(statements, schema, { onConflict });

  for (const table of report.skippedTables) {
    console.error(`skipped table "${table}": not in the D1 schema`);
  }
  for (const column of report.skippedColumns) {
    console.error(`skipped column "${column}": not in the D1 schema`);
  }
  for (const failure of report.failures) {
    console.error(`skipped row — ${failure}`);
  }
  const total = Object.values(report.counts).reduce((a, b) => a + b, 0);
  console.error(
    `${total} row(s) across ${Object.keys(report.counts).length} table(s)`,
  );

  if (out === undefined) process.stdout.write(sql);
  else writeFileSync(out, sql);

  if (report.failures.length > 0) process.exit(1);
};

// Only when run as a script: the test imports the functions above.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
