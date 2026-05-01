import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const { db } = await import("../client");

describe("emulate postgres", () => {
  it("connects to PGlite and executes a query", async () => {
    const result = await db.execute(sql`SELECT 1 as ok`);
    expect(result).toHaveLength(1);
    expect(result[0]!.ok).toBe(1);
  });

  it("supports table creation and inserts", async () => {
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
  });
});
