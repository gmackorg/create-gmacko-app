#!/usr/bin/env node
/**
 * The web lane's deploy sequence for one stage — migrate, then deploy:
 *
 *   pnpm deploy:staging | pnpm deploy:production
 *   node scripts/deploy-stage.mjs --stage <stage> [--migrate-only] [--dry-run]
 *
 * 1. `pnpm -F @gmacko/db migrate:remote --env <stage>` applies the pending
 *    D1 migrations to the stage's database (forward-only, expand/contract;
 *    see docs/drizzle-migrations.md). A failure aborts here: the Worker is
 *    not deployed against a schema it cannot rely on.
 * 2. `pnpm -F @gmacko/web deploy:<stage>` builds with CLOUDFLARE_ENV=<stage>
 *    and runs `wrangler deploy` (the Vite plugin's generated config for that
 *    environment).
 *
 * The same script is what ForgeGraph's deploy workflow runs for the stage
 * (deploy/forgegraph/deploy.yml, `.forgegraph.yaml` db.migrate), so a
 * migration failure aborts a ForgeGraph deploy too. `--dry-run` runs the
 * migration in `wrangler d1 migrations list` mode and the deploy with
 * `wrangler deploy --dry-run`, needing no Cloudflare credentials for the
 * latter.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STAGES = new Set(["preview", "staging", "production"]);

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : (args[index + 1] ?? "");
};
const has = (name) => args.includes(name);

const stage = flag("--stage") ?? process.env.FG_STAGE;
if (!stage || !STAGES.has(stage)) {
  console.error(
    `usage: node scripts/deploy-stage.mjs --stage <${[...STAGES].join("|")}> [--migrate-only] [--dry-run]`,
  );
  process.exit(2);
}
const dryRun = has("--dry-run");
const migrateOnly = has("--migrate-only");

const run = (label, command, commandArgs) => {
  console.log(`\n▶ ${label}\n  ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, CI: process.env.CI ?? "1" },
  });
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${result.status ?? "signal"})`);
    process.exit(result.status ?? 1);
  }
};

// 1. Migrate. `migrations list` is the credential-free dry run (it reads
//    the remote migrations table and reports what would be applied).
run(
  dryRun
    ? `pending D1 migrations for ${stage} (dry run)`
    : `apply D1 migrations to ${stage}`,
  "pnpm",
  [
    "-F",
    "@gmacko/db",
    dryRun ? "migrate:list" : "migrate:remote",
    "--env",
    stage,
  ],
);
if (migrateOnly) {
  console.log("\n✓ migrations done (--migrate-only)");
  process.exit(0);
}

// 2. Deploy, only once the schema is in place.
run(dryRun ? `deploy ${stage} (dry run)` : `deploy ${stage}`, "pnpm", [
  "-F",
  "@gmacko/web",
  dryRun ? `deploy:${stage}:dry-run` : `deploy:${stage}`,
]);
console.log(`\n✓ ${stage}: migrated and deployed`);
