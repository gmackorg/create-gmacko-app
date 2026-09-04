/**
 * `scripts/check-app-standards.mjs` against throwaway fixture repos: each
 * case writes a minimal `apps/` + `packages/` tree to a temp dir and runs the
 * script there with `--json`, so a rule is tested on exactly the file layout
 * it is scoped to and nothing in the real workspace can mask a regression.
 * Every rule has a "fires on a deliberate violation" case and an "ignores
 * the sanctioned shape" case.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import oxlintConfig from "../../oxlint.config.ts";

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

const writeTree = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), "gmacko-standards-"));
  created.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
};

/** The payload `check-app-standards.mjs --json` prints on stdout. */
interface StandardsReport {
  readonly ok: boolean;
  readonly violations: readonly Violation[];
}

/** The payload `check-app-standards.mjs --graph --json` prints on stdout. */
interface GraphReport {
  readonly webBundle: readonly string[];
}

/** Writes `files` (relative path → contents) into a fresh temp repo and runs the script there. */
const check = (files: Record<string, string>): ReadonlyArray<Violation> => {
  const result = spawnSync(process.execPath, [script, "--json"], {
    cwd: writeTree(files),
    encoding: "utf8",
  });
  // SAFETY: the script's only `--json` output is
  // `JSON.stringify({ ok, webBundle, violations })` (the `if (asJson)` block
  // at the end of scripts/check-app-standards.mjs). Any other exit path
  // prints nothing, so `JSON.parse` would throw before this type is used —
  // and the exit-status expectation below re-checks `ok` against the script's
  // own contract.
  const parsed = JSON.parse(result.stdout) as StandardsReport;
  expect(result.status).toBe(parsed.ok ? 0 : 1);
  return parsed.violations;
};

const rules = (violations: ReadonlyArray<Violation>) =>
  violations.map((v) => `${v.rule} ${v.file}:${v.line}`).sort();

/** `--graph --json`: the packages the rule scopes to, from a fixture tree. */
const graph = (files: Record<string, string>): ReadonlyArray<string> => {
  const result = spawnSync(process.execPath, [script, "--graph", "--json"], {
    cwd: writeTree(files),
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  // SAFETY: exit status 0 (asserted above) with `--graph --json` is reachable
  // only through the `if (process.argv.includes("--graph"))` block in
  // scripts/check-app-standards.mjs, whose sole stdout write is
  // `JSON.stringify({ webBundle })`.
  return (JSON.parse(result.stdout) as GraphReport).webBundle;
};

const pkg = (name: string, deps: Record<string, string> = {}) =>
  JSON.stringify({ name, dependencies: deps });

/** A workspace where apps/web depends on api, which depends on db; mcp-server is Node-only. */
const workspace = {
  "apps/web/package.json": pkg("@gmacko/web", {
    "@gmacko/api": "workspace:*",
    effect: "catalog:",
  }),
  "packages/api/package.json": pkg("@gmacko/api", {
    "@gmacko/db": "workspace:*",
  }),
  "packages/db/package.json": pkg("@gmacko/db"),
  "packages/mcp-server/package.json": pkg("@gmacko/mcp-server", {
    "@gmacko/api": "workspace:*",
  }),
};

describe("no-raw-process-env", () => {
  it("computes the web bundle from apps/web's workspace dependencies, transitively", () => {
    expect(graph(workspace)).toEqual(["packages/api", "packages/db"]);
  });

  it("follows workspace refs declared as peer or optional dependencies too", () => {
    expect(
      graph({
        ...workspace,
        "apps/web/package.json": JSON.stringify({
          name: "@gmacko/web",
          dependencies: { "@gmacko/api": "workspace:*" },
          peerDependencies: { "@gmacko/ui": "workspace:*" },
          optionalDependencies: { "@gmacko/monitoring": "workspace:*" },
          devDependencies: { "@gmacko/tsconfig": "workspace:*" },
        }),
        "packages/ui/package.json": JSON.stringify({
          name: "@gmacko/ui",
          peerDependencies: { "@gmacko/config": "workspace:*" },
        }),
        "packages/monitoring/package.json": pkg("@gmacko/monitoring"),
        "packages/config/package.json": pkg("@gmacko/config"),
        "packages/tsconfig/package.json": pkg("@gmacko/tsconfig"),
      }),
    ).toEqual([
      "packages/api",
      "packages/config",
      "packages/db",
      "packages/monitoring",
      "packages/ui",
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
      "apps/expo/src/lib/z.ts": "const c = process.env.EXPO_PUBLIC_API_URL;\n",
    });
    expect(rules(violations)).toEqual([
      "no-raw-process-env apps/expo/src/lib/z.ts:1",
      "no-raw-process-env apps/web/src/lib/x.ts:1",
      "no-raw-process-env packages/api/src/config.ts:1",
      "no-raw-process-env packages/db/src/client.ts:1",
    ]);
  });

  it("exempts env modules, tests, comments, Node-only packages and disabled lines", () => {
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
      "packages/realtime/src/index.ts": "process.env.REDIS_URL;\n",
    });
    expect(rules(violations)).toEqual([]);
  });
});

describe("no-cloudflare-env-outside-runtime", () => {
  it("flags cloudflare:workers imports outside apps/web/src/server/runtime.ts", () => {
    const violations = check({
      "apps/web/src/server/config.ts":
        'import { env } from "cloudflare:workers";\n',
      "apps/web/src/lib/wait.ts":
        'const { waitUntil } = await import("cloudflare:workers");\n',
      "packages/api/src/background.ts":
        'import { waitUntil } from "cloudflare:workers";\n',
    });
    expect(rules(violations)).toEqual([
      "no-cloudflare-env-outside-runtime apps/web/src/lib/wait.ts:1",
      "no-cloudflare-env-outside-runtime apps/web/src/server/config.ts:1",
      "no-cloudflare-env-outside-runtime packages/api/src/background.ts:1",
    ]);
  });

  it("allows runtime.ts, Workers tests, declarations, comments and disabled lines", () => {
    const violations = check({
      "apps/web/src/server/runtime.ts":
        'import { env, waitUntil } from "cloudflare:workers";\n',
      "packages/db/src/__tests__/database.workers.test.ts":
        'import { env } from "cloudflare:workers";\n',
      "apps/web/src/server/bindings.d.ts":
        'declare module "cloudflare:workers" {}\n',
      "apps/web/src/server/headers.ts":
        " * see runtime.ts, the only importer of `cloudflare:workers`.\n",
      "packages/api/src/config.ts": [
        "// gmacko-standards-disable-next-line no-cloudflare-env-outside-runtime",
        'import { env } from "cloudflare:workers";',
      ].join("\n"),
    });
    expect(rules(violations)).toEqual([]);
  });
});

describe("no-server-fn-for-data", () => {
  it("flags createServerFn anywhere but src/server/actions.ts", () => {
    const violations = check({
      "apps/web/src/routes/posts.tsx":
        'const list = createServerFn({ method: "GET" }).handler(async () => []);\n',
      "apps/web/src/server/data.ts":
        'import { createServerFn } from "@tanstack/react-start";\n',
    });
    expect(rules(violations)).toEqual([
      "no-server-fn-for-data apps/web/src/routes/posts.tsx:1",
      "no-server-fn-for-data apps/web/src/server/data.ts:1",
    ]);
  });

  it("allows src/server/actions.ts, packages, tests, comments and disabled lines", () => {
    const violations = check({
      "apps/web/src/server/actions.ts":
        'export const signOut = createServerFn({ method: "POST" }).handler(async () => ({}));\n',
      "apps/web/src/server/__tests__/actions.test.ts": "createServerFn;\n",
      "apps/web/src/lib/api.ts":
        "// data never goes through createServerFn (see actions.ts)\n",
      "apps/web/src/routes/x.tsx": [
        "// gmacko-standards-disable-next-line no-server-fn-for-data",
        "const fn = createServerFn();",
      ].join("\n"),
      "packages/api-client/src/client.ts": "const createServerFn = 1;\n",
    });
    expect(rules(violations)).toEqual([]);
  });
});

describe("endpoint-declares-credential", () => {
  const endpoint = (id: string, middlewares: string) =>
    `  .add(\n    HttpApiEndpoint.get("${id}", "/${id}", { success: X })${middlewares},\n  )\n`;

  it("flags two credentials, a role without a credential, and a credential declared before the role", () => {
    const violations = check({
      "packages/domain/src/things/api.ts": [
        'export class ThingsApi extends HttpApiGroup.make("things")',
        endpoint(
          "twoCredentials",
          '.middleware(Session).middleware(SessionOrKey("read"))',
        ),
        endpoint("roleOnly", ".middleware(AdminOnly)"),
        endpoint(
          "inverted",
          '.middleware(SessionOrKey("admin")).middleware(AdminOnly)',
        ),
        endpoint(
          "nestedInverted",
          '\n      .middleware(SessionOrKey("write"))\n      .middleware(WorkspaceRole("admin"))',
        ),
        "  {}",
      ].join("\n"),
    });
    expect(rules(violations)).toEqual([
      "endpoint-declares-credential packages/domain/src/things/api.ts:11",
      "endpoint-declares-credential packages/domain/src/things/api.ts:15",
      "endpoint-declares-credential packages/domain/src/things/api.ts:3",
      "endpoint-declares-credential packages/domain/src/things/api.ts:7",
    ]);
    expect(violations.map((v) => v.message)).toEqual([
      "Endpoint `twoCredentials` declares 2 security middlewares (Session, SessionOrKey).",
      "Endpoint `roleOnly` has a role check (AdminOnly) but no credential.",
      "Endpoint `inverted` declares its credential before a role check.",
      "Endpoint `nestedInverted` declares its credential before a role check.",
    ]);
  });

  it("accepts public endpoints, one credential, role-then-credential, rate limits anywhere, and other files", () => {
    const violations = check({
      "packages/domain/src/things/api.ts": [
        'export class ThingsApi extends HttpApiGroup.make("things")',
        endpoint("list", ""),
        endpoint("byId", '.middleware(SessionOrKey("read"))'),
        endpoint("remove", ".middleware(Session)"),
        endpoint(
          "admin",
          '\n      .middleware(AdminOnly)\n      .middleware(SessionOrKey("admin"))\n      .annotate(RateLimitScopeAnnotation, "operator-api")\n      .middleware(RateLimit)',
        ),
        endpoint(
          "invites",
          '\n      .middleware(WorkspaceRole("admin"))\n      .middleware(SessionOrKey("write"))',
        ),
        "  // .middleware(Session).middleware(Session) in a comment does not count",
        "  {}",
      ].join("\n"),
      "packages/domain/src/things/models.ts":
        ".middleware(Session).middleware(Session)\n",
      "packages/api/src/things/api.ts":
        'HttpApiEndpoint.get("x", "/x").middleware(Session).middleware(Session)\n',
      "packages/domain/src/other/api.ts": [
        'export class OtherApi extends HttpApiGroup.make("other")',
        "  .add(",
        "    // gmacko-standards-disable-next-line endpoint-declares-credential",
        '    HttpApiEndpoint.get("legacy", "/legacy", { success: X }).middleware(AdminOnly),',
        "  ) {}",
      ].join("\n"),
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

  it("is quiet without one", () => {
    expect(
      rules(check({ ...workspace, "apps/web/.env": "AUTH_SECRET=x\n" })),
    ).toEqual([]);
  });
});

describe("exact-host-check", () => {
  it("flags substring host validation", () => {
    const violations = check({
      "apps/expo/src/utils/base-url.ts":
        'if (apiUrl.includes("api.example.io")) return apiUrl;\n',
    });
    expect(rules(violations)).toEqual([
      "exact-host-check apps/expo/src/utils/base-url.ts:1",
    ]);
  });

  it("accepts a parsed-hostname comparison and disabled lines", () => {
    const violations = check({
      "apps/expo/src/utils/base-url.ts": [
        'if (new URL(apiUrl).hostname === "api.example.io") return apiUrl;',
        "// gmacko-standards-disable-next-line exact-host-check",
        'if (apiUrl.includes("api.example.io")) return apiUrl;',
      ].join("\n"),
    });
    expect(rules(violations)).toEqual([]);
  });
});

describe("no-committed-credentials", () => {
  it("flags working-looking credentials in e2e files and .env.example", () => {
    const violations = check({
      "apps/web/e2e/auth.spec.ts": [
        'const email = "admin@real-company.io";',
        'const password = process.env.E2E_PASSWORD ?? "hunter2-password";',
      ].join("\n"),
      "apps/web/.env.example": 'AUTH_SECRET="s3cr3t-value-here"\n',
    });
    expect(rules(violations)).toEqual([
      "no-committed-credentials apps/web/.env.example:1",
      "no-committed-credentials apps/web/e2e/auth.spec.ts:1",
      "no-committed-credentials apps/web/e2e/auth.spec.ts:2",
    ]);
  });

  it("accepts placeholders, URLs, non-test files and disabled lines", () => {
    const violations = check({
      "apps/web/e2e/auth.spec.ts": [
        'const email = "user@example.com";',
        'const dsn = "https://key@o1.ingest.sentry.io/1";',
        "// gmacko-standards-disable-next-line no-committed-credentials -- emulate seed",
        'const secret = "dev-github-secret";',
      ].join("\n"),
      "apps/web/.env.example": 'AUTH_SECRET="set-me-to-a-random-string"\n',
      "apps/web/src/copy.ts": 'const support = "help@real-company.io";\n',
    });
    expect(rules(violations)).toEqual([]);
  });
});

describe("gate-debug-routes", () => {
  it("flags a debug route with no visible gate", () => {
    const violations = check({
      "apps/web/src/routes/api/debug/env.route.ts":
        "export const GET = () => Response.json(Object.keys(bindings));\n",
    });
    expect(rules(violations)).toEqual([
      "gate-debug-routes apps/web/src/routes/api/debug/env.route.ts:1",
    ]);
  });

  it("accepts a route gated on a stage check or a bearer secret", () => {
    const violations = check({
      "apps/web/src/routes/api/debug/env.route.ts":
        'if (config.stage !== "development") return new Response(null, { status: 404 });\n',
      "apps/web/src/routes/api/verify/sentry.route.ts":
        'if (request.headers.get("authorization") !== `Bearer ${secret}`) return unauthorized();\n',
    });
    expect(rules(violations)).toEqual([]);
  });
});

describe("no-partial-account-deletion", () => {
  it("flags a deletion handler that removes an app users table but never the auth user", () => {
    const violations = check({
      "packages/api/src/settings/service.ts": [
        "const deleteAccount = (userId) =>",
        "  db.delete(profiles).where(eq(profiles.userId, userId));",
      ].join("\n"),
    });
    expect(rules(violations)).toEqual([
      "no-partial-account-deletion packages/api/src/settings/service.ts:2",
    ]);
  });

  it("accepts Account.deleteAccount, the contract mutation, and a delete of the auth user", () => {
    const violations = check({
      "packages/api/src/settings/service.ts": [
        "const deleteAccount = (userId) =>",
        "  Effect.all([db.delete(profiles).where(eq(profiles.userId, userId)), db.delete(user).where(eq(user.id, userId))]);",
      ].join("\n"),
      "packages/api/src/settings/handlers.ts": [
        'handlers.handle("deleteAccount", () => Effect.gen(function* () {',
        "  yield* db.delete(profiles);",
        "  yield* account.deleteAccount(user.id);",
        "}))",
      ].join("\n"),
      "apps/expo/src/app/settings.tsx": [
        "// account deletion",
        "const { mutate: deleteAccount } = useMutation({ ...mutations.settings.deleteAccount() });",
        "db.delete(profiles);",
      ].join("\n"),
    });
    expect(rules(violations)).toEqual([]);
  });
});

describe("no-db-transaction", () => {
  it("flags db.transaction and withTransaction in the Effect packages and the apps", () => {
    const violations = check({
      "packages/api/src/posts.ts":
        "export const a = db.transaction(async (tx) => tx);\n",
      "packages/auth/src/x.ts": "sql.withTransaction(effect);\n",
      "packages/domain/src/y.ts": "client.withTransaction(effect)\n",
      "apps/web/src/server/z.ts": "await db.transaction(() => 1);\n",
      "apps/expo/src/w.ts": "await db.transaction(() => 1);\n",
    });
    expect(rules(violations)).toEqual([
      "no-db-transaction apps/expo/src/w.ts:1",
      "no-db-transaction apps/web/src/server/z.ts:1",
      "no-db-transaction packages/api/src/posts.ts:1",
      "no-db-transaction packages/auth/src/x.ts:1",
      "no-db-transaction packages/domain/src/y.ts:1",
    ]);
  });

  it("ignores Node-only packages, comments, and disabled lines", () => {
    const violations = check({
      "packages/realtime/src/a.ts": "db.transaction(async (tx) => tx);\n",
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
    });
    expect(rules(violations)).toEqual([]);
  });
});

/**
 * `oxlint.config.ts` mirrors exactly one of the standards
 * (`no-cloudflare-env-outside-runtime`) so the editor and the pre-commit hook
 * report it before CI does. Two sources of truth for one rule drift, so this
 * pins them to each other: the allow-list in the script and the "off"
 * override in the oxlint config must name the same module.
 *
 * It also pins the vendored anti-slop wiring, because a config whose
 * `jsPlugins` specifier points at a directory that did not survive scaffolding
 * fails *silently* — oxlint would simply stop reporting the rules in every
 * generated app.
 */
describe("oxlint.config.ts", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const source = readFileSync(
    join(root, "scripts", "check-app-standards.mjs"),
    "utf8",
  );
  const overrides = oxlintConfig.overrides ?? [];

  describe("the mirror of no-cloudflare-env-outside-runtime", () => {
    it("restricts cloudflare:workers across app and package source", () => {
      const restricting = overrides.find(
        (override) => override.rules?.["no-restricted-imports"] !== "off",
      );
      expect(restricting?.files).toEqual([
        "apps/*/src/**",
        "packages/*/src/**",
      ]);
      expect(JSON.stringify(restricting?.rules)).toContain(
        "cloudflare:workers",
      );
    });

    it("exempts the same module the script's allow-list names", () => {
      // `const CF_ENV_ALLOWED = new Set(["apps/web/src/server/runtime.ts"]);`
      const allowed = [
        ...source.matchAll(/CF_ENV_ALLOWED = new Set\(\[([^\]]*)\]\)/g),
      ]
        .flatMap((match) => (match[1] ?? "").split(","))
        .map((entry) => entry.trim().replace(/^["']|["']$/g, ""))
        .filter((entry) => entry.length > 0);
      expect(allowed).toEqual(["apps/web/src/server/runtime.ts"]);

      const exempting = overrides.find(
        (override) => override.rules?.["no-restricted-imports"] === "off",
      );
      for (const file of allowed) expect(exempting?.files).toContain(file);
      // Plus the shapes the script exempts by pattern, not by name.
      expect(exempting?.files).toContain("**/*.workers.test.ts");
      expect(exempting?.files).toContain("**/*.d.ts");
    });
  });

  describe("the vendored anti-slop plugin", () => {
    // A `jsPlugins` entry is either a bare specifier or a `{ name, specifier }`
    // record; only the record form carries a separate name, and a bare entry is
    // its own specifier.
    const jsPlugins = oxlintConfig.jsPlugins ?? [];
    const specifiers = jsPlugins.map((plugin) =>
      plugin instanceof Object ? plugin.specifier : plugin,
    );

    it("registers both plugin groups", () => {
      const names = jsPlugins.map((plugin) =>
        plugin instanceof Object ? plugin.name : plugin,
      );
      expect(names).toEqual(["anti-slop", "anti-slop-effect"]);
    });

    it("points at entry points that exist", () => {
      expect(specifiers.length).toBeGreaterThan(0);
      for (const specifier of specifiers) {
        expect(existsSync(join(root, specifier))).toBe(true);
      }
    });

    it("ignores the vendored source itself", () => {
      expect(oxlintConfig.ignorePatterns).toContain(
        "tools/oxlint/anti-slop/**",
      );
    });

    it("enables every rule the vendored plugins export, or says why not", () => {
      // The plugin index files list their own rules; the config must name each
      // one, so a re-sync that adds a rule cannot land silently disabled.
      const declared = new Set(
        Object.keys(oxlintConfig.rules ?? {}).filter((rule) =>
          rule.startsWith("anti-slop"),
        ),
      );
      for (const [group, entry] of [
        ["anti-slop", "tools/oxlint/anti-slop/index.ts"],
        ["anti-slop-effect", "tools/oxlint/anti-slop/effect/index.ts"],
      ] as const) {
        const index = readFileSync(join(root, entry), "utf8");
        const exported = [...index.matchAll(/^\t\t"([a-z0-9-]+)":/gm)].map(
          (match) => match[1],
        );
        expect(exported.length).toBeGreaterThan(0);
        for (const rule of exported) {
          expect(declared).toContain(`${group}/${rule}`);
        }
      }
    });

    it("keeps @oxlint/plugins pinned to the resolved oxlint version", () => {
      // oxlint loads the plugin into its own process; a version skew between
      // the two is a runtime failure, not a type error.
      const catalog = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
      const plugins = /^\s*'@oxlint\/plugins':\s*(\S+)$/m.exec(catalog)?.[1];
      const oxlint = /^\s*oxlint:\s*(\S+)$/m.exec(catalog)?.[1];
      expect(plugins).toBeDefined();
      expect(plugins).toBe(oxlint);
      expect(plugins).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
