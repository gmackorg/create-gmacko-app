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

const d1 = (args: ReadonlyArray<string>): string =>
  execFileSync(
    wrangler,
    [
      "d1",
      ...args,
      "--local",
      "--persist-to",
      STATE_DIR,
      "--config",
      resolve(APP_DIR, "wrangler.jsonc"),
    ],
    {
      cwd: APP_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    },
  );

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

/** Empties every user-created row; the seeded plans, meters and settings row stay. */
export const reset = (): void => {
  mkdirSync(STATE_DIR, { recursive: true });
  const path = resolve(STATE_DIR, "reset.sql");
  writeFileSync(path, RESET_SQL);
  runFile(path);
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
