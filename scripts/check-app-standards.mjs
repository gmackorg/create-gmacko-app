#!/usr/bin/env node
/**
 * gmacko app-standards guardrail.
 *
 * Static checks that catch the deviations most commonly introduced by feature
 * work on top of a scaffolded gmacko app — each corresponds to a real bug that
 * shipped into a generated app and had to be fixed by hand. Run in CI (and via
 * `pnpm check`) so a PR that reintroduces one fails before merge, not after.
 *
 * Exit non-zero if any violation is found. `--fix` is intentionally NOT offered;
 * these need human judgement, not codemods.
 *
 * This script is the authority for all nine rules. `.oxlintrc.json` mirrors
 * exactly one of them (`no-cloudflare-env-outside-runtime`, as
 * `no-restricted-imports`) so the editor and the pre-commit hook report it
 * first; that config explains why the other eight are not expressible in
 * oxlint, and __tests__/check-app-standards.test.ts pins the two in step.
 *
 * Usage: node scripts/check-app-standards.mjs [--json] [--graph]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["apps", "packages"];
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORE =
  /(^|\/)(node_modules|dist|build|\.expo|storybook-static|coverage|\.turbo|\.wrangler|generated)(\/|$)/;

/** @typedef {{ rule: string, file: string, line: number, message: string, hint: string }} Violation */
/** @type {Violation[]} */
const violations = [];

function walk(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (IGNORE.test(full)) continue;
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const allFiles = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
const codeFiles = allFiles.filter((f) => CODE_EXT.has(extname(f)));

const read = (f) => {
  try {
    return readFileSync(f, "utf8");
  } catch {
    return "";
  }
};
const linesOf = (src) => src.split("\n");
const rel = (f) => relative(ROOT, f);
const add = (rule, file, line, message, hint) =>
  violations.push({ rule, file: rel(file), line, message, hint });

// A line that is only a comment: `//`, `*` (docblock body), or `/*`.
const isCommentLine = (ln) => /^\s*(\/\/|\*|\/\*)/.test(ln);

// A file may opt out of a specific rule for a justified reason with a line
// comment: `// gmacko-standards-disable-next-line <rule>`.
const isDisabled = (lines, idx, rule) => {
  const prev = lines[idx - 1] ?? "";
  return prev.includes(`gmacko-standards-disable-next-line ${rule}`);
};

// Test files and type declarations sit outside the runtime rules below.
const IS_TEST_OR_DECL = /(\.(test|spec)\.[tj]sx?$)|(\.d\.ts$)/;
// Source under any app or package: `apps/<x>/src/**`, `packages/<x>/src/**`.
const SRC_SCOPE = /^(apps|packages)\/[^/]+\/src\//;

// ── Rule: no-raw-process-env ─────────────────────────────────────────────────
// Config enters once, validated: the app feature layer (apps/*/src/**) reads
// the typed `env` object, and nothing that ships inside the Worker bundle
// reads `process.env` at all — the Worker has no process environment, so a
// read there is a value that is silently `undefined` in production (plan
// principle 04: env is a service; `AppConfig` is the only reader). The bundle
// is the set of workspace packages reachable from apps/web's package.json
// (`dependencies`, `peerDependencies` and `optionalDependencies`,
// transitively — a peer or optional workspace package is bundled just the
// same once installed), computed here so a new dependency joins the scope
// on its own. Node-only packages (the CLI, the MCP server, realtime) are not
// reachable from apps/web and keep their typed env modules. The
// env-definition layer stays exempt in both scopes (env.ts / src/config /
// src/env / instrumentation / *.config.* / tests).
//
// apps/web/src itself is checked with the *app* pattern (NODE_ENV and PORT
// allowed) rather than the bundle pattern, although it too ships in the
// Worker: Vite statically replaces `process.env.NODE_ENV` at build time
// (Rollup/Vite `define`), so that one read is a compile-time constant, not
// a runtime lookup of a process that does not exist. Every other
// `process.env.X` in apps/web/src is still a violation.
const WEB_APP_DIR = "apps/web";
const ENV_RULE_APP_SCOPE = /^apps\/[^/]+\/src\//;
const ENV_RULE_EXEMPT =
  /(^|\/)(env\.ts|env\.mjs|env\.js|instrumentation\.[tj]sx?|.*\.config\.(ts|js|mjs|cjs)|.*\.(test|spec)\.[tj]sx?)|(^|\/)(src\/config|src\/env)\//;

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/** Workspace package name → directory (relative), from packages/* and apps/*. */
function workspacePackages() {
  const byName = new Map();
  for (const scope of SCAN_DIRS) {
    let entries;
    try {
      entries = readdirSync(join(ROOT, scope));
    } catch {
      continue;
    }
    for (const name of entries) {
      const dir = join(scope, name);
      const pkg = readJson(join(ROOT, dir, "package.json"));
      if (pkg?.name) byName.set(pkg.name, dir);
    }
  }
  return byName;
}

/** The dependency fields that ship: devDependencies build a package, they do not. */
const SHIPPED_DEP_FIELDS = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
];

const shippedDeps = (pkg) =>
  SHIPPED_DEP_FIELDS.flatMap((field) => Object.keys(pkg?.[field] ?? {}));

/**
 * The workspace packages the web app bundles: its `dependencies`,
 * `peerDependencies` and `optionalDependencies` and, transitively, theirs
 * (devDependencies build the app, they do not ship). Sorted directories,
 * relative to the repo root.
 */
export function webBundlePackages(root = ROOT) {
  const byName = workspacePackages();
  const app = readJson(join(root, WEB_APP_DIR, "package.json"));
  if (!app) return [];
  const seen = new Set();
  const queue = shippedDeps(app);
  while (queue.length > 0) {
    const name = queue.shift();
    const dir = byName.get(name);
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    queue.push(...shippedDeps(readJson(join(root, dir, "package.json"))));
  }
  return [...seen].sort();
}

function checkRawProcessEnv() {
  const bundleSrc = webBundlePackages().map((dir) => `${dir}/src/`);
  const inScope = (r) =>
    ENV_RULE_APP_SCOPE.test(r) ||
    bundleSrc.some((prefix) => r.startsWith(prefix));
  for (const f of codeFiles) {
    const r = rel(f);
    if (!inScope(r) || ENV_RULE_EXEMPT.test(r)) continue;
    const isBundle = bundleSrc.some((prefix) => r.startsWith(prefix));
    const lines = linesOf(read(f));
    lines.forEach((ln, i) => {
      if (isCommentLine(ln)) return;
      // In the app layer NODE_ENV and PORT are framework/dev-server vars, not
      // app config — conventional exceptions (e.g. a localhost dev-URL
      // fallback). In the Worker bundle there is no process at all, so no
      // exception applies.
      const pattern = isBundle
        ? /\bprocess\.env\b/
        : /\bprocess\.env\.(?!NODE_ENV\b|PORT\b)[A-Z0-9_]+/;
      if (pattern.test(ln) && !isDisabled(lines, i, "no-raw-process-env")) {
        add(
          "no-raw-process-env",
          f,
          i + 1,
          isBundle
            ? "process.env read in a package that ships in the Worker bundle (apps/web dependency graph)."
            : "Direct process.env access in app code.",
          isBundle
            ? "Take the value as a constructor/function option or from AppConfig (apps/web/src/server/config.ts is the only reader of bindings). Node-only packages must not be reachable from apps/web."
            : "Import the validated `env` (from ~/env or @gmacko/*/env) instead — it validates + types the var. Add it to the env schema if missing.",
        );
      }
    });
  }
}

// ── Rule: no-cloudflare-env-outside-runtime ──────────────────────────────────
// `cloudflare:workers` (the `env` and `waitUntil` globals) is the Worker's
// ambient environment. Exactly one module turns it into Effect services —
// `apps/web/src/server/runtime.ts` (AppConfig, Database, Background) — and
// everything else takes those services. A second importer would be a second
// reader of bindings (bypassing `AppConfig` and its validation) and code that
// only runs on workerd, so it can no longer be exercised by the sqlite-node
// test layer. Workers tests (`*.workers.test.ts`) read `env` on purpose and
// are exempt, as are type declarations.
const CF_ENV_ALLOWED = new Set(["apps/web/src/server/runtime.ts"]);
const CF_ENV_IMPORT =
  /\b(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["']cloudflare:workers["']/;
function checkCloudflareEnvImports() {
  for (const f of codeFiles) {
    const r = rel(f);
    if (!SRC_SCOPE.test(r) || IS_TEST_OR_DECL.test(r) || CF_ENV_ALLOWED.has(r))
      continue;
    const lines = linesOf(read(f));
    lines.forEach((ln, i) => {
      if (isCommentLine(ln)) return;
      if (
        CF_ENV_IMPORT.test(ln) &&
        !isDisabled(lines, i, "no-cloudflare-env-outside-runtime")
      ) {
        add(
          "no-cloudflare-env-outside-runtime",
          f,
          i + 1,
          "`cloudflare:workers` imported outside apps/web/src/server/runtime.ts.",
          "Read bindings through the services runtime.ts builds (AppConfig, Database, Background) instead of importing `env`/`waitUntil` directly; only runtime.ts touches the Worker's ambient environment.",
        );
      }
    });
  }
}

// ── Rule: no-server-fn-for-data ──────────────────────────────────────────────
// Every read and write of app data goes through the `HttpApi` contract
// (`@gmacko/api-client`), so the browser, the SSR loader, Expo and the
// operator tools share one typed surface. TanStack Start's `createServerFn`
// is for the two things the contract cannot do — set a cookie or redirect —
// and lives in one file per app, `src/server/actions.ts` (plan principle
// 09). A server function elsewhere is a second, untyped data path.
const SERVER_FN_ALLOWED = /^apps\/[^/]+\/src\/server\/actions\.tsx?$/;
function checkServerFnForData() {
  for (const f of codeFiles) {
    const r = rel(f);
    if (
      !ENV_RULE_APP_SCOPE.test(r) ||
      IS_TEST_OR_DECL.test(r) ||
      SERVER_FN_ALLOWED.test(r)
    )
      continue;
    const lines = linesOf(read(f));
    lines.forEach((ln, i) => {
      if (isCommentLine(ln)) return;
      if (
        /\bcreateServerFn\b/.test(ln) &&
        !isDisabled(lines, i, "no-server-fn-for-data")
      ) {
        add(
          "no-server-fn-for-data",
          f,
          i + 1,
          "`createServerFn` outside src/server/actions.ts.",
          "Reads and writes go through the contract client (`@gmacko/api-client/queries`); a server function is only for setting a cookie or redirecting, and belongs in src/server/actions.ts.",
        );
      }
    });
  }
}

// ── Rule: endpoint-declares-credential ───────────────────────────────────────
// Every endpoint of the contract (`packages/domain/src/**/api.ts`) names the
// credential it accepts: nothing (public), `Session`, or one
// `SessionOrKey(scope)` (plan principle 07; docs/API_AUTH.md). Two security
// middlewares on one endpoint would run both schemes and the second one
// last; a role check (`AdminOnly`, `WorkspaceRole(min)`) without a credential
// has no `CurrentUser` to read; and the credential must be declared after the
// role checks, because `HttpApiBuilder` wraps the handler in declaration
// order, so the last one runs outermost and is the only order in which the
// role check sees the user the credential provided (API_AUTH.md, rule 6).
// `RateLimit` and `EndpointBoundary` neither provide nor require
// `CurrentUser` and may sit anywhere. Read statically from the source so a
// fixture can be tested without building the contract; the domain's own
// api.test.ts checks the same facts through `HttpApi.reflect`.
const ENDPOINT_START =
  /\bHttpApiEndpoint\.(get|post|put|patch|del|delete|head|options)\s*\(/;
const MIDDLEWARE_CALL = /\.middleware\(\s*([A-Za-z_$][\w$]*)/g;
const SECURITY_MIDDLEWARE = new Set(["Session", "SessionOrKey"]);
const ROLE_MIDDLEWARE = new Set(["AdminOnly", "WorkspaceRole"]);
function checkEndpointCredentials() {
  const contractFiles = codeFiles.filter((f) => {
    const r = rel(f);
    return r.startsWith("packages/domain/src/") && basename(f) === "api.ts";
  });
  for (const f of contractFiles) {
    const lines = linesOf(read(f));
    const starts = [];
    lines.forEach((ln, i) => {
      if (!isCommentLine(ln) && ENDPOINT_START.test(ln)) starts.push(i);
    });
    starts.forEach((start, n) => {
      if (isDisabled(lines, start, "endpoint-declares-credential")) return;
      const end = starts[n + 1] ?? lines.length;
      const chunk = lines
        .slice(start, end)
        .filter((ln) => !isCommentLine(ln))
        .join("\n");
      const idMatch = /\bHttpApiEndpoint\.\w+\s*\(\s*"([^"]+)"/.exec(chunk);
      const id = idMatch?.[1] ?? "(unknown)";
      const order = [];
      for (const m of chunk.matchAll(MIDDLEWARE_CALL)) {
        const name = m[1];
        if (SECURITY_MIDDLEWARE.has(name))
          order.push({ kind: "security", name });
        else if (ROLE_MIDDLEWARE.has(name)) order.push({ kind: "role", name });
      }
      const security = order.filter((m) => m.kind === "security");
      const roles = order.filter((m) => m.kind === "role");
      const last = order[order.length - 1];
      const line = start + 1;
      if (security.length > 1) {
        add(
          "endpoint-declares-credential",
          f,
          line,
          `Endpoint \`${id}\` declares ${security.length} security middlewares (${security.map((m) => m.name).join(", ")}).`,
          "Name exactly one credential: `Session` (cookie only) or `SessionOrKey(scope)` (cookie or a key holding the scope).",
        );
      } else if (roles.length > 0 && security.length === 0) {
        add(
          "endpoint-declares-credential",
          f,
          line,
          `Endpoint \`${id}\` has a role check (${roles.map((m) => m.name).join(", ")}) but no credential.`,
          "A role middleware reads the `CurrentUser` a credential provides; add `.middleware(SessionOrKey(scope))` (or `Session`) after the role check.",
        );
      } else if (roles.length > 0 && last?.kind !== "security") {
        add(
          "endpoint-declares-credential",
          f,
          line,
          `Endpoint \`${id}\` declares its credential before a role check.`,
          'Declare the credential last so it runs outermost: `.middleware(AdminOnly).middleware(SessionOrKey("admin"))` (docs/API_AUTH.md, rule 6).',
        );
      }
    });
  }
}

// ── Rule: no-dev-vars ────────────────────────────────────────────────────────
// Wrangler and the Cloudflare Vite plugin load `.env` / `.env.local` from the
// wrangler config directory, which is how emulate's variables reach the
// Worker in development (apps/web/.env links to the repo-root .env). A
// `.dev.vars` file, even an empty one, silently disables that `.env` loading,
// so the Worker boots with wrangler.jsonc vars only and every AppConfig secret
// is missing. Never create one; stage secrets go in with `wrangler secret put`
// (`pnpm secrets:push`).
function checkDevVars() {
  for (const f of allFiles) {
    const name = basename(f);
    if (!name.startsWith(".dev.vars")) continue;
    add(
      "no-dev-vars",
      f,
      1,
      "`.dev.vars` file present: its existence disables `.env` loading in wrangler dev.",
      "Delete it. Local variables come from the repo-root .env (linked into apps/web/.env by `predev`); stage secrets from `pnpm secrets:push --stage <stage>`.",
    );
  }
}

// ── Rule: exact-host-check ───────────────────────────────────────────────────
// Validating an API/host against a URL with `.includes(host)` is bypassable
// (`https://evil.example/?x=api.real.com` includes the string). Compare the
// parsed hostname instead.
function checkHostIncludes() {
  for (const f of codeFiles) {
    const lines = linesOf(read(f));
    lines.forEach((ln, i) => {
      if (
        /\b(apiUrl|url|origin|host|endpoint)\b[^\n]*\.includes\(/i.test(ln) &&
        /(host|HOST|origin|domain|classcheck|\.io|\.com|https?:)/.test(ln) &&
        !isDisabled(lines, i, "exact-host-check")
      ) {
        add(
          "exact-host-check",
          f,
          i + 1,
          "Host/URL validated with `.includes()` (substring — bypassable).",
          "Compare the parsed hostname: `new URL(x).hostname === host`.",
        );
      }
    });
  }
}

// ── Rule: no-committed-credentials ───────────────────────────────────────────
// Test/e2e configs and .env.example must never commit working credentials or
// fall back to them. Flags credential-shaped string literals in those files.
// Where committed test credentials realistically live: e2e suites, Maestro
// flows, and .env.example. Scanning all files for email/secret literals would be
// noisy (UI copy, fixtures); gitleaks covers high-entropy secrets elsewhere.
const CRED_SCAN_GLOB = /(\/e2e\/|\/\.maestro\/|\.env\.example$)/i;
const CRED_PATTERNS = [
  // An email literal that isn't part of a URL (`://` before the local part).
  {
    re: /["'](?![a-z][a-z0-9+.-]*:\/\/)[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}["']/,
    what: "email literal",
  },
  {
    re: /(password|passwd|secret|token|apikey|api_key)\s*[:=]\s*["'][^"']{6,}["']/i,
    what: "credential literal",
  },
  // A `?? "…"` fallback whose value looks like a password/secret (NOT a bare
  // `@`, which matches DSNs/URLs).
  {
    re: /\?\?\s*["'][^"']*(password|passwd|token|secret|apikey)[^"']*["']/i,
    what: 'credential fallback default (`?? "..."`)',
  },
];
function checkCommittedCredentials() {
  const targets = allFiles.filter(
    (f) =>
      CRED_SCAN_GLOB.test(rel(f)) &&
      (CODE_EXT.has(extname(f)) || basename(f) === ".env.example"),
  );
  for (const f of targets) {
    const lines = linesOf(read(f));
    lines.forEach((ln, i) => {
      if (
        /example\.com|example\.org|set-me|placeholder|your-|xxxx|00000000-0000/i.test(
          ln,
        )
      )
        return; // clearly a placeholder
      for (const { re, what } of CRED_PATTERNS) {
        if (re.test(ln) && !isDisabled(lines, i, "no-committed-credentials")) {
          add(
            "no-committed-credentials",
            f,
            i + 1,
            `Possible committed ${what} in a test/env-example file.`,
            "Require credentials via env (throw if missing); keep .env.example values as non-functional placeholders (e.g. teacher@example.com / set-me-via-ci-secret).",
          );
          break;
        }
      }
    });
  }
}

// ── Rule: gate-debug-routes ──────────────────────────────────────────────────
// Debug/verify/dev HTTP routes must not be publicly reachable in production.
// Flags route handlers under api/dev|debug|verify that don't reference an
// auth/secret/production gate.
function checkDebugRoutes() {
  const routeFiles = codeFiles.filter((f) =>
    /\/(dev|debug|verify)\/[^/]*route\.(ts|js)x?$|(sentry-verify|debug|dev).*route\.(ts|js)x?$/i.test(
      rel(f),
    ),
  );
  for (const f of routeFiles) {
    const src = read(f);
    const gated =
      /(authoriz|Bearer|secret|requireAdmin|isAdmin|NODE_ENV\s*!==\s*["']production["']|stage\s*[!=]==\s*["'](production|development)["']|getSession|apiKey|unauthorized|401|403)/i.test(
        src,
      );
    if (!gated) {
      add(
        "gate-debug-routes",
        f,
        1,
        "Debug/verify/dev route with no visible auth/secret/non-prod gate.",
        "Require a bearer secret (fail closed if unset in prod) or restrict to non-production (`AppConfig.stage`) before capturing events / returning env info.",
      );
    }
  }
}

// ── Rule: no-partial-account-deletion ────────────────────────────────────────
// Account deletion must remove the auth `user` (which cascades sessions,
// accounts, api keys, memberships via the schema), not just an app-specific
// table. In this stack that is `Account.deleteAccount` (packages/api,
// settings/service.ts), reached over the contract as `settings.deleteAccount`
// and from the clients through `mutations.settings.deleteAccount()`. Flags a
// delete on a users-like table in a deletion handler that never deletes the
// auth `user` or routes through those.
function checkAccountDeletion() {
  for (const f of codeFiles) {
    const src = read(f);
    if (
      !/delete\s*Account|deleteCurrent|deleteUser|account.?deletion/i.test(src)
    )
      continue;
    const deletesAppUsers = /\.delete\((users|appUsers|profiles)\)/.test(src);
    const deletesAuthUser =
      /\.delete\((user)\)|deleteAuthUser|authClient\.deleteUser|\b[Aa]ccount\.deleteAccount\b|settings\.deleteAccount/.test(
        src,
      );
    if (deletesAppUsers && !deletesAuthUser) {
      const lines = linesOf(src);
      const idx = lines.findIndex((l) =>
        /\.delete\((users|appUsers|profiles)\)/.test(l),
      );
      add(
        "no-partial-account-deletion",
        f,
        idx + 1,
        "Account deletion removes an app users table but never the auth `user`.",
        "Route deletion through `Account.deleteAccount` (packages/api/src/settings/service.ts; `settings.deleteAccount` over the contract), which deletes the auth `user` so credentials can no longer authenticate — App Store 5.1.1(v).",
      );
    }
  }
}

// ── Rule: no-db-transaction ──────────────────────────────────────────────────
// D1 has no interactive transactions: `@effect/sql-d1` turns `withTransaction`
// into a defect and the Database service removes `db.transaction`, so a call
// only "works" on the sqlite-node test layer and dies in production. Use
// `Database.batch` (atomic multi-statement) or a guarded write (`updateWhere`).
// Scope: everything that can reach D1 — the Effect packages and the apps.
const DB_RULE_SCOPE = /^(packages\/(db|auth|api|domain)|apps\/[^/]+)\/src\//;
function checkDbTransaction() {
  for (const f of codeFiles) {
    const r = rel(f);
    if (!DB_RULE_SCOPE.test(r)) continue;
    const lines = linesOf(read(f));
    lines.forEach((ln, i) => {
      if (isCommentLine(ln)) return;
      if (
        /\.transaction\(|\bwithTransaction\b/.test(ln) &&
        !isDisabled(lines, i, "no-db-transaction")
      ) {
        add(
          "no-db-transaction",
          f,
          i + 1,
          "Interactive transaction in D1-backed code (dies at runtime on D1).",
          "Use `Database.batch([...])` for atomic multi-statement writes or a guarded write (`Database.updateWhere`, precondition in the WHERE clause) for read-check-write. (Line-based: a match inside a trailing `//` comment or a string literal is also flagged; silence with `// gmacko-standards-disable-next-line no-db-transaction`.)",
        );
      }
    });
  }
}

// ── Rule: no-plain-drizzle-in-api ────────────────────────────────────────────
// `Database.plain` is the promise-based drizzle that exists only because
// better-auth's adapter is promise-based. Anything else that uses it bypasses
// the `DatabaseError` mapping, spans, and the transaction-free surface, and
// silently diverges between sqlite-node and D1. Only `packages/auth` (the
// adapter) may touch it; `packages/db` defines it.
const PLAIN_RULE_SCOPE = /^(packages\/(api|domain)|apps\/[^/]+)\/src\//;
function checkPlainDrizzle() {
  for (const f of codeFiles) {
    const r = rel(f);
    if (!PLAIN_RULE_SCOPE.test(r)) continue;
    const lines = linesOf(read(f));
    lines.forEach((ln, i) => {
      if (isCommentLine(ln)) return;
      if (
        (/\.plain\b(?![\w-])/.test(ln) ||
          /\{[^}]*\bplain\b[^}]*\}\s*(=|\))/.test(ln)) &&
        !isDisabled(lines, i, "no-plain-drizzle-in-api")
      ) {
        add(
          "no-plain-drizzle-in-api",
          f,
          i + 1,
          "`Database.plain` (promise drizzle) used outside packages/auth.",
          "Go through `Database.db` (the Effect query API) so failures are `DatabaseError` and the call is traced; `plain` exists for better-auth's adapter only. (Line-based: a match inside a trailing `//` comment or a string literal is also flagged; silence with `// gmacko-standards-disable-next-line no-plain-drizzle-in-api`.)",
        );
      }
    });
  }
}

// ── Rule: no-d1-table-rebuild ────────────────────────────────────────────────
// D1 runs each migration file as one batch and ignores `PRAGMA
// foreign_keys=OFF` inside it (`packages/db/src/__tests__/migrations.workers.
// test.ts` pins this), so drizzle-kit's rebuild recipe (`CREATE TABLE
// __new_x`, copy, `DROP TABLE x`, rename) runs the DROP with foreign keys ON
// and cascade-deletes every referencing row. Every migration after the two
// pre-provisioning ones must be expand/contract only. Both copies are scanned:
// drizzle-kit's `drizzle/<name>/migration.sql` (the source of truth) and the
// flattened `migrations/<name>.sql` that D1 applies, so a freshly generated
// migration is caught before `flatten-migrations` runs.
const D1_MIGRATION =
  /^packages\/db\/(migrations\/([^/]+)\.sql|drizzle\/([^/]+)\/migration\.sql)$/;
const D1_REBUILD_EXEMPT = new Set([
  "20260903030938_init",
  "20260903035551_auth_1_7_issuer",
]);
function checkD1TableRebuild() {
  for (const f of allFiles) {
    const r = rel(f);
    const m = D1_MIGRATION.exec(r);
    if (!m) continue;
    const name = m[2] ?? m[3];
    if (D1_REBUILD_EXEMPT.has(name)) continue;
    const lines = linesOf(read(f));
    lines.forEach((ln, i) => {
      const rebuild = /__new_/.test(ln);
      const pragmaOff = /pragma\s+foreign_keys\s*=\s*off/i.test(ln);
      if (rebuild || pragmaOff) {
        add(
          "no-d1-table-rebuild",
          f,
          i + 1,
          rebuild
            ? "drizzle-kit table rebuild (`__new_` table) in a D1 migration."
            : "`PRAGMA foreign_keys=OFF` in a D1 migration (a no-op inside D1's batch).",
          "Rewrite as expand/contract: add a nullable/defaulted column, backfill, tighten later; add a new table and copy instead of drop-and-recreate. See docs/drizzle-migrations.md.",
        );
      }
    });
  }
}

const asJson = process.argv.includes("--json");

// `--graph`: print the web bundle (the no-raw-process-env package scope) and exit.
if (process.argv.includes("--graph")) {
  const bundle = webBundlePackages();
  if (asJson) console.log(JSON.stringify({ webBundle: bundle }, null, 2));
  else {
    console.log(
      "apps/web dependency graph (workspace packages in the Worker bundle):",
    );
    for (const dir of bundle) console.log(`  ${dir}`);
  }
  process.exit(0);
}

checkRawProcessEnv();
checkCloudflareEnvImports();
checkServerFnForData();
checkEndpointCredentials();
checkDevVars();
checkHostIncludes();
checkCommittedCredentials();
checkDebugRoutes();
checkAccountDeletion();
checkDbTransaction();
checkPlainDrizzle();
checkD1TableRebuild();

if (asJson) {
  console.log(
    JSON.stringify(
      {
        ok: violations.length === 0,
        webBundle: webBundlePackages(),
        violations,
      },
      null,
      2,
    ),
  );
} else if (violations.length === 0) {
  console.log("✓ gmacko app standards: no violations");
} else {
  const byRule = {};
  for (const v of violations) (byRule[v.rule] ??= []).push(v);
  console.error(`✗ gmacko app standards: ${violations.length} violation(s)\n`);
  for (const [rule, vs] of Object.entries(byRule)) {
    console.error(`  ● ${rule} (${vs.length})`);
    for (const v of vs.slice(0, 20))
      console.error(`      ${v.file}:${v.line}  ${v.message}`);
    console.error(`      → ${vs[0].hint}\n`);
  }
  console.error(
    "Fix each, or justify with `// gmacko-standards-disable-next-line <rule>`.",
  );
}
process.exit(violations.length === 0 ? 0 : 1);
