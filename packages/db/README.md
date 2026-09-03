# @gmacko/db

The `Database` Effect service over Cloudflare D1 (drizzle's Effect API,
`@effect/sql-d1`), plus an in-memory sqlite-node layer for Node tests.

## Layout

- `src/schema.ts`, `src/auth-schema.ts`, `src/columns.ts`: drizzle tables.
- `src/database.ts`: the service, `DatabaseError`, `Database.layer(d1)`.
- `src/testing.ts`: `layerTest` (sqlite-node `:memory:` + migrations).
- `drizzle/`: drizzle-kit's migration folders (source of truth, with snapshots).
- `migrations/`: the same SQL flattened to `<name>.sql` for D1
  (`pnpm generate` runs `scripts/flatten-migrations.mjs`, which also removes
  flat files whose drizzle folder is gone).

## Scripts

- `pnpm test`: the Database suite against sqlite-node.
- `pnpm test:workers`: the same suite against a Miniflare D1 through
  `@cloudflare/vitest-pool-workers` (also run in CI as `pnpm test:workers`
  from the repo root). `vitest.workers.config.ts` mirrors
  `apps/web/wrangler.jsonc` by hand; keep them in step.
- `pnpm generate`: drizzle-kit generate + flatten.
- `pnpm migrate:local` / `pnpm migrate:remote`: `wrangler d1 migrations apply`.

## Migrations

- Forward-only, applied by `wrangler d1 migrations apply`, which runs each
  file as **one D1 batch, i.e. one transaction** (`applyD1Migrations` in the
  Workers suite does the same).
- `20260903035551_auth_1_7_issuer.sql` is **safe only on an empty database**.
  It adds `account.issuer text NOT NULL` without a default (any existing
  account row makes the ALTER fail) and rebuilds `user` and `verification`
  with drizzle-kit's `PRAGMA foreign_keys=OFF` + `DROP TABLE` + rename
  recipe. SQLite ignores `PRAGMA foreign_keys` while a transaction is open,
  so inside the D1 batch the pragma is a no-op and `DROP TABLE user`
  cascades into `session`, `account`, `api_keys` and every other table with
  `ON DELETE CASCADE` to `user` (the rows are gone after the rename).
  `src/__tests__/migrations.workers.test.ts` proves both facts on a Miniflare
  D1. Do not reuse or copy that recipe once a stage database exists.
- From the first stage database on, every change is **expand/contract**: add
  a nullable or defaulted column, backfill in the app or a follow-up
  migration, then tighten; add a new table and copy, never drop-and-recreate
  a table that other rows reference. Review every drizzle-kit output for a
  `__new_` table or a `PRAGMA foreign_keys=OFF` line before committing it.

## Conventions

- Every query surface fails with `DatabaseError` except the raw `sql` tag,
  which fails with the driver's `SqlError`; wrap it with `toDatabaseError`.
- `created_at` has **no database default** (the DDL is `integer NOT NULL`, no
  `DEFAULT`). It is app-supplied: app tables get it from drizzle's
  `$defaultFn(() => new Date())` in `columns.ts#timestamps`, auth tables from
  better-auth, which sets `createdAt`/`updatedAt` itself. Anything that
  bypasses both (raw `sql` inserts, the D1 console, `Database.plain` outside
  better-auth) must pass `created_at` explicitly or the insert fails.
- D1 has no interactive transactions. `Database.batch` (all-or-nothing) and
  guarded writes (`updateWhere`, a WHERE-encoded precondition returning the
  changed-row count) are the only multi-statement primitives.
