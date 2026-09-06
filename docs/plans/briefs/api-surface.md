# API surface: Effect 4 + Drizzle 1.0 rc + Cloudflare D1

Verified 2026-09-02 from installed package sources in
`docs/plans/briefs/drizzle-research/node_modules`
(and `alt-drizzle-latest/node_modules` for drizzle-orm rc5). All signatures below are quoted from `.d.ts` files, not memory.
A runtime smoke test (`alt-drizzle-latest/smoke/test.ts`) typechecks clean and runs green against `@effect/sql-sqlite-node` in-memory.

Node: v24.14.0 (`node:sqlite` prints an ExperimentalWarning, works).

---

## 0. Headline deviations from the assumptions in the brief

| Assumption | Reality |
|---|---|
| `drizzle-orm@1.0.0-rc.4` works with `effect@4.0.0-rc.112` | **NO. rc.4 crashes at import time**: `effect-core/errors.js` and `cache/core/cache-effect.js` call `Schema.TaggedErrorClass()`, which no longer exists in effect rc.108+ (renamed to `Schema.TaggedError`). Effect 4 versions go `4.0.0-beta.1..107` then `4.0.0-rc.108..112`; drizzle rc.4 (2026-06-27) targeted a beta. **Use `drizzle-orm@1.0.0-rc.5-169397b` (npm dist-tag `rc5`, 2026-08-12)** – it uses `Schema.TaggedError()` and passes the smoke test with effect rc.112. Pair with `drizzle-kit@1.0.0-rc.5-ab785fc` (tag `rc5`). |
| `db.batch([...])` exists on the Effect flavour | **Does not exist** on `SQLiteEffectDatabase` (neither rc.4 nor rc5). Only the promise flavour `drizzle-orm/d1` has `batch`. Atomic multi-statement on D1 via Effect = `D1Client.batch([...Statement])` on `db.$client` with raw `sql\`...\`` statements. |
| `db.transaction` works on D1 | Type-wise it exists (`Effect<A, E \| SqlError, R>`), but `@effect/sql-d1` sets `transactionAcquirer = Effect.die("transactions are not supported in D1")`, so calling `db.transaction` on the D1 flavour is a **defect (die)**, not a typed failure. Transactions work on `effect-sqlite-node` (verified: rollback on typed error). |
| `Model` lives in `effect/unstable/sql` | **No.** `Model` is `effect/unstable/schema` → `Model` (file `effect/unstable/schema/Model`). `effect/unstable/sql` exports `SqlModel` = only `makeRepository` / `makeResolvers`. |
| `Model.Generated` | Does not exist; it is `Model.GeneratedByDb` (select+json only) and `Model.GeneratedByApp` (select/insert/update/json). |
| `Schema.standardSchemaV1` | Name is **`Schema.toStandardSchemaV1(self, options?)`**. |
| `Context.Tag` | Replaced by **`Context.Service`** (two forms, see §5). |
| `Effect.either` | Gone; use **`Effect.result`** (returns `Result.Result<A,E>`, tags `"Success"`/`"Failure"`, `.success`/`.failure`) or `Effect.exit`. |
| `HttpApiBuilder.toWebHandler` | Does not exist. Web handler comes from **`HttpRouter.toWebHandler(appLayer, options?)`** (`effect/unstable/http/HttpRouter`) which returns `{ handler, dispose }`; or `HttpEffect.toWebHandler*` in `effect/unstable/http/HttpEffect`. |
| drizzle-kit writes flat `NNNN_name.sql` + `meta/_journal.json` | **No.** rc layout is `<out>/<YYYYMMDDHHmmss>_<slug>/migration.sql` + `snapshot.json` per migration, no `meta/`. `drizzle-orm/migrator` **throws** if it sees `meta/_journal.json`. `wrangler d1 migrations apply` expects flat `.sql` files, so a copy/flatten step (or drizzle's own migrator) is required. |
| `drizzle-kit` `driver: "d1-http"` still valid | **Yes** (`dialect: "sqlite", driver: "d1-http", dbCredentials: { accountId, databaseId, token }`), verified by running `generate`. |

---

## 1. Package versions installed in scratch

```
effect                     4.0.0-rc.112
@effect/sql-d1             4.0.0-rc.112   (peer: effect ^4.0.0-rc.112)
@effect/sql-sqlite-node    4.0.0-rc.112   (peer: effect ^4.0.0-rc.112; no deps – uses node:sqlite)
drizzle-orm                1.0.0-rc.4     (BROKEN with effect rc.112 – see §0)  /  1.0.0-rc.5-169397b in alt-drizzle-latest (WORKS)
drizzle-kit                1.0.0-rc.4
@cloudflare/workers-types  5.20260903.1
```

drizzle-orm peerDependencies (both rc.4 and rc5, all optional): `effect`, `@effect/sql-d1`, `@effect/sql-sqlite-node`, `@effect/sql-libsql`, `@effect/sql-pg`, `@effect/sql-pglite`, `@effect/sql-mysql2`, `@effect/sql-sqlite-bun`, `@effect/sql-sqlite-do`, `@effect/sql-sqlite-wasm`, `@cloudflare/workers-types >=4`.
rc.4 declares `effect: ">=4.0.0-beta.83 || >=4.0.0"`; rc5 declares `">=4.0.0-beta.105 || >=4.0.0"`.

---

## 2. drizzle-orm Effect integration

### 2.1 Subpath exports mentioning effect

```
drizzle-orm/effect-core            (+ /errors, /logger, /defaults, /query-effect)
drizzle-orm/effect-schema          (createSelectSchema / createInsertSchema / createUpdateSchema → effect Schema)
drizzle-orm/effect-d1              (+ /driver, /session)       ← NO /migrator
drizzle-orm/effect-sqlite-node     (+ /driver, /session, /migrator)
drizzle-orm/effect-sqlite-bun      (+ /migrator)
drizzle-orm/effect-sqlite-do       (+ /migrator)
drizzle-orm/effect-sqlite-wasm     (+ /migrator)
drizzle-orm/effect-libsql          (+ /migrator)
drizzle-orm/effect-postgres, effect-pglite, effect-mysql2 (+ /codecs, /migrator)
drizzle-orm/sqlite-core/effect     (+ /db, /select, /insert, /update, /delete, /query, /raw, /count, /session, /utils)
drizzle-orm/pg-core/effect, mysql-core/effect
drizzle-orm/up-migrations/effect-sqlite | effect-pg | effect-mysql
drizzle-orm/cache/core/cache-effect
```

### 2.2 `drizzle-orm/effect-d1` (file `effect-d1/index.d.ts`)

Exports: `DefaultServices, EffectDrizzleSQLiteD1Config, EffectLogger, EffectSQLiteD1Database, EffectSQLiteD1QueryEffectHKT, EffectSQLiteD1RunResult, EffectSQLiteD1Session, EffectSQLiteD1SessionOptions, EffectSQLiteD1Transaction, make, makeWithDefaults`.

```ts
// effect-d1/driver.d.ts
import { D1Client } from "@effect/sql-d1/D1Client";
type EffectDrizzleSQLiteD1Config<TRelations extends AnyRelations> = Omit<EffectDrizzleSQLiteConfig<TRelations>, 'jit'>;
//   where EffectDrizzleSQLiteConfig<TRelations> = Omit<DrizzleSQLiteConfig<TRelations>, 'cache' | 'logger'>
//   i.e. { relations?: TRelations; casing?: ...; schema? ... } – logger/cache are Effect services instead

declare class EffectSQLiteD1Database<TRelations extends AnyRelations = EmptyRelations>
  extends SQLiteEffectDatabase<EffectSQLiteD1QueryEffectHKT, EffectSQLiteD1RunResult, TRelations> {}

/** Requires `D1Client`, `EffectLogger`, and `EffectCache` services to be provided.
 *  Use `DefaultServices` to provide default (no-op) logger and cache implementations. */
declare const make: <TRelations extends AnyRelations = EmptyRelations>(config: EffectDrizzleSQLiteD1Config<TRelations>)
  => Effect.Effect<EffectSQLiteD1Database<TRelations> & { $client: D1Client }, never, EffectCache | EffectLogger | D1Client>;

/** Convenience function that creates an EffectSQLiteD1Database with `DefaultServices` already provided. */
declare const makeWithDefaults: <TRelations extends AnyRelations = EmptyRelations>(config: EffectDrizzleSQLiteD1Config<TRelations>)
  => Effect.Effect<EffectSQLiteD1Database<TRelations> & { $client: D1Client }, never, D1Client>;

// effect-core/defaults.d.ts
declare const DefaultServices: Layer.Layer<EffectCache | EffectLogger, never, never>;
```

Note: `make` for D1 takes a **required** `config` arg (pass `{}` or `{ relations }`); the sqlite-node one is optional.

JSDoc example from the source:
```ts
const db = yield* SQLiteD1Drizzle.make({ relations }).pipe(
  Effect.provide(SQLiteD1Drizzle.DefaultServices),
);
// With Effect-based logging:
const db = yield* SQLiteD1Drizzle.make({ relations }).pipe(
  Effect.provide(EffectLogger.layer),
  Effect.provide(SQLiteD1Drizzle.DefaultServices),
);
```

`EffectLogger` (`drizzle-orm/effect-core`): `class EffectLogger extends Context.Service<EffectLogger, "drizzle-orm/EffectLogger", EffectLoggerShape>` with `static Default: Layer<EffectLogger>` (no-op), `static layer: Layer<EffectLogger>` (uses `Effect.log` with annotations), `static layerFromDrizzle(logger: Logger): Layer<EffectLogger>`, `static fromDrizzle(logger): EffectLoggerShape`, where `EffectLoggerShape = { readonly logQuery: (query: string, params: unknown[]) => Effect<void> }`.

### 2.3 Session / error channel (`effect-d1/session.d.ts`)

```ts
interface EffectSQLiteD1QueryEffectHKT extends QueryEffectHKTBase {
  readonly error: EffectDrizzleQueryError;
  readonly context: never;
}
type EffectSQLiteD1RunResult = unknown;

declare class EffectSQLiteD1Session<TRelations> extends SQLiteEffectSession<...> {
  constructor(client: D1Client, dialect: SQLiteDialect, relations: TRelations, options: { logger: EffectLoggerShape; cache: EffectCacheShape });
  transaction<A, E, R>(transaction: (tx: EffectSQLiteD1Transaction<TRelations>) => Effect.Effect<A, E, R>): Effect.Effect<A, E | SqlError, R>;
}
```

Runtime (`effect-d1/session.js`): every query goes through `this.client.unsafe(query.sql, params)` and picks `.withoutTransform` (objects) / `.values` (arrays) / `.raw` (run). `transaction()` calls `this.client.withTransaction(...)`, which on D1 hits `Effect.die("transactions are not supported in D1")` (see §3).

**Every query builder is itself an Effect** (`QueryEffectKind<TEffectHKT, TSuccess> = Effect.Effect<TSuccess, TKind['error'] | TError, TKind['context'] | TContext>`), so:

```ts
const rows = yield* db.select().from(users);                              // Effect<Row[], EffectDrizzleQueryError, never>
const ins  = yield* db.insert(users).values({...}).returning();           // Effect<Row[], EffectDrizzleQueryError, never>
const rel  = yield* db.query.users.findMany({ with: { posts: true } }); // Effect<..., EffectDrizzleQueryError, never>
```

Error class (`drizzle-orm/effect-core/errors.d.ts`):
```ts
declare class EffectDrizzleQueryError extends Schema.Class<EffectDrizzleQueryError, Schema.TaggedStruct<"EffectDrizzleQueryError", {
  readonly query: Schema.String; readonly params: Schema.mutable<Schema.$Array<Schema.Any>>; readonly cause: Schema.Unknown;
}>, Cause.YieldableError> { get message(): string }
declare class EffectDrizzleError            /* _tag "EffectDrizzleError", { message, cause } */
declare class EffectTransactionRollbackError/* _tag "EffectTransactionRollbackError", message "Rollback" */
declare class MigratorInitError             /* _tag "MigratorInitError", { exitCode: "databaseMigrations" | "localMigrations" } */
```
Verified at runtime: on a UNIQUE violation the failure is `EffectDrizzleQueryError` whose `.cause` is a `Cause` containing `SqlError` with `reason: UniqueViolation` (`Cause([Fail(effect/sql/SqlError: ... UniqueViolation ...)])`). So mapping DB errors = match on `EffectDrizzleQueryError` and inspect `cause` (a `Cause<SqlError>`), not a bare `SqlError`.

### 2.4 `SQLiteEffectDatabase` methods (`sqlite-core/effect/db.d.ts`)

```ts
declare class SQLiteEffectDatabase<TEffectHKT, TRunResult, TRelations = EmptyRelations> {
  query: { [K in keyof TRelations]: RelationalQueryBuilder<unknown, TRelations, TRelations[K], SQLiteEffectRelationalQueryHKT<TEffectHKT>> };
  $with: WithBuilder;
  $count(source, filters?): SQLiteEffectCountBuilder<TEffectHKT>;
  $cache: { invalidate: EffectCacheShape['onMutate'] };
  with(...queries: WithSubquery[]): { select; selectDistinct; update; insert; delete };
  select(): SQLiteEffectSelectBuilder<undefined, TRunResult, TEffectHKT>;
  select<TSelection extends SelectedFields>(fields: TSelection): SQLiteEffectSelectBuilder<TSelection, TRunResult, TEffectHKT>;
  selectDistinct(...)
  update<TTable extends SQLiteTable>(table: TTable): SQLiteEffectUpdateBuilder<TTable, TRunResult, TEffectHKT>;
  insert<TTable extends SQLiteTable>(into: TTable): SQLiteEffectInsertBuilder<TTable, TRunResult, TEffectHKT>;
     // rc5 adds optional column list: insert(table, ...columns)
  delete<TTable extends SQLiteTable>(from: TTable): SQLiteEffectDeleteBase<TTable, TRunResult, undefined, false, never, TEffectHKT>;
  run(query: SQLWrapper | string): SQLiteEffectRaw<TRunResult, TEffectHKT>;
  all<T = unknown>(query: SQLWrapper | string): SQLiteEffectRaw<T[], TEffectHKT>;
  get<T = unknown>(query: SQLWrapper | string): SQLiteEffectRaw<T, TEffectHKT>;
  values<T extends unknown[] = unknown[]>(query: SQLWrapper | string): SQLiteEffectRaw<T[], TEffectHKT>;
  transaction<A, E, R>(transaction: (tx: SQLiteEffectTransaction<TEffectHKT, TRunResult, TRelations>) => Effect.Effect<A, E, R>, config?: SQLiteTransactionConfig): Effect.Effect<A, E | SqlError, R>;
     // rc5 drops the `config` param
}
// NO `batch` member.
```

`.returning()` — `SQLiteEffectInsertBase<..., TReturning, ...> extends QueryEffectKind<TEffectHKT, TReturning extends undefined ? TRunResult : TReturning[]>`; same for update/delete. Typed `.returning()` verified (`{ id: number; email: string }[]`).

`SQLiteEffectTransaction extends SQLiteEffectDatabase` and adds `rollback(): EffectTransactionRollbackError` (return `yield* tx.rollback()`-style; any failure inside the tx callback rolls back — verified with a `Schema.TaggedError`).

Relational query: `SQLiteEffectRelationalQuery<TResult, TEffectHKT> extends QueryEffectKind<TEffectHKT, TResult>` with `execute(placeholderValues?)`. Relations use the v1 API: `defineRelations(schema, (r) => ({ users: { posts: r.many.posts() }, posts: { user: r.one.users({ from: r.posts.userId, to: r.users.id }) } }))` from `drizzle-orm` (verified).

### 2.5 `drizzle-orm/effect-sqlite-node` (test layer)

```ts
import { SqliteClient } from "@effect/sql-sqlite-node/SqliteClient";
declare const make: <TRelations = EmptyRelations>(config?: EffectDrizzleSQLiteConfig<TRelations>)
  => Effect.Effect<EffectSQLiteNodeDatabase<TRelations> & { $client: SqliteClient }, never, EffectCache | EffectLogger | SqliteClient>;
declare const makeWithDefaults: <TRelations = EmptyRelations>(config?: EffectDrizzleSQLiteConfig<TRelations>)
  => Effect.Effect<EffectSQLiteNodeDatabase<TRelations> & { $client: SqliteClient }, never, SqliteClient>;
// effect-sqlite-node/migrator.d.ts
declare function migrate<TRelations>(db: EffectSQLiteNodeDatabase<TRelations>, config: MigrationConfig)
  : Effect.Effect<undefined, MigratorInitError | EffectDrizzleQueryError | SqlError, never>;
// MigrationConfig = { migrationsFolder: string; migrationsTable?: string; migrationsSchema?: string }
```
`migrate` reads the rc folder layout (`<folder>/<subdir>/migration.sql`) via `node:fs` — Node-only; not usable in Workers. The D1 Effect flavour has no migrator; the promise flavour `drizzle-orm/d1/migrator` has `migrate(db: DrizzleD1Database, config): Promise<void | MigratorInitFailResponse>` (also uses `node:fs` via `readMigrationFiles`, so not Worker-runtime either).

### 2.6 `drizzle-orm/effect-schema`
`createSelectSchema(table)`, `createInsertSchema(table)`, `createUpdateSchema(table)` → effect `Schema` structs derived from a drizzle table (plus `jsonSchema`, `bufferSchema`, `literalSchema`, `bigintStringModeSchema`, `unsignedBigintStringModeSchema`).

---

## 3. `@effect/sql-d1` and `@effect/sql-sqlite-node`

Package exports: `"."` → `dist/index.js`, `"./*"` → `dist/*.js`. So import `@effect/sql-d1/D1Client` or `import { D1Client } from "@effect/sql-d1"`.

### 3.1 `@effect/sql-d1/D1Client` (dist/D1Client.d.ts)

Header comment: "Transactions, streaming queries, and `updateValues` are not supported by this driver."

```ts
import type { D1Database } from "@cloudflare/workers-types";
import * as Client from "effect/unstable/sql/SqlClient";
import { SqlError } from "effect/unstable/sql/SqlError";
import * as Statement from "effect/unstable/sql/Statement";

export interface D1Client extends Client.SqlClient {
  readonly [TypeId]: "~@effect/sql-d1/D1Client";
  readonly config: D1ClientConfig;
  /** Executes SQL statements as a single atomic D1 batch and returns their row results in order. */
  readonly batch: <const Statements extends ReadonlyArray<Statement.Statement<any>>>(statements: Statements)
    => Effect.Effect<{ readonly [K in keyof Statements]: Effect.Success<Statements[K]> }, SqlError>;
  /** Not supported in d1 */
  readonly updateValues: never;
}
export declare const D1Client: Context.Service<D1Client, D1Client>;

export interface D1ClientConfig {
  readonly db: D1Database;
  readonly prepareCacheSize?: number | undefined;          // default 200
  readonly prepareCacheTTL?: Duration.Input | undefined;   // default 10 minutes
  readonly spanAttributes?: Record<string, unknown> | undefined;
  readonly transformResultNames?: ((str: string) => string) | undefined;
  readonly transformQueryNames?: ((str: string) => string) | undefined;
}
export declare const make: (options: D1ClientConfig) => Effect.Effect<D1Client, never, Scope.Scope | Reactivity.Reactivity>;
export declare const layerConfig: (config: Config.Wrap<D1ClientConfig>) => Layer.Layer<D1Client | Client.SqlClient, Config.ConfigError>;
export declare const layer: (config: D1ClientConfig) => Layer.Layer<D1Client | Client.SqlClient, Config.ConfigError>;
```
Both layers provide **both** `D1Client` and the generic `SqlClient`. `layer` needs the live `D1Database` binding (i.e. built per-request/per-env in a Worker: `D1Client.layer({ db: env.DB })`).

Transactions (src/D1Client.ts:317): `const transactionAcquirer = Effect.die("transactions are not supported in D1")` — so `SqlClient.withTransaction` / drizzle `db.transaction` on D1 = **defect**. Batch comment (line 168): "D1 batches execute on the binding directly and intentionally cannot participate in SqlClient transactions."

### 3.2 `@effect/sql-sqlite-node/SqliteClient`

```ts
export interface SqliteClientConfig {
  readonly filename: string;                 // ":memory:" works (verified)
  readonly readonly?: boolean | undefined;
  readonly prepareCacheSize?: number | undefined;
  readonly prepareCacheTTL?: Duration.Input | undefined;
  readonly disableWAL?: boolean | undefined;
  readonly busyTimeout?: Duration.Input | undefined;   // default 5s
  readonly spanAttributes?: Record<string, unknown> | undefined;
  readonly transformResultNames?: ((str: string) => string) | undefined;
  readonly transformQueryNames?: ((str: string) => string) | undefined;
}
export interface SqliteClient extends Client.SqlClient { readonly config; readonly backup(destination: string): Effect<BackupMetadata, SqlError>; readonly loadExtension(path: string): Effect<void, SqlError>; readonly updateValues: never }
export declare const make: (options: SqliteClientConfig) => Effect.Effect<SqliteClient, never, Scope.Scope | Reactivity.Reactivity>;
export declare const layerConfig: (config: Config.Wrap<SqliteClientConfig>) => Layer.Layer<SqliteClient | Client.SqlClient, Config.ConfigError>;
export declare const layer: (config: SqliteClientConfig) => Layer.Layer<SqliteClient | Client.SqlClient>;
```
Test layer: `SqliteClient.layer({ filename: ":memory:" })`. **Gotcha**: each `layer(...)` call is a separate DB; share one layer instance via `Layer.provideMerge(drizzleLayer, sharedSqliteLayer)` (or a `MemoMap`) if raw `SqlClient` and drizzle must see the same memory DB (verified).

### 3.3 `effect/unstable/sql/SqlClient`

```ts
export interface SqlClient extends Constructor {
  readonly safe: this;
  readonly withoutTransforms: () => this;
  readonly reserve: Effect.Effect<Connection.Connection, SqlError, Scope.Scope>;
  readonly withTransaction: <R, E, A>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | SqlError, R>;
  readonly transactionService: Context.Service<TransactionConnection, TransactionConnection.Service>;
  readonly reactive: <A, E, R>(keys, effect: Effect<A, E, R>) => Stream.Stream<A, E, R>;
  readonly reactiveMailbox: ...;
}
export declare const SqlClient: Context.Service<SqlClient, SqlClient>;
export declare const make: (options: SqlClient.MakeOptions) => Effect.Effect<SqlClient, never, Reactivity>;
```
`Constructor` gives the tagged template (`sql\`SELECT ...\``) plus `sql.unsafe(query, params)` returning a `Statement` with `.values`, `.raw`, `.withoutTransform`, `.stream`, etc.

---

## 4. `effect/unstable/sql` and `effect/unstable/schema`

`effect/unstable/sql/index.d.ts` exports namespaces: `Migrator, SqlClient, SqlConnection, SqlError, SqlModel, SqlResolver, SqlSchema, SqlStream, Statement`.
`effect/unstable/schema/index.d.ts` exports: `Model, VariantSchema`.

### 4.1 `SqlError` (`effect/unstable/sql/SqlError`)
```ts
declare const SqlError_base: Schema.Class<SqlError, Schema.TaggedStruct<"SqlError", {
  readonly reason: Schema.Union<[typeof ConnectionError, typeof AuthenticationError, typeof AuthorizationError, typeof SqlSyntaxError,
    typeof UniqueViolation, typeof ConstraintError, typeof DeadlockError, typeof SerializationError, typeof LockTimeoutError,
    typeof StatementTimeoutError, typeof UnknownError]>;
}>, Cause.YieldableError>;
export declare class SqlError extends SqlError_base { readonly cause: <one of the reason classes> }
export declare const isSqlError: (u: unknown) => u is SqlError;
export declare const classifySqliteError: (cause: unknown, opts?) => SqlErrorReason;
export declare class ResultLengthMismatch ...
```
Reason classes are exported individually (`UniqueViolation`, `ConstraintError`, ...), each a tagged schema class.

### 4.2 `SqlSchema` — `findAll`, `findNonEmpty`, `findOne`, `findOneOption` (each `(options: { Request, Result, execute }) => (req) => Effect`).
### 4.3 `SqlResolver` — `request`, `SqlRequest`, `ordered`, `grouped`, `findById`.
### 4.4 `SqlModel` — `makeRepository(Model, { tableName, idColumn, spanPrefix?, softDeleteColumn? })`, `makeResolvers(...)` (requires `SqlClient`).

### 4.5 `Model` (`import { Model } from "effect/unstable/schema"`)

Exported: `Class, Struct, Union, Field, FieldOnly, FieldExcept, fieldEvolve, extract, fields, Override, GeneratedByDb, GeneratedByApp, Sensitive, optionalOption, FieldOption, BooleanSqlite, Date, DateWithNow, DateTimeWithNow, DateTimeFromDateWithNow, DateTimeFromNumberWithNow, DateTimeInsert, DateTimeInsertFromDate, DateTimeInsertFromNumber, DateTimeUpdate, DateTimeUpdateFromDate, DateTimeUpdateFromNumber, JsonFromString, Uint8Array, UuidV4BytesInsert, UuidV4BytesWithGenerate, UuidV4Insert, UuidV4WithGenerate, UuidV7Insert, UuidV7WithGenerate`.
Variants: `VariantsDatabase = "select" | "insert" | "update"`, `VariantsJson = "json" | "jsonCreate" | "jsonUpdate"`.

JSDoc on `Class` (quoted):
```ts
import { Schema } from "effect"
import { Model } from "effect/unstable/schema"

export const GroupId = Schema.Number.pipe(Schema.brand("GroupId"))

export class Group extends Model.Class<Group>("Group")({
  id: Model.GeneratedByDb(GroupId),
  name: Schema.String,
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate
}) {}

// schema used for selects
Group
// schema used for inserts
Group.insert
// schema used for updates
Group.update
// schema used for json api
Group.json
Group.jsonCreate
Group.jsonUpdate

// you can also turn them into classes
class GroupJson extends Schema.Class<GroupJson>("GroupJson")(Group.json) {
  get upperName() { return this.name.toUpperCase() }
}
```
- `GeneratedByDb(schema)`: present in `select` and `json` only.
- `GeneratedByApp(schema)`: present in `select`, `insert`, `update`, `json`; omitted from `jsonCreate`/`jsonUpdate`.
- `Sensitive(schema)`: database variants only, omitted from all JSON variants.
- `DateTimeInsert`: `{ select: Schema.DateTimeUtcFromString; insert: Overrideable<DateTimeUtcFromString>; json: DateTimeUtcFromString }` (defaults to now on insert, omitted from update). `DateTimeUpdate` likewise but also set on update. `*FromDate` / `*FromNumber` variants store JS `Date` / millis.
- `UuidV4Insert(brandedStringSchema)` / `UuidV7Insert(...)`: generated on insert (`Schema.brand<Schema.String, B>` required).

---

## 5. Effect 4 core idioms (from `effect/dist/*.d.ts`)

### 5.1 `Context.Service` (replaces `Context.Tag`)
```ts
export declare const Service: {
  // function-style key
  <Identifier, Shape = Identifier>(key: string, options?: {} | undefined): Service<Identifier, Shape>;
  // class-style key
  <Self, Shape>(): <const Identifier extends string, E, R = Types.unassigned, Args extends ReadonlyArray<any> = never>(id: Identifier, options?: {
    readonly make?: ((...args: Args) => Effect<Shape, E, R>) | Effect<Shape, E, R> | undefined;
  } | undefined) => ServiceClass<Self, Identifier, Shape> & ([Types.unassigned] extends [R] ? unknown : {
    readonly make: [Args] extends [never] ? Effect<Shape, E, R> : (...args: Args) => Effect<Shape, E, R>;
  });
};
export interface Service<Identifier, Shape> extends Key<Identifier, Shape> {
  of(this: void, self: Shape): Shape;
  use<A, E, R>(f: (service: Shape) => Effect<A, E, R>): Effect<A, E, R | Identifier>;
  useSync<A>(f: (service: Shape) => A): Effect<A, never, Identifier>;
  new (_: never): ServiceClass.Shape<Identifier, Shape>;
  readonly key: Identifier;
}
```
JSDoc example:
```ts
import { Context } from "effect"
const Database = Context.Service<{ query: (sql: string) => string }>("Database")
class Config extends Context.Service<Config, { port: number }>()("Config") {}
```
A service class is yieldable: `const db = yield* Db`. Drizzle-style: `class Db extends Context.Service<Db, Effect.Success<ReturnType<typeof SqliteDrizzle.makeWithDefaults<typeof relations>>>>()("Db") {}` (verified compiles).

### 5.2 `Layer`
```ts
// Layer.effect – curried by service key
<I, S>(service: Context.Key<I, S>): <E, R>(effect: Effect<S, E, R>) => Layer<I, E, Exclude<R, Scope.Scope>>;
// Layer.succeed
<I, S>(service: Context.Key<I, S>): (resource: S) => Layer<I>;
export declare const mergeAll: <Layers extends [Layer<never, any, any>, ...]>(...layers) => Layer<Success<...>, Error<...>, Services<...>>;
export declare const unwrap: <A, E1, R1, E, R>(self: Effect<Layer<A, E1, R1>, E, R>) => Layer<A, E | E1, R1 | Exclude<R, Scope.Scope>>;
export declare const provide / provideMerge (dual)
```
JSDoc example: `const layer = Layer.effect(Database, Effect.sync(() => ({ query: ... })))` — note **data-first two-arg form also works** (`Layer.effect(Database, effect)` in the doc; curried `Layer.effect(Db)(effect)` verified).

### 5.3 `ManagedRuntime`
```ts
export declare const make: <R, ER>(layer: Layer.Layer<R, ER, never>, options?: { readonly memoMap?: Layer.MemoMap | undefined } | undefined) => ManagedRuntime<R, ER>;
// members: runFork, runSync, runPromise(effect, options?), runPromiseExit, dispose(): Promise<void>, disposeEffect
```

### 5.4 `Schema`
```ts
// Schema.Class
<Self = never, Brand = {}>(identifier: string): <S extends Struct<Struct.Fields>>(schema: S, annotations?) => Class<Self, S, Brand>;
//   usage: class Person extends Schema.Class<Person>("Person")({ name: Schema.String, age: Schema.Number }) {}
// Schema.TaggedError  (exact name; `TaggedErrorClass` no longer exists)
<Self = never, Brand = {}>(identifier?: string): <Tag extends string, const Fields extends Struct.Fields>(tag: Tag, fields: Fields, annotations?) => Class<Self, TaggedStruct<Tag, Fields>, Cause.YieldableError & Brand>;
//   usage: class NotFound extends Schema.TaggedError<NotFound>()("NotFound", { id: Schema.Number }) {}   (verified; yield* new NotFound({id}) fails the effect)
// Also exported: Schema.Error, Schema.TaggedClass, Schema.TaggedStruct(tag, fields)
export declare function brand<B extends string>(identifier: B): <S extends ConstraintRebuildable>(schema: S) => brand<S["Rebuild"], B>;
//   usage: Schema.String.pipe(Schema.brand("UserId"))
export declare function toStandardSchemaV1<S extends ConstraintDecoder<unknown>>(self: S, options?: {
  readonly leafHook?; readonly checkHook?; readonly parseOptions?;
}): StandardSchemaV1<S["Encoded"], S["Type"]> & S;
export declare function withConstructorDefault<S>(defaultValue: Effect<S["~type.make.in"], SchemaIssue.Issue>): (schema: S) => withConstructorDefault<S>;
export declare function Opaque<Self, Brand = {}>(): <S extends Top>(schema: S) => Opaque<Self, S, Brand> & Omit<S, keyof Top>;
```

### 5.5 `Effect` result helpers
`Effect.result(self): Effect<Result.Result<A, E>, never, R>` (tags `"Success"` / `"Failure"`, fields `.success` / `.failure`); `Effect.exit`; `Effect.catchTag`, `Effect.catchTags`, `Effect.catchReason`, `Effect.sandbox`. `Effect.either` does not exist.

---

## 6. `effect/unstable/httpapi` and `effect/unstable/http`

`effect/unstable/httpapi/index.d.ts` namespaces: `HttpApi, HttpApiBuilder, HttpApiClient, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiMiddleware, HttpApiScalar, HttpApiSchema, HttpApiSecurity, HttpApiSwagger, HttpApiTest, OpenApi`.

### 6.1 Definition
```ts
// HttpApi
export declare const make: <const Id extends string>(identifier: Id) => HttpApi<Id, never>;
//   methods: add(...groups), addHttpApi(api), prefix(prefix), middleware(key), annotate(key, value)
// HttpApiGroup
export declare const make: <const Id extends string, const TopLevel extends boolean = false>(identifier: Id, options?: { readonly topLevel?: TopLevel }) => HttpApiGroup<Id, never, TopLevel>;
//   methods: add(...endpoints), prefix(prefix), middleware(key), annotate(key, value)
// HttpApiEndpoint: make(method)(identifier, path, options?), get, post, put, patch, del
<const Identifier extends string, const Path extends HttpRouter.PathInput, Params, Query, Payload, Headers, const Success = HttpApiSchema.NoContent, const Error = never>
  (identifier: Identifier, path: Path, options?: {
    readonly params?: Params; readonly query?: Query; readonly headers?: Headers; readonly payload?: Payload;
    readonly success?: Success; readonly error?: Error;   // (+ a `disableCodecs: true` overload)
  }) => HttpApiEndpoint<Identifier, "GET", Path, ...>;
//   endpoint methods: prefix, middleware(key), annotate(key, value)
// HttpApiSchema: status, Empty, NoContent, Created, Accepted, asNoContent, StreamSse, StreamUint8Array, WithHeaders/withHeaders, asMultipart, asMultipartStream, asJson, asFormUrlEncoded, asText, asUint8Array, isNoContent
// HttpApiSecurity: http, bearer, apiKey, basic, annotate, annotateMerge
// HttpApiError: BadRequest, Unauthorized, Forbidden, NotFound, MethodNotAllowed, NotAcceptable, RequestTimeout, Conflict, Gone, UnprocessableEntity, InternalServerError, NotImplemented, ServiceUnavailable, HttpApiSchemaError
// HttpApiMiddleware
export declare const Service: <Self, Config extends { requires?: any; provides?: any; clientError?: any } = {...never}>() =>
  <const Id extends string, const Error extends ErrorConstraint = never, const Security extends Record<string, HttpApiSecurity.HttpApiSecurity> = never, RequiredForClient extends boolean = false>
  (id: Id, options?: { readonly error?: Error; readonly security?: Security; readonly requiredForClient?: RequiredForClient }) => ServiceClass<Self, Id, {...}>;
//   also: isSecurity, layerSchemaErrorTransform, layerClient
// OpenApi.fromApi(api, options?) => OpenAPISpec ; OpenApi.annotations({...}); OpenApi.Exclude
// HttpApiScalar.layer(api, options?) / layerCdn(api, options?)
```

### 6.2 Implementation (`HttpApiBuilder`)
```ts
export declare const layer: <Id extends string, Groups extends HttpApiGroup.Constraint>(api: HttpApi.HttpApi<Id, Groups>, options?: {
  readonly openapiPath?: `/${string}` | undefined;
}) => Layer.Layer<never, never, Etag.Generator | HttpRouter.HttpRouter | FileSystem | HttpPlatform | Path | HttpApiGroup.ToService<Id, Groups>>;
export declare const group: <ApiId, Groups, const Identifier extends HttpApiGroup.Identifier<Groups>, Return>(
  api: HttpApi.HttpApi<ApiId, Groups>, groupIdentifier: Identifier,
  build: (handlers: Handlers.FromGroup<...>) => Handlers.ValidateReturn<Return>
) => Layer.Layer<HttpApiGroup.Service<ApiId, Identifier>, Handlers.Error<Return>, Exclude<Handlers.Context<Return>, Scope.Scope>>;
export declare const endpoint: (api, groupIdentifier, endpointIdentifier, handler) => EndpointReturn<...>;
export declare const securityDecode, securitySetCookie;
```
`handlers.handle(name, fn)` inside `group`'s build callback (and `handlers.handleAll({...})`).

**No `HttpApiBuilder.toWebHandler`.** `HttpApiBuilder.layer` requires `HttpRouter` (provided by `HttpRouter.toWebHandler`/`HttpRouter.layer`) and, type-wise, `Etag.Generator | FileSystem | HttpPlatform | Path`. Provide those with:
- `Etag.layer: Layer<Generator>` (`effect/unstable/http/Etag`)
- `HttpPlatform.layer: Layer<HttpPlatform, never, FileSystem>` (`effect/unstable/http/HttpPlatform`)
- `FileSystem.layerNoop(partial): Layer<FileSystem>` (`effect/FileSystem`) — for Workers
- `Path.layer: Layer<Path>` (`effect/Path`)

### 6.3 Web handler (`effect/unstable/http/HttpRouter`)
```ts
export declare const toWebHandler: <A, E, R extends HttpRouter | Request<"Requires", any> | Request<"GlobalRequires", any> | Request<"Error", any> | Request<"GlobalError", any>, HE, HR = ..., ReqR = Exclude<HR, A | Scope.Scope | HttpServerRequest>>(
  appLayer: Layer.Layer<A, E, R>,
  options?: { readonly memoMap?: Layer.MemoMap; readonly routerConfig?: Partial<FindMyWay.RouterConfig>; readonly disableLogger?: boolean; readonly middleware?: (effect) => Effect<HttpServerResponse, HE, HR | GlobalProvided> }
) => {
  readonly handler: [ReqR] extends [never] ? ((request: globalThis.Request, context?: Context.Context<never>) => Promise<Response>)
                                            : ((request: globalThis.Request, context: Context.Context<ReqR>) => Promise<Response>);
  readonly dispose: () => Promise<void>;
};
export declare const layer: Layer.Layer<HttpRouter>;
export declare const serve: (appLayer, options?) => Layer<...HttpServer...>;   // needs an HttpServer (Node/Bun)
export declare const toHttpEffect: (appLayer) => Effect<Effect<HttpServerResponse, ...>, ...>;
```
Runtime: `toWebHandler` = `HttpEffect.toWebHandlerLayerWith(Layer.provideMerge(appLayer, RouterLayer), { toHandler: s => Effect.succeed(Context.get(s, HttpRouter).asHttpEffect()), middleware, memoMap })`. `HttpMiddleware.logger` is applied unless `disableLogger: true`. Per-request context (e.g. the D1 binding) can be passed as the second `context` argument if the layer leaves a `Request<"Requires", X>` unsatisfied.

Lower-level (`effect/unstable/http/HttpEffect`): `toWebHandler(self, middleware?)`, `toWebHandlerWith(context)(self, middleware?)`, `toWebHandlerLayer(self, layer, options?) => { handler, dispose }`, `toWebHandlerLayerWith(layer, { toHandler, middleware?, memoMap? })`.

### 6.4 Custom `HttpClient` (in-process transport)
```ts
// effect/unstable/http/HttpClient
export declare const HttpClient: Context.Service<HttpClient, HttpClient>;
/** Constructs an `HttpClient` from a low-level request runner. The runner receives the request, resolved URL, abort signal, and current fiber. */
export declare const make: (f: (request: HttpClientRequest.HttpClientRequest, url: URL, signal: AbortSignal,
  fiber: Fiber.Fiber<HttpClientResponse.HttpClientResponse, Error.HttpClientError>) => Effect.Effect<HttpClientResponse.HttpClientResponse, Error.HttpClientError>) => HttpClient;
export declare const makeWith: <E2, R2, E, R>(postprocess: (request: Effect<HttpClientRequest, E2, R2>) => Effect<HttpClientResponse, E, R>, preprocess: HttpClient.Preprocess<E2, R2>) => HttpClient.With<E, R>;
export declare const execute: (request: HttpClientRequest) => Effect<HttpClientResponse, HttpClientError, HttpClient>;
// effect/unstable/http/HttpClientRequest
export declare const toWeb: (self: HttpClientRequest, options?: { readonly signal?: AbortSignal }) => Effect.Effect<Request, Url.UrlError>;
export declare const fromWeb: (request: globalThis.Request) => HttpClientRequest;
// effect/unstable/http/HttpClientResponse
export declare const fromWeb: (request: HttpClientRequest.HttpClientRequest, source: Response) => HttpClientResponse;
```
In-process transport recipe: `HttpClient.make((req, url, signal) => HttpClientRequest.toWeb(req, { signal }).pipe(Effect.flatMap(webReq => Effect.promise(() => handler(webReq))), Effect.map(res => HttpClientResponse.fromWeb(req, res)), Effect.mapError(...→HttpClientError)))`.

`HttpApiClient.make(api, options?: { transformClient?, transformResponse?, baseUrl? }) => Effect<Client<Groups>, never, HttpClient | HttpApiGroup.MiddlewareClient<Groups>>` — provide the custom client via `Layer.succeed(HttpClient)(myClient)`. Also `HttpApiClient.makeWith(api, { httpClient, ... })`, `.group`, `.endpoint`.

---

## 7. drizzle-kit 1.0.0-rc.4 config + migration layout

`import { defineConfig } from "drizzle-kit"` — `declare function defineConfig(config: Config): Config`.

```ts
type Config = {
  dialect: Dialect;   // "postgresql" | "mysql" | "sqlite" | "turso" | "singlestore" | "mssql" | "cockroach" | "duckdb"
  out?: string; breakpoints?: boolean; tablesFilter?; extensionsFilters?; schemaFilter?; schema?: string | string[];
  verbose?: boolean; strict?: boolean; migrations?: { table?: string; schema?: string }; introspect?: { casing: 'camel' | 'preserve' }; entities?: {...};
} & ( ...
  | { dialect: 'sqlite'; dbCredentials: { url: string } }
  | { dialect: 'sqlite'; driver: 'd1-http'; dbCredentials: { accountId: string; databaseId: string; token: string } }
  | { dialect: 'sqlite'; driver: 'expo' } | { dialect: 'sqlite'; driver: 'durable-sqlite' } | { dialect: 'sqlite'; driver: 'sqlite-cloud' }
  | {} ... );
// Driver = "d1-http" | "expo" | "aws-data-api" | "pglite" | "durable-sqlite" | "sqlite-cloud"
```

Verified run (`kit-test/drizzle.config.ts`, `dialect: "sqlite", driver: "d1-http"`):
```
$ npx drizzle-kit generate --output json --config kit-test/drizzle.config.ts
{"status":"ok","dialect":"sqlite","migration_path":"kit-test/migrations/20260903023630_curly_bloodscream/migration.sql"}
kit-test/migrations/20260903023630_curly_bloodscream/migration.sql
kit-test/migrations/20260903023630_curly_bloodscream/snapshot.json
```
- **Layout: one folder per migration `<YYYYMMDDHHmmss>_<slug>/{migration.sql,snapshot.json}`; no `meta/_journal.json`.** (`--output json` is the non-interactive agent/CI mode; `--explain` dry-runs.)
- `drizzle-orm/migrator.js` `readMigrationFiles` reads exactly this layout and **throws** `"We detected that you have old drizzle-kit migration folders. You must upgrade drizzle-kit and run \"drizzle-kit up\""` if `meta/_journal.json` exists. Statements split on `--> statement-breakpoint`.
- `wrangler d1 migrations apply` expects flat `<migrations_dir>/NNNN_name.sql`, so **a flatten/copy step is needed** (e.g. `for d in drizzle/*/; do cp "$d/migration.sql" "migrations/$(basename $d).sql"; done`, keeping `--> statement-breakpoint` lines — wrangler splits on `;` so those comment lines are harmless), or run migrations through drizzle's D1 migrator outside the Worker runtime.
- drizzle-kit dist-tags: `rc` = 1.0.0-rc.4, `rc5` = 1.0.0-rc.5-ab785fc, `latest` = 0.31.10 (old line).
- The bundled docs in `node_modules/drizzle-kit/skills/*/SKILL.md` (drizzle, drizzle-generate, drizzle-push, drizzle-migrations, drizzle-hints, drizzle-output-modes, drizzle-pull, drizzle-responses-and-errors) are the authoritative rc docs; sqlite notes: most ALTERs become table rebuilds and `add_not_null` needs an explicit hint.

---

## 8. Verified wiring (from the smoke test, drizzle-orm rc5 + effect rc.112)

```ts
import { Effect, Layer, Context, ManagedRuntime, Schema } from "effect";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import * as SqliteDrizzle from "drizzle-orm/effect-sqlite-node";
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { defineRelations, eq } from "drizzle-orm";

class Db extends Context.Service<Db, Effect.Success<ReturnType<typeof SqliteDrizzle.makeWithDefaults<typeof relations>>>>()("Db") {}
const Shared = SqliteClient.layer({ filename: ":memory:" });
const rt = ManagedRuntime.make(Layer.provideMerge(Layer.effect(Db)(SqliteDrizzle.makeWithDefaults({ relations })), Shared));
// D1 equivalent: Layer.effect(Db)(D1Drizzle.makeWithDefaults({ relations })) provided with D1Client.layer({ db: env.DB })
```
Results: `insert().returning()` → `[{id:1,email:"a@b.c"}]`; `db.query.users.findMany({ with: { posts: true } })` → nested rows; `db.transaction` failing with a `Schema.TaggedError` rolled back (row count unchanged); duplicate insert → `EffectDrizzleQueryError` with `cause: Cause<SqlError{reason: UniqueViolation}>`; `tsc --strict` clean.
