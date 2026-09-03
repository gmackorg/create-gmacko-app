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
 *
 * Run as the `predev` script, and imported by `dev-portless.mjs` (which
 * has no `pre` hook) as `linkEnv`.
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

/** apps/web: the Vite root and wrangler config directory. */
export const defaultAppDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

const linkTarget = "../../.env";

/**
 * Links `<appDir>/.env` to `<appDir>/../../.env`. Returns what happened:
 * `no-root-env` (nothing to link; the Worker starts with wrangler.jsonc
 * vars only), `already-linked`, `linked`, or `copied` (no symlink support).
 *
 * @param {{ appDir?: string, log?: { warn(message: string): void } }} [options]
 * @returns {"no-root-env" | "already-linked" | "linked" | "copied"}
 */
export const linkEnv = ({ appDir = defaultAppDir, log = console } = {}) => {
  const rootEnv = resolve(appDir, linkTarget);
  const appEnv = resolve(appDir, ".env");

  if (!existsSync(rootEnv)) {
    log.warn(
      "[link-env] no repo-root .env; the Worker starts with wrangler.jsonc vars only (run `pnpm dev:emulate` or copy .env.example)",
    );
    return "no-root-env";
  }

  let current;
  try {
    current = lstatSync(appEnv);
  } catch {
    current = undefined;
  }

  if (current?.isSymbolicLink()) {
    return "already-linked";
  }
  if (current !== undefined) {
    // A real file left by an earlier copy (or by hand): replace it with the link.
    unlinkSync(appEnv);
  }
  try {
    symlinkSync(linkTarget, appEnv);
    return "linked";
  } catch {
    copyFileSync(rootEnv, appEnv);
    log.warn(
      "[link-env] symlink unavailable; copied ../../.env to apps/web/.env",
    );
    return "copied";
  }
};

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  linkEnv();
}
