/**
 * `Database.layerTest`: the service over an in-memory sqlite-node database
 * with the flattened migrations applied, for Node test suites. Lives in its
 * own module because `node:sqlite` and `node:fs` cannot enter the Worker
 * bundle.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import * as SqliteDrizzle from "drizzle-orm/effect-sqlite-node";
import { Effect, Layer } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import type { SqlClient } from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";

import { Database, makeDatabase } from "./database";
import { relations } from "./relations";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

/** Statements from every `migrations/*.sql`, in file order. */
export const readMigrationStatements = (): ReadonlyArray<string> =>
  readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .flatMap((name) =>
      readFileSync(join(migrationsDir, name), "utf8")
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0),
    );

const applyMigrations = (sql: SqlClient): Effect.Effect<void, SqlError> =>
  Effect.forEach(
    readMigrationStatements(),
    (statement) => sql.unsafe(statement),
    {
      discard: true,
    },
  );

export const layerTest: Layer.Layer<Database> = Layer.effect(Database)(
  Effect.gen(function* () {
    const client = yield* SqliteClient.make({ filename: ":memory:" });
    yield* applyMigrations(client).pipe(Effect.orDie);
    const db = yield* SqliteDrizzle.makeWithDefaults({ relations }).pipe(
      Effect.provideService(SqliteClient.SqliteClient, client),
    );
    return makeDatabase({
      db,
      sql: client,
      // The only transaction in the package: sqlite-node has no `batch`, so
      // D1's all-or-nothing semantics are emulated here and nowhere else.
      runBatch: (statements) =>
        client.withTransaction(
          Effect.forEach(statements, (statement) => statement),
        ),
      plain: () => {
        throw new Error(
          "Database.plain is unavailable on the sqlite-node test layer; use the D1 layer under vitest-pool-workers.",
        );
      },
    });
  }),
).pipe(Layer.provide(Reactivity.layer));
