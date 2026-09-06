#!/usr/bin/env node
/**
 * Rehearse `migrate:remote` against the local Cloudflare D1 emulator.
 *
 *   pnpm db:rehearse:remote
 *   node scripts/d1-remote-rehearsal.mjs [--port 4111] [--keep]
 *
 * `pnpm -F @gmacko/db migrate:remote` is the command that runs against a real
 * stage database during a deploy (scripts/deploy-stage.mjs step 1), and until
 * `@gmacko/emulate` 0.11 there was no way to execute it without a Cloudflare
 * account. This script starts `emulate --service cloudflare`, points wrangler
 * at it with `CLOUDFLARE_API_BASE_URL`, creates a throwaway database and runs
 * the real `wrangler d1 migrations apply DB --remote` against it.
 *
 * WHY THIS IS NOT A DUPLICATE OF `pnpm test:workers`
 *
 * That suite applies `packages/db/migrations/*.sql` to a Miniflare D1 the way
 * *local* wrangler does: wrangler reads each file, splits it on `;` and sends
 * the statements itself. `--remote` is a different execution path — wrangler
 * POSTs the file's SQL to the D1 HTTP API, which splits it server side and
 * runs the result as one atomic batch. The emulator is Miniflare over
 * workerd's SQLite, the same engine production D1 runs on, so a migration
 * that D1 rejects (or silently mis-applies, such as a drizzle table rebuild
 * whose `PRAGMA foreign_keys=OFF` is ignored) fails here the same way.
 *
 * WHAT IT DOES NOT COVER
 *
 * - `seed:remote` / `reset:remote` use `wrangler d1 execute --remote --file`,
 *   which goes through Cloudflare's four-phase import protocol. The emulator
 *   answers that with an explicit `not implemented` envelope, so those two
 *   scripts still have no rehearsal. `--remote --command` does work, and is
 *   what the assertions below use.
 * - drizzle-kit's `d1-http` driver hardcodes `api.cloudflare.com` with no
 *   base-URL override, so `drizzle-kit push`/`migrate`/`studio` cannot be
 *   pointed here. The supported path is `drizzle-kit generate` (offline) plus
 *   `wrangler d1 migrations apply`, which is exactly what `pnpm db:generate`
 *   and this script do.
 *
 * See docs/drizzle-migrations.md -> "Rehearsing a remote migration".
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DB_DIR = join(ROOT, "packages", "db");
const MIGRATIONS_DIR = join(DB_DIR, "migrations");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
};

const port = Number(flag("--port", process.env.EMULATE_PORT ?? "4111"));
const keep = args.includes("--keep");

/** Any account id works: the emulator namespaces by it and checks nothing. */
const ACCOUNT_ID = "d1-rehearsal";
const DATABASE_NAME = "d1-rehearsal";
const BASE_URL = `http://127.0.0.1:${port}/client/v4`;

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const emulate = spawn(
  join(ROOT, "node_modules", ".bin", "emulate"),
  ["start", "--service", "cloudflare", "--port", String(port)],
  { cwd: ROOT, stdio: keep ? "inherit" : "ignore" },
);
let emulateExited = false;
emulate.on("exit", () => {
  emulateExited = true;
});
const stopEmulate = () => {
  if (!emulateExited) emulate.kill("SIGTERM");
};
process.on("exit", stopEmulate);
process.on("SIGINT", () => process.exit(130));

/**
 * The emulator is ready when the D1 list endpoint answers with Cloudflare's
 * envelope. Polling the endpoint we actually use beats polling the port: a
 * bound socket does not mean the service is mounted.
 */
const waitForEmulator = async () => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (emulateExited) throw new Error("emulate exited before becoming ready");
    try {
      const response = await fetch(
        `${BASE_URL}/accounts/${ACCOUNT_ID}/d1/database`,
      );
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await sleep(200);
  }
  throw new Error(`emulate did not answer ${BASE_URL} within 20s`);
};

const createDatabase = async () => {
  const response = await fetch(
    `${BASE_URL}/accounts/${ACCOUNT_ID}/d1/database`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: DATABASE_NAME }),
    },
  );
  const body = await response.json();
  if (!body.success) {
    throw new Error(`d1 create failed: ${JSON.stringify(body.errors)}`);
  }
  return body.result.uuid;
};

/**
 * A throwaway wrangler config, because the committed one points `database_id`
 * at a placeholder uuid the emulator has never heard of. `migrations_dir` is
 * absolute so the file can live in a temp directory.
 */
const writeConfig = (databaseId) => {
  const dir = mkdtempSync(join(tmpdir(), "d1-rehearsal-"));
  const file = join(dir, "wrangler.json");
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        name: DATABASE_NAME,
        compatibility_date: "2026-08-22",
        d1_databases: [
          {
            binding: "DB",
            database_name: DATABASE_NAME,
            database_id: databaseId,
            migrations_dir: MIGRATIONS_DIR,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return { dir, file };
};

const wrangler = (config, ...rest) =>
  spawnSync(
    join(DB_DIR, "node_modules", ".bin", "wrangler"),
    [...rest, "--config", config],
    {
      cwd: DB_DIR,
      encoding: "utf8",
      env: {
        ...process.env,
        CLOUDFLARE_API_BASE_URL: BASE_URL,
        CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
        CLOUDFLARE_API_TOKEN: "d1-rehearsal-token",
      },
    },
  );

const query = (config, sql) => {
  const result = wrangler(
    config,
    "d1",
    "execute",
    "DB",
    "--remote",
    "--json",
    "--command",
    sql,
  );
  if (result.status !== 0) {
    throw new Error(`d1 execute failed: ${result.stderr || result.stdout}`);
  }
  // wrangler prints a banner before the JSON array; take from the first `[`.
  const json = result.stdout.slice(result.stdout.indexOf("["));
  return JSON.parse(json)[0].results;
};

const main = async () => {
  await waitForEmulator();
  const databaseId = await createDatabase();
  const { dir, file } = writeConfig(databaseId);
  try {
    const expected = readdirSync(MIGRATIONS_DIR).filter((name) =>
      name.endsWith(".sql"),
    ).length;
    console.log(
      `[rehearsal] emulate cloudflare on :${port}, database ${DATABASE_NAME} (${databaseId}), ${expected} migration(s)`,
    );

    const applied = wrangler(
      file,
      "d1",
      "migrations",
      "apply",
      "DB",
      "--remote",
    );
    process.stdout.write(applied.stdout);
    if (applied.status !== 0) {
      process.stderr.write(applied.stderr);
      fail("`wrangler d1 migrations apply --remote` exited non-zero");
      return;
    }

    const [{ n: recorded }] = query(
      file,
      "select count(*) as n from d1_migrations",
    );
    if (recorded !== expected) {
      fail(`d1_migrations recorded ${recorded} of ${expected} migration(s)`);
      return;
    }

    // The rebuild recipe drizzle-kit reaches for when it cannot express a
    // change as an ALTER leaves a `__new_<table>` behind if it half-applies.
    // docs/drizzle-migrations.md ("The D1 rule: never rebuild a table").
    const leftovers = query(
      file,
      "select name from sqlite_master where name like '__new_%'",
    );
    if (leftovers.length > 0) {
      fail(
        `table rebuild left ${leftovers.map((row) => row.name).join(", ")} behind`,
      );
      return;
    }

    // Re-running must be a no-op: that is what makes a failed deploy safe to
    // retry, and it is bookkeeping in `d1_migrations`, not in the SQL.
    const again = wrangler(file, "d1", "migrations", "apply", "DB", "--remote");
    if (
      again.status !== 0 ||
      !again.stdout.includes("No migrations to apply")
    ) {
      process.stderr.write(again.stdout + again.stderr);
      fail("re-applying migrations was not a no-op");
      return;
    }

    console.log(
      `✓ migrate:remote rehearsed: ${expected} migration(s) applied through the D1 HTTP API, re-apply is a no-op`,
    );
  } finally {
    if (!keep) rmSync(dir, { recursive: true, force: true });
  }
};

try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  stopEmulate();
}
