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
import { resetSql, seedSql } from "../seed";
import { layerTest } from "../testing";

// Path strings, not URL objects: the Workers `URL` global collides with Node's `URL` type here.
const seedDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../seed");
const committed = resolve(seedDir, "seed.sql");
const committedReset = resolve(seedDir, "reset.sql");

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

it("seed/reset.sql matches resetSql() byte-for-byte", () => {
  expect(readFileSync(committedReset, "utf8")).toBe(resetSql());
});

it("reset deletes every table, children before parents", () => {
  const order = resetSql()
    .split("\n")
    .filter((line) => line.startsWith("delete from"))
    .map((line) => line.slice('delete from "'.length, -2));
  // Every table the schema suite expects, and no more.
  expect(order).toHaveLength(new Set(order).size);
  expect(order).toContain("rate_limit_window");
  // A child is always deleted before the table it references.
  for (const [child, parent] of [
    ["session", "user"],
    ["api_keys", "user"],
    ["workspace_membership", "workspace"],
    ["workspace", "user"],
    ["billing_plan_limit", "billing_plan"],
    ["workspace_usage_rollup", "usage_meter"],
    ["application_settings", "workspace"],
  ] as const) {
    expect(order.indexOf(child)).toBeLessThan(order.indexOf(parent));
  }
});
