#!/usr/bin/env node
/**
 * `vite dev` under portless (`pnpm dev:portless` → `portless gmacko node
 * scripts/dev-portless.mjs`).
 *
 * portless hands the app `PORT`, `HOST` and `PORTLESS_URL`
 * (https://gmacko.localhost) through the process environment, but nothing
 * in the process environment reaches the Worker: wrangler reads only the
 * `.env` files in this directory. So this script writes `PORTLESS_URL` to
 * `apps/web/.env.local` (gitignored, loaded after `.env`, so it wins), which
 * is how `AppConfig` learns the public origin for cookies, OAuth callbacks
 * and trusted origins, then starts Vite on portless's port and host.
 * Without portless (`pnpm -F @gmacko/web dev`) the file is not written and
 * the app runs on http://localhost:3001 as documented in the README.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envLocal = resolve(appDir, ".env.local");

const url = process.env.PORTLESS_URL;
const port = process.env.PORT ?? "3001";
const host = process.env.HOST ?? "127.0.0.1";

if (url) {
  const banner =
    "# written by scripts/dev-portless.mjs for this `pnpm dev`; not committed\n";
  const line = `PORTLESS_URL=${url}\n`;
  let current = "";
  try {
    current = readFileSync(envLocal, "utf8");
  } catch {
    // no file yet
  }
  const kept = current
    .split("\n")
    .filter(
      (l) =>
        l && !l.startsWith("PORTLESS_URL=") && !l.startsWith("# written by"),
    )
    .join("\n");
  writeFileSync(envLocal, `${banner}${line}${kept ? `${kept}\n` : ""}`);
  console.log(`[dev-portless] PORTLESS_URL=${url} → apps/web/.env.local`);
} else {
  console.warn(
    "[dev-portless] no PORTLESS_URL in the environment (run through `portless gmacko ...`); the Worker uses APP_URL / http://localhost:3001",
  );
}

const child = spawn(
  "pnpm",
  ["exec", "vite", "dev", "--port", port, "--host", host, "--strictPort"],
  { cwd: appDir, stdio: "inherit", env: process.env },
);
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
