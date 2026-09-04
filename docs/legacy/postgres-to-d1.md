# Moving an existing Postgres database to D1

For an app generated from the **old** template (Next.js + tRPC + Postgres,
`docs/legacy/PLAN.md`) that is adopting the current web lane
(`docs/adr/0001-tanstack-effect-d1.md`). A fresh app needs none of this: run
the migrations and the seed.

The schema half is already done — `packages/db/migrations` is the D1 schema,
and it is close enough to the old Postgres one that the tables and columns
line up by name. This page is the **data** half, and the tool is
[`scripts/pg-to-d1.mjs`](../../scripts/pg-to-d1.mjs).

> Read [`drizzle-migrations.md`](../drizzle-migrations.md) first if you also
> have schema changes to make. D1 applies a migration file as one batch with
> foreign keys on, so expand/contract is not advice, it is the only thing that
> works.

## What changes between the two databases

SQLite has four storage classes; Postgres has hundreds of types. Everything
below is the mapping the converter applies, derived from the newest drizzle
snapshot in `packages/db/drizzle` — so it follows the real schema rather than
a description of it.

| Postgres | D1 column | Conversion |
| --- | --- | --- |
| `uuid` | `text` | the uuid's text form |
| `text`, `varchar`, enum | `text` | verbatim |
| `timestamptz`, `timestamp` | `integer` | epoch **milliseconds** (drizzle `mode: "timestamp_ms"`). A bare `timestamp` is read as UTC. |
| `boolean` | `integer` | `1` / `0` (drizzle `mode: "boolean"`) |
| `json`, `jsonb` | `text` | the JSON text (drizzle `mode: "json"`) |
| `integer`, `bigint` | `integer` | verbatim; a bigint past 2^53 is out of range for D1 |
| `numeric`, `double precision` | `real` | verbatim |
| `bytea`, arrays, composites | — | **no mapping**; see "What it will not do" |

Identifiers are matched by snake_case, so an old `"emailVerified"` column
lands in `email_verified` whichever convention the legacy schema used.

## The procedure

### 1. Freeze writes

Put the old app in maintenance mode. The converter produces a snapshot; there
is no incremental sync.

### 2. Create and migrate the target database

```bash
wrangler d1 create gmacko-web-production          # note the id
# put the id in apps/web/wrangler.jsonc env.production.d1_databases[0]
pnpm cf-typegen
pnpm -F @gmacko/db migrate:remote --env production
```

Do **not** seed yet. The seed's `application_settings` row is inserted only
when the table is empty, and the legacy data may bring its own.

### 3. Dump the old database

```bash
pg_dump "$LEGACY_DATABASE_URL" \
  --data-only --column-inserts --no-owner --no-privileges \
  --exclude-table='drizzle.*' \
  -f legacy.sql
```

`--column-inserts` is required: it puts the column names on every row, which
is what lets the converter map them. It is slow on a large database; that is
the trade for a file you can read and diff.

### 4. Convert

```bash
node scripts/pg-to-d1.mjs --dump legacy.sql --out data.sql
```

It prints a report on stderr and exits non-zero if any row could not be
mapped:

```
skipped table "legacy_audit_log": not in the D1 schema
skipped column "user_preferences.legacyDigestHour": not in the D1 schema
417 row(s) across 9 table(s)
```

Read that report. A skipped table or column is usually right (the old schema
had things this one does not), but it is the one place data goes missing
quietly, so decide rather than assume. Tables come out parents-first, from the
schema's foreign keys, so the file applies with foreign keys on — which is the
only way D1 will apply it.

Reading a live database instead of a dump works too, and needs the `postgres`
package on the path (it is deliberately not a dependency of this repo, because
this runs once):

```bash
pnpm dlx --package=postgres node scripts/pg-to-d1.mjs \
  --url "$LEGACY_DATABASE_URL" --out data.sql
```

### 5. Apply

```bash
pnpm -F @gmacko/db exec wrangler d1 execute DB --remote --env production \
  --file ../../data.sql --config ../../apps/web/wrangler.jsonc
```

`wrangler d1 execute --file` has a size ceiling per call. Split `data.sql` on
table boundaries (the `-- <table> (<n> rows)` comments) and apply the pieces
**in file order** if it refuses the whole thing; the order is what keeps the
foreign keys satisfied.

### 6. Seed and check

```bash
pnpm -F @gmacko/db seed:remote --env production   # idempotent; fills any gaps
```

Then check the counts against the old database, sign in as a real user, and
confirm `select count(*)` matches per table before you unfreeze.

## What it will not do

- **`bytea`, arrays, composite types.** No mapping; the row is reported and
  skipped. Move those out of band (files to R2, arrays to a
  JSON column) before dumping.
- **better-auth's `account.issuer`.** Present from better-auth 1.7, absent
  before it. A dump from an older database has no `issuer` value and the
  column is NOT NULL, so those rows fail. Backfill `issuer` in the old
  database first (it is the provider's issuer URL) or re-link the OAuth
  accounts after the move.
- **Sessions.** They are worth dropping rather than moving: everyone signs in
  again, and a stale session is the last thing you want carried across a
  cutover. Exclude `session` from the dump.
- **Incremental sync.** One snapshot, taken with writes frozen.
- **Sequences.** D1's ids are text generated in the Worker; there are no
  sequences to reset.

## Test coverage

`packages/db/src/__tests__/pg-to-d1.test.ts` runs the script over
`fixtures/legacy-pg-dump.sql` — uuids, `timestamptz` and bare `timestamp`,
booleans, `jsonb`, camelCase identifiers, an apostrophe, an `E''` escape, a
multi-line value, a missing table and a missing column, and rows in the wrong
dependency order — and applies the result to a real sqlite database carrying
the D1 migrations (`Database.layerTest`), then reads the rows back through
drizzle. If the mapping breaks, that suite fails.
