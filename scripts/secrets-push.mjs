#!/usr/bin/env node
/**
 * Pushes a stage's secrets from ForgeGraph into the web Worker.
 *
 *   pnpm secrets:push --stage staging|production [--only KEY,KEY] [--skip KEY,KEY] [--dry-run]
 *
 * ForgeGraph is the source of truth for stage secrets (`forge secret set
 * KEY --stage <stage>`); the Worker reads them as bindings through
 * `AppConfig.fromBindings`. This script lists the stage's keys
 * (`forge secret list --stage`), reads each value (`forge secret get`) and
 * hands it to `wrangler secret put KEY --env <stage>` on stdin, from
 * apps/web, so no value touches a shell argument or a file. Keys that are
 * not Worker bindings (the legacy `DATABASE_URL`, ForgeGraph's own `FG_*`)
 * are skipped by default; `--only` restricts to a list, `--skip` extends
 * the skip list. `--dry-run` prints the plan and pushes nothing.
 *
 * Needs `forge login` and either `wrangler login` or
 * CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in the environment.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = resolve(ROOT, "apps/web");
const STAGES = new Set(["staging", "production"]);

/** Never Worker secrets: read by other lanes or set by ForgeGraph itself. */
const DEFAULT_SKIP = new Set([
  "DATABASE_URL",
  "DATABASE_URL_LOCAL",
  "HYPERDRIVE_ID",
  "REDIS_URL",
  "FG_APP",
  "FG_STAGE",
  "FG_NODE",
  "FG_COMMIT_HASH",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
]);

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : (args[index + 1] ?? "");
};
const has = (name) => args.includes(name);
const list = (value) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const stage = flag("--stage");
if (!stage || !STAGES.has(stage)) {
  console.error(
    `usage: pnpm secrets:push --stage <${[...STAGES].join("|")}> [--only KEY,KEY] [--skip KEY,KEY] [--dry-run]`,
  );
  process.exit(2);
}
const dryRun = has("--dry-run");
const only = new Set(list(flag("--only")));
const skip = new Set([...DEFAULT_SKIP, ...list(flag("--skip"))]);

const forge = (forgeArgs, options = {}) => {
  const result = spawnSync("forge", forgeArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.error) {
    console.error(
      `forge is not on PATH (${result.error.message}); install @forgegraph/cli or use ~/.forgegraph/bin/fg`,
    );
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(result.stderr.trim());
    process.exit(result.status ?? 1);
  }
  return result.stdout;
};

/** `forge secret list --json` returns either an array of names or objects with a `key`/`name`. */
const parseKeys = (stdout) => {
  try {
    const parsed = JSON.parse(stdout);
    const items = Array.isArray(parsed)
      ? parsed
      : (parsed.secrets ?? parsed.keys ?? parsed.items ?? []);
    return items
      .map((item) =>
        typeof item === "string" ? item : (item.key ?? item.name ?? ""),
      )
      .filter(Boolean);
  } catch {
    // Plain listing: one key per line.
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));
  }
};

const keys = parseKeys(forge(["secret", "list", "--stage", stage, "--json"]))
  .filter((key) => (only.size === 0 ? true : only.has(key)))
  .filter((key) => !skip.has(key))
  .sort();

if (keys.length === 0) {
  console.error(`no secrets to push for stage "${stage}"`);
  process.exit(1);
}

console.log(
  `${dryRun ? "[dry-run] would push" : "pushing"} ${keys.length} secret(s) to Worker env "${stage}":`,
);
for (const key of keys) console.log(`  ${key}`);
if (dryRun) process.exit(0);

let failed = 0;
for (const key of keys) {
  const value = forge(["secret", "get", key, "--stage", stage]).replace(
    /\r?\n$/,
    "",
  );
  const put = spawnSync(
    "pnpm",
    ["exec", "wrangler", "secret", "put", key, "--env", stage],
    {
      cwd: APP_DIR,
      input: value,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    },
  );
  if (put.status === 0) {
    console.log(`  ✓ ${key}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${key}: ${put.stderr.trim() || put.stdout.trim()}`);
  }
}

if (failed > 0) {
  console.error(`${failed} secret(s) failed`);
  process.exit(1);
}
console.log(
  `done. The Worker picks the new values up on its next deploy or immediately for a running deployment (secrets are versioned with the Worker).`,
);
