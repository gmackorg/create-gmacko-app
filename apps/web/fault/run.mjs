#!/usr/bin/env node
/**
 * Entry point for `pnpm test:fault` (the CloudFault lane).
 *
 * `@gmacko/cloudfault` is a declared devDependency of this app, so on any
 * healthy checkout the lane just runs. This wrapper exists for the one thing
 * `vitest run` cannot say for itself: if the package does not resolve, the
 * lane is *not running*, and a lane that is not running must not look like a
 * lane that passed. So a missing package is an error, not a skip.
 *
 * `CLOUDFAULT_REQUIRED=0` is the only escape hatch, for a checkout that is
 * deliberately installed without optional dev dependencies. CI sets
 * `CLOUDFAULT_REQUIRED=1` explicitly in .github/workflows/{ci,fault}.yml so
 * the intent is visible at the job, not inherited from a default.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

/**
 * ESM resolution, not `require.resolve`: the package is ESM-only, so its
 * export map has no `require` condition and CJS resolution would report a
 * package that is installed and working as missing.
 */
const resolves = () => {
  try {
    import.meta.resolve("@gmacko/cloudfault");
    return true;
  } catch {
    return false;
  }
};

if (!resolves()) {
  const message =
    "[fault] lane unavailable: @gmacko/cloudfault does not resolve.\n" +
    "[fault]   it is a devDependency of @gmacko/web — run `pnpm install`.\n" +
    "[fault] See docs/FAULT_TESTING.md.";
  if (process.env.CLOUDFAULT_REQUIRED === "0") {
    // oxlint-disable-next-line no-console -- lane runner output
    console.log(
      `${message}\n[fault] CLOUDFAULT_REQUIRED=0, so this is a skip.`,
    );
    process.exit(0);
  }
  // oxlint-disable-next-line no-console -- lane runner output
  console.error(message);
  process.exit(1);
}

const { status } = spawnSync(
  "vitest",
  ["run", "--config", "vitest.fault.config.ts", ...process.argv.slice(2)],
  {
    cwd: resolve(import.meta.dirname, ".."),
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);
process.exit(status ?? 1);
