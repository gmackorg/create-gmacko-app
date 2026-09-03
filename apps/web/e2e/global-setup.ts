/**
 * Before the suite: an empty, migrated and seeded local D1 in its own state
 * directory, and an emulated GitHub (for the OAuth journey) whose OAuth app
 * accepts the suite's callback URL.
 */
import { spawn } from "node:child_process";
import { mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { migrate, reset, seed } from "./helpers/db";
import {
  E2E_PORT,
  EMULATE_PORT,
  EMULATE_URL,
  REPO_DIR,
  STATE_DIR,
} from "./helpers/env";

const emulateSeed = (): string => {
  const source = readFileSync(resolve(REPO_DIR, "emulate.config.yaml"), "utf8");
  const callback = `http://localhost:${E2E_PORT}/api/auth/callback/github`;
  const marker = "      redirect_uris:\n";
  const github = source.indexOf("github:");
  const at = source.indexOf(marker, github);
  if (github < 0 || at < 0) {
    throw new Error("emulate.config.yaml: no github oauth_apps.redirect_uris");
  }
  const insertAt = at + marker.length;
  return `${source.slice(0, insertAt)}        - ${callback}\n${source.slice(insertAt)}`;
};

const waitFor = async (url: string, timeoutMs: number): Promise<void> => {
  const until = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < until) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
      last = response.status;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} did not come up: ${String(last)}`);
};

export default async function globalSetup(): Promise<void> {
  // Playwright starts the dev server before this runs and the server holds
  // the D1 file open, so the database is never deleted here: migrations are
  // applied forward (a no-op when current), the seed is an upsert, and the
  // reset empties every user-created row.
  mkdirSync(STATE_DIR, { recursive: true });
  migrate();
  seed();
  reset();

  const seedPath = resolve(STATE_DIR, "emulate.yaml");
  writeFileSync(seedPath, emulateSeed());
  const log = openSync(resolve(STATE_DIR, "emulate.log"), "w");
  const child = spawn(
    process.execPath,
    [
      resolve(REPO_DIR, "node_modules/@gmacko/emulate/dist/index.js"),
      "start",
      "--port",
      String(EMULATE_PORT),
      "--service",
      "github",
      "--seed",
      seedPath,
    ],
    { cwd: REPO_DIR, detached: true, stdio: ["ignore", log, log] },
  );
  child.unref();
  if (child.pid === undefined) throw new Error("emulate did not start");
  writeFileSync(resolve(STATE_DIR, "emulate.pid"), String(child.pid));
  await waitFor(`${EMULATE_URL}/login/oauth/authorize`, 20_000);
}
