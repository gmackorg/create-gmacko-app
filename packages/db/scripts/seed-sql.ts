/**
 * Writes `seed/seed.sql` and `seed/reset.sql`: the seed from `src/seed.ts`
 * rendered as literal SQL for `wrangler d1 execute --file` (D1 is reachable
 * only from a Worker or wrangler, so the Effect program cannot run against it
 * directly), and the delete-everything companion that resets the shared
 * preview database.
 *
 * Before writing, both are exercised against an in-memory sqlite-node
 * database with the migrations on it: the seed is applied twice (a seed that
 * no longer matches the schema, or that stopped being idempotent, fails here
 * rather than in D1), then the reset is applied and every table checked
 * empty, then the seed once more.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect, ManagedRuntime } from "effect";

import { Database } from "../src/database";
import { resetSql, seedLocal, seedSql } from "../src/seed";
import { layerTest } from "../src/testing";

const seedDir = join(dirname(fileURLToPath(import.meta.url)), "..", "seed");
const out = join(seedDir, "seed.sql");
const resetOut = join(seedDir, "reset.sql");

const runtime = ManagedRuntime.make(layerTest);
try {
  const { rendered, reset, summary, tables } = await runtime.runPromise(
    Effect.gen(function* () {
      const first = yield* seedLocal;
      const second = yield* seedLocal;
      if (first.statements !== second.statements) {
        return yield* Effect.die(new Error("seed is not idempotent"));
      }
      const { db, sql } = yield* Database;
      const rendered = seedSql(db);
      const reset = resetSql();
      const statements = reset
        .split("\n")
        .filter((line) => line.startsWith("delete from"));
      for (const statement of statements) {
        yield* Effect.mapError(
          sql.unsafe(statement),
          (cause) =>
            new Error(`reset statement failed: ${statement}`, { cause }),
        );
      }
      for (const statement of statements) {
        const table = statement.slice('delete from "'.length, -2);
        const rows = yield* sql<{
          n: number;
        }>`select count(*) as n from ${sql.unsafe(`"${table}"`)}`;
        if (rows[0]?.n !== 0) {
          return yield* Effect.die(
            new Error(`reset left ${rows[0]?.n} row(s) in "${table}"`),
          );
        }
      }
      yield* seedLocal;
      return {
        rendered,
        reset,
        summary: first,
        tables: statements.length,
      };
    }),
  );
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(out, rendered);
  writeFileSync(resetOut, reset);
  // oxlint-disable-next-line no-console -- build script output
  console.log(
    `seed/seed.sql: ${summary.statements} statements (${summary.plans} plans, ${summary.limits} limits, ${summary.meters} meters, 1 settings row)`,
  );
  // oxlint-disable-next-line no-console -- build script output
  console.log(`seed/reset.sql: ${tables} tables emptied, children first`);
} finally {
  await runtime.dispose();
}
