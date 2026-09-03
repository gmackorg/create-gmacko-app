/**
 * `scripts/check-app-standards.mjs` against throwaway fixture repos: each
 * case writes a minimal `apps/` + `packages/` tree to a temp dir and runs the
 * script there with `--json`, so a rule is tested on exactly the file layout
 * it is scoped to and nothing in the real workspace can mask a regression.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "check-app-standards.mjs",
);

interface Violation {
  readonly rule: string;
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly hint: string;
}

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

/** Writes `files` (relative path → contents) into a fresh temp repo and runs the script there. */
const check = (files: Record<string, string>): ReadonlyArray<Violation> => {
  const root = mkdtempSync(join(tmpdir(), "gmacko-standards-"));
  created.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  const result = spawnSync(process.execPath, [script, "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  const parsed = JSON.parse(result.stdout) as {
    ok: boolean;
    violations: Violation[];
  };
  expect(result.status).toBe(parsed.ok ? 0 : 1);
  return parsed.violations;
};

const rules = (violations: ReadonlyArray<Violation>) =>
  violations.map((v) => `${v.rule} ${v.file}:${v.line}`).sort();

/** `--graph --json`: the packages the rule scopes to, from a fixture tree. */
const graph = (files: Record<string, string>): ReadonlyArray<string> => {
  const root = mkdtempSync(join(tmpdir(), "gmacko-standards-"));
  created.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  const result = spawnSync(process.execPath, [script, "--graph", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  return (JSON.parse(result.stdout) as { webBundle: string[] }).webBundle;
};

const pkg = (name: string, deps: Record<string, string> = {}) =>
  JSON.stringify({ name, dependencies: deps });

/** A workspace where apps/web depends on api, which depends on db; flags is Node-only. */
const workspace = {
  "apps/web/package.json": pkg("@gmacko/web", {
    "@gmacko/api": "workspace:*",
    effect: "catalog:",
  }),
  "packages/api/package.json": pkg("@gmacko/api", {
    "@gmacko/db": "workspace:*",
    "@gmacko/legacy-db": "workspace:*",
  }),
  "packages/db/package.json": pkg("@gmacko/db"),
  "packages/legacy-db/package.json": pkg("@gmacko/legacy-db"),
  "packages/mcp-server/package.json": pkg("@gmacko/mcp-server", {
    "@gmacko/api": "workspace:*",
  }),
};

describe("no-raw-process-env", () => {
  it("computes the web bundle from apps/web's workspace dependencies, transitively", () => {
    expect(graph(workspace)).toEqual([
      "packages/api",
      "packages/db",
      "packages/legacy-db",
    ]);
  });

  it("flags any process.env read in a bundled package, and typed-env misses in app code", () => {
    const violations = check({
      ...workspace,
      "packages/api/src/config.ts":
        'const stage = process.env.STAGE ?? "development";\n',
      "packages/db/src/client.ts": "const url = process.env.NODE_ENV;\n",
      "apps/web/src/lib/x.ts": "const a = process.env.API_URL;\n",
      "apps/web/src/lib/y.ts": "const b = process.env.NODE_ENV;\n",
    });
    expect(rules(violations)).toEqual([
      "no-raw-process-env apps/web/src/lib/x.ts:1",
      "no-raw-process-env packages/api/src/config.ts:1",
      "no-raw-process-env packages/db/src/client.ts:1",
    ]);
  });

  it("exempts env modules, tests, comments, Node-only packages, legacy packages and disabled lines", () => {
    const violations = check({
      ...workspace,
      "packages/api/src/env.ts": "export const env = process.env;\n",
      "packages/api/src/config/index.ts": "process.env.X;\n",
      "packages/api/src/x.test.ts": "process.env.X;\n",
      "packages/api/src/y.ts": [
        "// process.env is never read here",
        " * nor in a docblock mentioning process.env",
        "// gmacko-standards-disable-next-line no-raw-process-env",
        "const z = process.env.Z;",
      ].join("\n"),
      "packages/mcp-server/src/index.ts": "process.env.GMACKO_API_KEY;\n",
      "packages/legacy-db/src/client.ts": "process.env.DATABASE_URL;\n",
      "apps/nextjs/src/lib/legacy.ts": "process.env.NODE_ENV;\n",
    });
    expect(rules(violations)).toEqual([]);
  });
});

describe("no-dev-vars", () => {
  it("flags any .dev.vars file", () => {
    const violations = check({
      ...workspace,
      "apps/web/.dev.vars": "AUTH_SECRET=x\n",
      "apps/web/.dev.vars.staging": "",
      "apps/web/src/index.ts": "export {};\n",
    });
    expect(rules(violations)).toEqual([
      "no-dev-vars apps/web/.dev.vars.staging:1",
      "no-dev-vars apps/web/.dev.vars:1",
    ]);
  });
});

describe("no-db-transaction", () => {
  it("flags db.transaction and withTransaction in the Effect packages and apps/web", () => {
    const violations = check({
      "packages/api/src/posts.ts":
        "export const a = db.transaction(async (tx) => tx);\n",
      "packages/auth/src/x.ts": "sql.withTransaction(effect);\n",
      "packages/domain/src/y.ts": "client.withTransaction(effect)\n",
      "apps/web/src/server/z.ts": "await db.transaction(() => 1);\n",
    });
    expect(rules(violations)).toEqual([
      "no-db-transaction apps/web/src/server/z.ts:1",
      "no-db-transaction packages/api/src/posts.ts:1",
      "no-db-transaction packages/auth/src/x.ts:1",
      "no-db-transaction packages/domain/src/y.ts:1",
    ]);
  });

  it("ignores legacy packages, other apps, comments, and disabled lines", () => {
    const violations = check({
      "packages/legacy-api/src/a.ts": "db.transaction(async (tx) => tx);\n",
      "apps/nextjs/src/b.ts": "db.transaction(async (tx) => tx);\n",
      "packages/db/src/c.ts": [
        "// `withTransaction` is documented here but not called",
        " * a docblock line mentioning db.transaction(",
        "// gmacko-standards-disable-next-line no-db-transaction",
        "client.withTransaction(effect);",
      ].join("\n"),
    });
    expect(rules(violations)).toEqual([]);
  });
});

describe("no-plain-drizzle-in-api", () => {
  it("flags Database.plain outside packages/auth", () => {
    const violations = check({
      "packages/api/src/a.ts":
        "const rows = yield* Effect.promise(() => database.plain.select());\n",
      "packages/api/src/b.ts": "const { plain } = yield* Database;\n",
      "packages/domain/src/c.ts": "Database.plain;\n",
      "apps/web/src/d.ts": "const db = database.plain;\n",
    });
    expect(rules(violations)).toEqual([
      "no-plain-drizzle-in-api apps/web/src/d.ts:1",
      "no-plain-drizzle-in-api packages/api/src/a.ts:1",
      "no-plain-drizzle-in-api packages/api/src/b.ts:1",
      "no-plain-drizzle-in-api packages/domain/src/c.ts:1",
    ]);
  });

  it("allows packages/auth (the adapter), packages/db (the definition), and comments", () => {
    const violations = check({
      "packages/auth/src/service.ts":
        "Effect.map(Database, ({ plain }) => makeAuth(options, plain));\n",
      "packages/db/src/database.ts": "const plain = backend.plain();\n",
      "apps/web/src/server/auth.ts":
        " * built over `Database.plain`. TanStack Start's cookie plugin\n",
      "packages/api/src/ok.ts": "const plainText = format(row.plainName);\n",
    });
    expect(rules(violations)).toEqual([]);
  });
});

describe("no-d1-table-rebuild", () => {
  const rebuild = [
    "PRAGMA foreign_keys=OFF;--> statement-breakpoint",
    "CREATE TABLE `__new_user` (`id` text PRIMARY KEY);--> statement-breakpoint",
    "DROP TABLE `user`;--> statement-breakpoint",
    "ALTER TABLE `__new_user` RENAME TO `user`;",
  ].join("\n");

  it("flags __new_ tables and PRAGMA foreign_keys=OFF in new migrations", () => {
    const violations = check({
      "packages/db/migrations/20260904120000_add_author.sql": rebuild,
      "packages/db/migrations/20260905120000_spaced.sql":
        "pragma foreign_keys = off;\nALTER TABLE `post` ADD `author_id` text;\n",
    });
    expect(rules(violations)).toEqual([
      "no-d1-table-rebuild packages/db/migrations/20260904120000_add_author.sql:1",
      "no-d1-table-rebuild packages/db/migrations/20260904120000_add_author.sql:2",
      "no-d1-table-rebuild packages/db/migrations/20260904120000_add_author.sql:4",
      "no-d1-table-rebuild packages/db/migrations/20260905120000_spaced.sql:1",
    ]);
  });

  it("also scans drizzle-kit's per-migration folders before flattening", () => {
    const violations = check({
      "packages/db/drizzle/20260904120000_add_author/migration.sql": rebuild,
      "packages/db/drizzle/20260904120000_add_author/snapshot.json":
        '{"__new_": "not a migration"}',
    });
    expect(rules(violations)).toEqual([
      "no-d1-table-rebuild packages/db/drizzle/20260904120000_add_author/migration.sql:1",
      "no-d1-table-rebuild packages/db/drizzle/20260904120000_add_author/migration.sql:2",
      "no-d1-table-rebuild packages/db/drizzle/20260904120000_add_author/migration.sql:4",
    ]);
  });

  it("exempts the two pre-provisioning migrations and expand-only SQL", () => {
    const violations = check({
      "packages/db/migrations/20260903030938_init.sql": rebuild,
      "packages/db/migrations/20260903035551_auth_1_7_issuer.sql": rebuild,
      "packages/db/drizzle/20260903030938_init/migration.sql": rebuild,
      "packages/db/drizzle/20260903035551_auth_1_7_issuer/migration.sql":
        rebuild,
      "packages/db/migrations/20260904120000_add_author.sql":
        "ALTER TABLE `post` ADD `author_id` text REFERENCES `user`(`id`);\n",
      "packages/legacy-db/drizzle/0001_x.sql": rebuild,
    });
    expect(rules(violations)).toEqual([]);
  });
});
