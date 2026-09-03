#!/usr/bin/env node
/**
 * Points `apps/web/.env` at the repo-root `.env` before `vite dev`.
 *
 * Wrangler (and the Cloudflare Vite plugin, which delegates to it) load
 * `.env` / `.env.local` from the directory of `wrangler.jsonc`, never from
 * the repository root, and `process.env` is not copied into the Worker
 * unless `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` is set. emulate writes the
 * repo-root `.env`; this link is what lets the Worker read it without the
 * process-env bridge. A symlink keeps the two in sync; where symlinks are
 * unavailable the file is copied instead (and must be re-linked after the
 * root `.env` changes).
 */
import {
  copyFileSync,
  existsSync,
  lstatSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootEnv = resolve(appDir, "../../.env");
const appEnv = resolve(appDir, ".env");
const linkTarget = "../../.env";

if (!existsSync(rootEnv)) {
  console.warn(
    "[link-env] no repo-root .env; the Worker starts with wrangler.jsonc vars only (run `pnpm dev:emulate` or copy .env.example)",
  );
  process.exit(0);
}

let current;
try {
  current = lstatSync(appEnv);
} catch {
  current = undefined;
}

if (current?.isSymbolicLink()) {
  process.exit(0);
}
if (current !== undefined) {
  // A real file left by an earlier copy (or by hand): replace it with the link.
  unlinkSync(appEnv);
}
try {
  symlinkSync(linkTarget, appEnv);
} catch {
  copyFileSync(rootEnv, appEnv);
  console.warn(
    "[link-env] symlink unavailable; copied ../../.env to apps/web/.env",
  );
}
