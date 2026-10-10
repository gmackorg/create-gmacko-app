/**
 * The suite's window onto the local D1: `wrangler d1 execute` against the
 * same persisted state the dev server uses (`--persist-to` = the Vite
 * plugin's `persistState`). Slow-ish (a wrangler process per call), so
 * specs call it a handful of times: a reset at the start, a lookup or an
 * assertion at the end.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { APP_DIR, REPO_DIR, STATE_DIR } from "./env";

const wrangler = resolve(APP_DIR, "node_modules/.bin/wrangler");

const D1_ATTEMPTS = 3;

const TRANSIENT_D1_FAILURE = [
  "fetch failed",
  "connectivity issue",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "SQLITE_BUSY",
  "database is locked",
];

interface CommandFailure extends Error {
  readonly stdout?: string | Buffer;
  readonly stderr?: string | Buffer;
}

const sleep = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const streamText = (value: string | Buffer | undefined): string => {
  if (value == null) return "";
  return String(value).trim();
};

/**
 * Local `d1 execute` starts a short-lived workerd. A refused socket and a
 * dropped DNS lookup both come back as `fetch failed`, often with empty
 * stderr. Those are worth another try. Output from wrangler is a real failure.
 */
const d1 = (args: ReadonlyArray<string>): string => {
  const command = [
    "d1",
    ...args,
    "--local",
    "--persist-to",
    STATE_DIR,
    "--config",
    resolve(APP_DIR, "wrangler.jsonc"),
  ];
  let failure = "wrangler d1 failed";
  for (let attempt = 1; attempt <= D1_ATTEMPTS; attempt += 1) {
    try {
      return execFileSync(wrangler, command, {
        cwd: APP_DIR,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
      });
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      const failureError: CommandFailure = error;
      const stdout = streamText(failureError.stdout);
      const stderr = streamText(failureError.stderr);
      const cause =
        failureError.cause instanceof Error ? failureError.cause.message : "";
      failure = [failureError.message, stdout, stderr, cause]
        .filter((part) => part.length > 0)
        .join("\n");
      const transient =
        (stdout.length === 0 && stderr.length === 0) ||
        TRANSIENT_D1_FAILURE.some((needle) => failure.includes(needle));
      if (!transient || attempt === D1_ATTEMPTS) throw new Error(failure);
      sleep(400 * attempt);
    }
  }
  throw new Error(failure);
};

interface ExecuteResult<Row> {
  readonly results: ReadonlyArray<Row>;
}

/** Runs one statement and returns its rows. */
export const query = <T extends Record<string, unknown>>(
  sql: string,
): ReadonlyArray<T> => {
  const out = d1(["execute", "DB", "--json", "--command", sql]);
  // SAFETY: `wrangler d1 execute --json` prints one `{ results: [...] }` per
  // statement, and `sql` is a single statement, so element 0 is this query's
  // rows; `T` is the row shape the caller's own SELECT list produces.
  const parsed = JSON.parse(out) as ReadonlyArray<ExecuteResult<T>>;
  return parsed[0]?.results ?? [];
};

/** Runs statements from a file (many statements, one wrangler call). */
export const runFile = (path: string): void => {
  d1(["execute", "DB", "--file", path]);
};

/** `wrangler d1 migrations apply`, the same command as `pnpm -F @gmacko/db migrate:local`. */
export const migrate = (): void => {
  d1(["migrations", "apply", "DB"]);
};

/** The checked-in seed (`packages/db/seed/seed.sql`, what `seed:local` applies). */
export const seed = (): void => {
  runFile(resolve(REPO_DIR, "packages/db/seed/seed.sql"));
};

const RESET_SQL = `
delete from post;
delete from api_keys;
delete from user_preferences;
delete from waitlist_entry;
delete from workspace_invite_allowlist;
delete from workspace_membership;
delete from workspace_subscription;
delete from workspace_usage_rollup;
update application_settings set setup_completed_at = null, setup_completed_by_user_id = null, initial_workspace_id = null, maintenance_mode = 0, signup_enabled = 1, announcement_message = null, announcement_tone = 'info', allowed_email_domains = '[]';
delete from workspace;
delete from session;
delete from account;
delete from verification;
delete from user;
`;

/**
 * The product UI reads Forge posts from the host on :8787, not the web D1
 * `post` table. Drop those rows too, or a later spec counts leftovers.
 * Global setup calls `reset` before that host is listening, so a refused
 * connection is skipped. A host that answers and then fails still throws.
 */
const clearForgePosts = (): void => {
  const script = `
const headers = {
  accept: "application/json",
  "x-forge-tenant": "local",
  "x-forge-actor": "web",
};
const origin = "http://127.0.0.1:8787";
try {
  for (let round = 0; round < 20; round += 1) {
    const list = await fetch(origin + "/v1/posts", { headers });
    if (!list.ok) throw new Error("forge list failed: " + list.status);
    const body = await list.json();
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) break;
    for (const item of items) {
      if (typeof item.id !== "string" || item.id.length === 0) continue;
      const del = await fetch(
        origin + "/v1/posts/" + encodeURIComponent(item.id),
        { method: "DELETE", headers },
      );
      if (!del.ok && del.status !== 404) {
        throw new Error("forge delete failed: " + del.status);
      }
    }
  }
} catch (error) {
  const code = error && error.cause && error.cause.code;
  if (code === "ECONNREFUSED") process.exit(0);
  throw error;
}
`;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
};

/** Empties every user-created row; the seeded plans, meters and settings row stay. */
export const reset = (): void => {
  mkdirSync(STATE_DIR, { recursive: true });
  const path = resolve(STATE_DIR, "reset.sql");
  writeFileSync(path, RESET_SQL);
  runFile(path);
  clearForgePosts();
};

const literal = (value: string): string => `'${value.replaceAll("'", "''")}'`;

/** The token of the latest magic link sent to `email` (better-auth stores it as the verification identifier). */
export const magicLinkToken = (email: string): string => {
  const rows = query<{ identifier: string }>(
    `select identifier from verification where value like ${literal(`%"email":"${email.toLowerCase()}"%`)} order by created_at desc limit 1`,
  );
  const token = rows[0]?.identifier;
  if (!token) throw new Error(`no magic link was recorded for ${email}`);
  return token;
};

export const countRows = (table: string, where?: string): number => {
  const rows = query<{ n: number }>(
    `select count(*) as n from ${table}${where ? ` where ${where}` : ""}`,
  );
  return Number(rows[0]?.n ?? 0);
};

export const userByEmail = (email: string) =>
  query<{ id: string; role: string }>(
    `select id, role from user where email = ${literal(email.toLowerCase())}`,
  )[0];

export const setUserRole = (email: string, role: "user" | "admin"): void => {
  query(
    `update user set role = ${literal(role)} where email = ${literal(email.toLowerCase())}`,
  );
};

export const setMaintenanceMode = (on: boolean): void => {
  query(`update application_settings set maintenance_mode = ${on ? 1 : 0}`);
};

export const inviteIdFor = (email: string): string => {
  const row = query<{ id: string }>(
    `select id from workspace_invite_allowlist where email = ${literal(email.toLowerCase())}`,
  )[0];
  if (!row) throw new Error(`no invite for ${email}`);
  return row.id;
};
