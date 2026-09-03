/**
 * `seed/seed.sql` is committed output of `pnpm seed:sql`; `pnpm db:seed`
 * applies it to the local D1 and the RUNBOOK applies it remotely. This pins
 * the file to `seedSql(...)` byte-for-byte so an edit to `src/seed.ts` cannot
 * ship without regenerating it (Node-only: it reads the file from disk).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect, ManagedRuntime } from "effect";
import { expect, it } from "vitest";

import { Database } from "../database";
import { seedSql } from "../seed";
import { layerTest } from "../testing";

// Path strings, not URL objects: the Workers `URL` global collides with Node's `URL` type here.
const committed = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../seed/seed.sql",
);

it("seed/seed.sql matches seedSql(...) byte-for-byte", async () => {
  const runtime = ManagedRuntime.make(layerTest);
  try {
    const rendered = await runtime.runPromise(
      Effect.map(Database, ({ db }) => seedSql(db)),
    );
    expect(readFileSync(committed, "utf8")).toBe(rendered);
  } finally {
    await runtime.dispose();
  }
});
