/**
 * The Postgres → D1 recipe, end to end: run `scripts/pg-to-d1.mjs` over a
 * legacy `pg_dump --column-inserts` fixture, then apply what it produced to a
 * real sqlite database with the D1 migrations on it (`Database.layerTest`)
 * and read the rows back.
 *
 * The script is driven as a subprocess, the way an operator runs it, so the
 * CLI (argument handling, stderr report, exit code) is covered too and the
 * `.mjs` never has to be imported from TypeScript.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import { Effect, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Database } from "../database";
import { apiKeys, Post, user, userPreferences, workspace } from "../schema";
import { layerTest } from "../testing";

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, "../../../../scripts/pg-to-d1.mjs");
const fixture = join(here, "fixtures/legacy-pg-dump.sql");

const ADA = "e0f1a2b3-c4d5-4e6f-8a9b-0c1d2e3f4a5b";

/**
 * Statements from the generated file, split on a `;` outside a string
 * literal — the way `wrangler d1 execute --file` reads it. Splitting on
 * newlines would not do: a `text` value may contain one (and this fixture's
 * does), and SQLite string literals have no newline escape.
 */
const splitStatements = (sql: string): ReadonlyArray<string> => {
  const statements: Array<string> = [];
  let quoted = false;
  let start = 0;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (quoted) {
      if (char === "'") {
        if (sql[i + 1] === "'") i += 1;
        else quoted = false;
      }
      continue;
    }
    if (char === "'") quoted = true;
    else if (char === "-" && sql[i + 1] === "-") {
      const eol = sql.indexOf("\n", i);
      // Drop the comment line, keeping whatever preceded it on this statement.
      const before = sql.slice(start, i);
      start = eol === -1 ? sql.length : eol + 1;
      i = start - 1;
      if (before.trim().length > 0) statements.push(before.trim());
    } else if (char === ";") {
      statements.push(sql.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  return statements.filter((statement) => statement.startsWith("insert"));
};

let runtime: ManagedRuntime.ManagedRuntime<Database, never>;
let converted: string;
let stderr: string;
let tmp: string;

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "pg-to-d1-"));
  const out = join(tmp, "data.sql");
  const result = spawnSync(
    process.execPath,
    [script, "--dump", fixture, "--out", out],
    { encoding: "utf8" },
  );
  stderr = result.stderr;
  expect(result.status, result.stderr).toBe(0);
  converted = readFileSync(out, "utf8");

  runtime = ManagedRuntime.make(layerTest);
  const statements = splitStatements(converted);
  await runtime.runPromise(
    Effect.flatMap(Database, ({ sql }) =>
      Effect.forEach(statements, (statement) => sql.unsafe(statement), {
        discard: true,
      }),
    ),
  );
});

afterAll(async () => {
  await runtime?.dispose();
  rmSync(tmp, { recursive: true, force: true });
});

describe("the converted file", () => {
  it("emits parents before children, so foreign keys hold", () => {
    // `user` must be inserted before `workspace`, which references it, even
    // though the dump has workspace first.
    expect(converted.indexOf('into "user"')).toBeLessThan(
      converted.indexOf('into "workspace"'),
    );
    expect(converted.indexOf('into "user"')).toBeLessThan(
      converted.indexOf('into "api_keys"'),
    );
  });

  it("reports what it could not map instead of emitting it", () => {
    expect(stderr).toContain('skipped table "legacy_audit_log"');
    expect(stderr).toContain(
      'skipped column "user_preferences.legacyDigestHour"',
    );
    expect(converted).not.toContain("legacy_audit_log");
    expect(converted).not.toContain("legacy_digest_hour");
  });
});

describe("the rows in D1", () => {
  it("keeps uuids as text and maps camelCase columns", async () => {
    const rows = await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) =>
        db.select().from(user).where(eq(user.id, ADA)),
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(ADA);
    expect(rows[0]?.email).toBe("ada@example.com");
    expect(rows[0]?.role).toBe("admin");
  });

  it("maps booleans to 0/1 and reads them back as booleans", async () => {
    const rows = await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) => db.select().from(user)),
    );
    const byEmail = new Map(rows.map((row) => [row.email, row]));
    expect(byEmail.get("ada@example.com")?.emailVerified).toBe(true);
    expect(byEmail.get("grace@example.com")?.emailVerified).toBe(false);
  });

  it("maps timestamptz and bare timestamp to epoch milliseconds", async () => {
    const [row] = await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) =>
        db.select().from(user).where(eq(user.id, ADA)),
      ),
    );
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.createdAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");

    const [preferences] = await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) => db.select().from(userPreferences)),
    );
    // No zone in the dump: read as UTC, not as the runner's local time.
    expect(preferences?.createdAt.toISOString()).toBe(
      "2026-01-06T00:00:00.000Z",
    );
    expect(preferences?.updatedAt).toBeNull();
  });

  it("keeps a jsonb column as JSON text drizzle can decode", async () => {
    const [row] = await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) => db.select().from(apiKeys)),
    );
    expect(row?.permissions).toEqual(["read", "write"]);
    expect(row?.userId).toBe(ADA);
    expect(row?.lastUsedAt).toBeNull();
  });

  it("preserves apostrophes, newlines and escapes", async () => {
    const [space] = await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) => db.select().from(workspace)),
    );
    expect(space?.name).toBe("Ada's workspace");
    expect(space?.updatedAt).toBeNull();

    const [entry] = await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) => db.select().from(Post)),
    );
    expect(entry?.content).toContain("\n");

    const rows = await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) => db.select().from(user)),
    );
    expect(rows.map((row) => row.name)).toContain("Grace\nHopper");
  });
});
