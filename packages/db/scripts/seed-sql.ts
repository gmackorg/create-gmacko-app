/**
 * Writes `seed/seed.sql`: the seed from `src/seed.ts` rendered as literal SQL
 * for `wrangler d1 execute --file` (D1 is reachable only from a Worker or
 * wrangler, so the Effect program cannot run against it directly).
 *
 * Before writing, the seed is applied twice to an in-memory sqlite-node
 * database with the migrations on it, so a seed that no longer matches the
 * schema, or that stopped being idempotent, fails here rather than in D1.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect, ManagedRuntime } from "effect";

import { Database } from "../src/database";
import { seedLocal, seedSql } from "../src/seed";
import { layerTest } from "../src/testing";

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "seed",
  "seed.sql",
);

const runtime = ManagedRuntime.make(layerTest);
try {
  const { rendered, summary } = await runtime.runPromise(
    Effect.gen(function* () {
      const first = yield* seedLocal;
      const second = yield* seedLocal;
      if (first.statements !== second.statements) {
        return yield* Effect.die(new Error("seed is not idempotent"));
      }
      const { db } = yield* Database;
      return { rendered: seedSql(db), summary: first };
    }),
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, rendered);
  // oxlint-disable-next-line no-console -- build script output
  console.log(
    `seed/seed.sql: ${summary.statements} statements (${summary.plans} plans, ${summary.limits} limits, ${summary.meters} meters, 1 settings row)`,
  );
} finally {
  await runtime.dispose();
}
