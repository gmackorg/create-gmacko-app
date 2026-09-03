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
 * Usage: node scripts/check-app-standards.mjs [--json]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["apps", "packages"];
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORE =
  /(^|\/)(node_modules|dist|build|\.next|\.expo|storybook-static|coverage|\.turbo|generated)(\/|$)/;

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

// A file may opt out of a specific rule for a justified reason with a line
// comment: `// gmacko-standards-disable-next-line <rule>`.
const isDisabled = (lines, idx, rule) => {
  const prev = lines[idx - 1] ?? "";
  return prev.includes(`gmacko-standards-disable-next-line ${rule}`);
};

// ── Rule: no-raw-process-env ─────────────────────────────────────────────────
// App feature code must read config from the validated `env` object (t3-oss/env),
// not `process.env` directly — otherwise vars are unvalidated and untyped. This
// rule is scoped to the app feature layer (apps/*/src/**), where feature work is
// added, and exempts the env-definition layer (env.ts / src/config / src/env /
// instrumentation / *.config.* / tests), which legitimately reads process.env to
// build that validated object. Shared `packages/**` are exempt here — they are
// infrastructure and several must read process.env directly (logging, telemetry,
// db client, etc.).
const ENV_RULE_SCOPE = /^apps\/[^/]+\/src\//;
const ENV_RULE_EXEMPT =
  /(^|\/)(env\.ts|env\.mjs|env\.js|instrumentation\.[tj]sx?|.*\.config\.(ts|js|mjs|cjs)|.*\.(test|spec)\.[tj]sx?)|(^|\/)(src\/config|src\/env)\//;
function checkRawProcessEnv() {
  for (const f of codeFiles) {
    const r = rel(f);
    if (!ENV_RULE_SCOPE.test(r) || ENV_RULE_EXEMPT.test(r)) continue;
    const lines = linesOf(read(f));
    lines.forEach((ln, i) => {
      // NODE_ENV and PORT are framework/dev-server vars, not app config —
      // conventional exceptions (e.g. a localhost dev-URL fallback).
      if (
        /\bprocess\.env\.(?!NODE_ENV\b|PORT\b)[A-Z0-9_]+/.test(ln) &&
        !isDisabled(lines, i, "no-raw-process-env")
      ) {
        add(
          "no-raw-process-env",
          f,
          i + 1,
          "Direct process.env access in app/package code.",
          "Import the validated `env` (from ~/env or @gmacko/*/env) instead — it validates + types the var. Add it to the env schema if missing.",
        );
      }
    });
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
      /(authoriz|Bearer|secret|requireAdmin|isAdmin|NODE_ENV\s*!==\s*["']production["']|getSession|apiKey|unauthorized|401|403)/i.test(
        src,
      );
    if (!gated) {
      add(
        "gate-debug-routes",
        f,
        1,
        "Debug/verify/dev route with no visible auth/secret/non-prod gate.",
        "Require a bearer secret (fail closed if unset in prod) or restrict to non-production before capturing events / returning env info.",
      );
    }
  }
}

// ── Rule: no-partial-account-deletion ────────────────────────────────────────
// Account deletion must remove the auth `user` (which cascades sessions/apikeys),
// not just an app-specific table. Flags a delete on a users-like table in a
// deletion handler that never deletes the auth `user`.
function checkAccountDeletion() {
  for (const f of codeFiles) {
    const src = read(f);
    if (
      !/delete\s*Account|deleteCurrent|deleteUser|account.?deletion/i.test(src)
    )
      continue;
    const deletesAppUsers = /\.delete\((users|appUsers|profiles)\)/.test(src);
    const deletesAuthUser =
      /\.delete\((user)\)|deleteAuthUser|authClient\.deleteUser|api\.settings\.deleteAccount|settings\.deleteAccount/.test(
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
        "Delete the auth `user` (cascades sessions/accounts/apikeys) so credentials can no longer authenticate — App Store 5.1.1(v).",
      );
    }
  }
}

// ── Rule: no-db-transaction ──────────────────────────────────────────────────
// D1 has no interactive transactions: `@effect/sql-d1` turns `withTransaction`
// into a defect and the Database service removes `db.transaction`, so a call
// only "works" on the sqlite-node test layer and dies in production. Use
// `Database.batch` (atomic multi-statement) or a guarded write (`updateWhere`).
// Scope: the Effect packages and the Worker app; the legacy Postgres stack
// (`packages/legacy-*`, `apps/nextjs`) keeps its transactions until Phase 8.
const EFFECT_STACK_SCOPE = /^(packages\/(db|auth|api|domain)|apps\/web)\/src\//;
// A line that is only a comment: `//`, `*` (docblock body), or `/*`.
const isCommentLine = (ln) => /^\s*(\/\/|\*|\/\*)/.test(ln);
function checkDbTransaction() {
  for (const f of codeFiles) {
    const r = rel(f);
    if (!EFFECT_STACK_SCOPE.test(r)) continue;
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
const PLAIN_RULE_SCOPE = /^(packages\/(api|domain)|apps\/web)\/src\//;
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

checkRawProcessEnv();
checkHostIncludes();
checkCommittedCredentials();
checkDebugRoutes();
checkAccountDeletion();
checkDbTransaction();
checkPlainDrizzle();
checkD1TableRebuild();

const asJson = process.argv.includes("--json");
if (asJson) {
  console.log(
    JSON.stringify({ ok: violations.length === 0, violations }, null, 2),
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
