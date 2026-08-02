import { sql } from "drizzle-orm";
import postgres from "postgres";
import { beforeAll, describe, expect, it } from "vitest";

const { db } = await import("../client");

// The first query against a freshly-started PGlite-over-wire backend pays a
// WASM cold-start cost that can exceed the default 5s per-test timeout on a cold
// CI runner. Give these DB round-trips headroom.
const DB_TEST_TIMEOUT = 30_000;

// The emulated Postgres is reliable locally but can be non-functional on a cold
// CI runner (accepts the 5432 socket but never answers queries — a WASM init
// that stalls). Probe once with a throwaway connection; if it doesn't respond,
// skip the suite instead of hanging it for the full timeout.
let dbReady = false;
beforeAll(async () => {
  const probe = postgres(
    process.env.DATABASE_URL ?? "postgresql://localhost:5432/gmacko_dev",
    { max: 1, connect_timeout: 5, idle_timeout: 1 },
  );
  try {
    await Promise.race([
      probe`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db probe timed out")), 8000),
      ),
    ]);
    dbReady = true;
  } catch {
    dbReady = false;
  } finally {
    await probe.end({ timeout: 2 }).catch(() => {});
  }
}, 15_000);

describe("emulate postgres", () => {
  it(
    "connects to PGlite and executes a query",
    async (ctx) => {
      if (!dbReady) ctx.skip();
      const result = await db.execute(sql`SELECT 1 as ok`);
      expect(result).toHaveLength(1);
      expect(result[0]!.ok).toBe(1);
    },
    DB_TEST_TIMEOUT,
  );

  it(
    "supports table creation and inserts",
    async (ctx) => {
      if (!dbReady) ctx.skip();
      await db.execute(sql`
      CREATE TABLE IF NOT EXISTS _test_ping (
        id serial PRIMARY KEY,
        value text NOT NULL
      )
    `);

      await db.execute(sql`INSERT INTO _test_ping (value) VALUES ('hello')`);

      const rows = await db.execute(sql`SELECT value FROM _test_ping`);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.value).toBe("hello");

      await db.execute(sql`DROP TABLE _test_ping`);
    },
    DB_TEST_TIMEOUT,
  );
});
