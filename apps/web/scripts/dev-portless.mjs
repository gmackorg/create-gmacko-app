#!/usr/bin/env node
/**
 * `vite dev` under portless (`pnpm dev:portless` → `portless gmacko node
 * scripts/dev-portless.mjs`).
 *
 * Before Vite starts, the Worker's environment is prepared (`prepare`):
 *
 * 1. `apps/web/.env` is linked to the repo-root `.env` (`link-env.mjs`, the
 *    same step `predev` runs for plain `pnpm dev`; pnpm runs no `pre` hook
 *    for `dev:portless`, so it is done here explicitly).
 * 2. portless hands the app `PORT`, `HOST` and `PORTLESS_URL`
 *    (https://gmacko.localhost) through the process environment, but nothing
 *    in the process environment reaches the Worker: wrangler reads only the
 *    `.env` files in this directory. So `PORTLESS_URL` is written to
 *    `apps/web/.env.local` (gitignored, loaded after `.env`, so it wins),
 *    which is how `AppConfig` learns the public origin for cookies, OAuth
 *    callbacks and trusted origins.
 *
 * Then Vite starts on portless's port and host. Without portless
 * (`pnpm -F @gmacko/web dev`) `.env.local` is not written and the app runs
 * on http://localhost:3001 as documented in the README.
 *
 * `--check` runs the preparation only and exits 1 when no `apps/web/.env`
 * came out of it (no repo-root `.env`): the Worker would boot with
 * wrangler.jsonc vars alone. `--app-dir <dir>` points both at another
 * `apps/web` (tests).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defaultAppDir, linkEnv } from "./link-env.mjs";

const BANNER =
  "# written by scripts/dev-portless.mjs for this `pnpm dev`; not committed\n";

/**
 * Writes `PORTLESS_URL=<url>` to `<appDir>/.env.local`, keeping every
 * other line of the file.
 *
 * @param {string} appDir
 * @param {string} url
 */
const writePortlessUrl = (appDir, url) => {
  const envLocal = resolve(appDir, ".env.local");
  let current = "";
  try {
    current = readFileSync(envLocal, "utf8");
  } catch {
    // no file yet
  }
  const kept = current
    .split("\n")
    .filter(
      (line) =>
        line &&
        !line.startsWith("PORTLESS_URL=") &&
        !line.startsWith("# written by"),
    )
    .join("\n");
  writeFileSync(
    envLocal,
    `${BANNER}PORTLESS_URL=${url}\n${kept ? `${kept}\n` : ""}`,
  );
};

/**
 * The preparation step: link `.env`, record `PORTLESS_URL`. Returns whether
 * `<appDir>/.env` exists afterwards (so the Worker will see the root `.env`).
 *
 * @param {{ appDir?: string, portlessUrl: string | undefined, log?: { log(m: string): void, warn(m: string): void } }} options
 * @returns {{ envLinked: boolean, appEnv: string }}
 */
export const prepare = ({
  appDir = defaultAppDir,
  portlessUrl,
  log = console,
}) => {
  linkEnv({ appDir, log });
  if (portlessUrl) {
    writePortlessUrl(appDir, portlessUrl);
    log.log(`[dev-portless] PORTLESS_URL=${portlessUrl} → apps/web/.env.local`);
  } else {
    log.warn(
      "[dev-portless] no PORTLESS_URL in the environment (run through `portless gmacko ...`); the Worker uses APP_URL / http://localhost:3001",
    );
  }
  const appEnv = resolve(appDir, ".env");
  return { envLinked: existsSync(appEnv), appEnv };
};

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const appDirIndex = args.indexOf("--app-dir");
  const appDir =
    appDirIndex === -1 ? defaultAppDir : resolve(args[appDirIndex + 1] ?? ".");
  const check = args.includes("--check");

  const prepared = prepare({ appDir, portlessUrl: process.env.PORTLESS_URL });

  if (check) {
    if (prepared.envLinked) {
      console.log(
        `[dev-portless] ok: apps/web/.env is in place (${prepared.appEnv})`,
      );
      process.exit(0);
    }
    console.error(
      "[dev-portless] no apps/web/.env after the prep step: the Worker would boot with wrangler.jsonc vars only. Run `pnpm dev:emulate` (writes the repo-root .env) or copy .env.example to .env, then retry.",
    );
    process.exit(1);
  }

  const port = process.env.PORT ?? "3001";
  const host = process.env.HOST ?? "127.0.0.1";
  const child = spawn(
    "pnpm",
    ["exec", "vite", "dev", "--port", port, "--host", host, "--strictPort"],
    { cwd: appDir, stdio: "inherit", env: process.env },
  );
  child.on("exit", (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
  for (const sig of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
    process.on(sig, () => child.kill(sig));
  }
}
