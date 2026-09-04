#!/usr/bin/env node
/**
 * Entry point for `pnpm test:fault` (the CloudFault lane).
 *
 * The lane needs `@gmacko/cloudfault`, which is not on npm yet. Until it is,
 * this script resolves the package three ways, in order:
 *
 *  1. a normal dependency — once `@gmacko/cloudfault` is published and added
 *     to apps/web's devDependencies, nothing else here runs;
 *  2. `CLOUDFAULT_SRC=/path/to/cloudfault` — a local checkout of the
 *     cloudfault monorepo whose `packages/*\/dist` are already built
 *     (`npm run build` in that repo). A facade package with the published
 *     subpath layout is written into the repo's node_modules so both vitest
 *     and `tsc -p apps/web/tsconfig.fault.json` resolve it exactly as they
 *     will resolve the published package;
 *  3. neither — the lane reports itself unavailable and exits 0, unless
 *     `CLOUDFAULT_REQUIRED=1`, which makes the same situation an error.
 *
 * Flip `CLOUDFAULT_REQUIRED=1` in .github/workflows/ci.yml the day
 * `@gmacko/cloudfault` lands on npm; that is the whole migration.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import process from "node:process";

/** Subpath -> the cloudfault workspace package that backs it. */
const SUBPATHS = {
  ".": "core",
  "./cloudflare": "cloudflare",
  "./adapter-sdk": "adapter-sdk",
  "./stripe": "stripe",
  "./adapters": "adapters",
  "./fast-check": "fast-check",
};

const require_ = createRequire(import.meta.url);
const repoRoot = resolve(import.meta.dirname, "../../..");

const resolves = () => {
  try {
    require_.resolve("@gmacko/cloudfault");
    return true;
  } catch {
    return false;
  }
};

/**
 * Writes `node_modules/@gmacko/cloudfault`: one re-export file per published
 * subpath, pointing at the built `dist` of the corresponding `@cloudfault/*`
 * package. The shape (not the contents) is what the published package will
 * have, so import specifiers in fault/ never have to change.
 */
const linkLocalCheckout = (src) => {
  const missing = Object.values(SUBPATHS)
    .map((pkg) => join(src, "packages", pkg, "dist", "index.js"))
    .filter((file) => !existsSync(file));
  if (missing.length > 0) {
    throw new Error(
      `CLOUDFAULT_SRC=${src} is not built. Run \`npm run build\` there first. Missing:\n  ${missing.join("\n  ")}`,
    );
  }
  const dir = join(repoRoot, "node_modules", "@gmacko", "cloudfault");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const exports = {};
  for (const [subpath, pkg] of Object.entries(SUBPATHS)) {
    const name = subpath === "." ? "index" : subpath.slice(2);
    const from = join(src, "packages", pkg, "dist", "index.js");
    writeFileSync(join(dir, `${name}.js`), `export * from ${JSON.stringify(from)};\n`);
    writeFileSync(join(dir, `${name}.d.ts`), `export * from ${JSON.stringify(from)};\n`);
    exports[subpath] = { types: `./${name}.d.ts`, import: `./${name}.js` };
  }
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "@gmacko/cloudfault", version: "0.0.0-local", type: "module", exports }, null, 2)}\n`,
  );
  return dir;
};

const src = process.env.CLOUDFAULT_SRC;
if (!resolves()) {
  if (src) {
    const dir = linkLocalCheckout(resolve(src));
    console.log(`[fault] linked @gmacko/cloudfault -> ${dir} (CLOUDFAULT_SRC)`);
  } else {
    const message =
      "[fault] lane unavailable: @gmacko/cloudfault is not installed.\n" +
      "[fault]   published:   add @gmacko/cloudfault to apps/web devDependencies\n" +
      "[fault]   local dev:   CLOUDFAULT_SRC=/path/to/cloudfault pnpm test:fault\n" +
      "[fault] See docs/FAULT_TESTING.md.";
    if (process.env.CLOUDFAULT_REQUIRED === "1") {
      console.error(message);
      process.exit(1);
    }
    console.log(message);
    process.exit(0);
  }
}

const { status } = spawnSync(
  "vitest",
  ["run", "--config", "vitest.fault.config.ts", ...process.argv.slice(2)],
  { cwd: resolve(import.meta.dirname, ".."), stdio: "inherit", shell: process.platform === "win32" },
);
process.exit(status ?? 1);
