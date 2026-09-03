/**
 * `pnpm dev:portless` prepares the Worker's environment before Vite starts:
 * `apps/web/.env` is linked to the repo-root `.env` (the step `predev`
 * does for plain `pnpm dev`, which `dev:portless` used to skip) and
 * `PORTLESS_URL` lands in `apps/web/.env.local`. `--check` runs that
 * preparation alone and fails when no `.env` came out of it. Exercised on
 * a throwaway repo tree, never the real one.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { prepare } from "../dev-portless.mjs";
import { linkEnv } from "../link-env.mjs";

const script = resolve(import.meta.dirname, "../dev-portless.mjs");
const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

/** A repo with `apps/web/` and, when given, a root `.env`. */
const tree = (rootEnv?: string) => {
  const root = mkdtempSync(join(tmpdir(), "gmacko-dev-portless-"));
  created.push(root);
  const appDir = join(root, "apps/web");
  mkdirSync(appDir, { recursive: true });
  if (rootEnv !== undefined) writeFileSync(join(root, ".env"), rootEnv);
  return { root, appDir };
};

const quiet = { log: () => {}, warn: () => {} };

describe("linkEnv", () => {
  it("links apps/web/.env to the repo-root .env, and is idempotent", () => {
    const { appDir } = tree("AUTH_SECRET=x\n");
    expect(linkEnv({ appDir, log: quiet })).toBe("linked");
    const appEnv = join(appDir, ".env");
    expect(lstatSync(appEnv).isSymbolicLink()).toBe(true);
    expect(readlinkSync(appEnv)).toBe("../../.env");
    expect(readFileSync(appEnv, "utf8")).toBe("AUTH_SECRET=x\n");
    expect(linkEnv({ appDir, log: quiet })).toBe("already-linked");
  });

  it("replaces a stale copied file with the link", () => {
    const { appDir } = tree("NEW=1\n");
    writeFileSync(join(appDir, ".env"), "OLD=1\n");
    expect(linkEnv({ appDir, log: quiet })).toBe("linked");
    expect(readFileSync(join(appDir, ".env"), "utf8")).toBe("NEW=1\n");
  });

  it("does nothing without a root .env", () => {
    const { appDir } = tree();
    expect(linkEnv({ appDir, log: quiet })).toBe("no-root-env");
    expect(existsSync(join(appDir, ".env"))).toBe(false);
  });
});

describe("prepare", () => {
  it("links .env and writes PORTLESS_URL to .env.local, keeping other lines", () => {
    const { appDir } = tree("A=1\n");
    writeFileSync(
      join(appDir, ".env.local"),
      "# written by scripts/dev-portless.mjs\nPORTLESS_URL=https://old\nKEEP=1\n",
    );
    const result = prepare({
      appDir,
      portlessUrl: "https://gmacko.localhost",
      log: quiet,
    });
    expect(result.envLinked).toBe(true);
    expect(readFileSync(join(appDir, ".env.local"), "utf8")).toBe(
      "# written by scripts/dev-portless.mjs for this `pnpm dev`; not committed\nPORTLESS_URL=https://gmacko.localhost\nKEEP=1\n",
    );
  });

  it("reports a missing .env and leaves .env.local alone without a URL", () => {
    const { appDir } = tree();
    const result = prepare({ appDir, portlessUrl: undefined, log: quiet });
    expect(result.envLinked).toBe(false);
    expect(existsSync(join(appDir, ".env.local"))).toBe(false);
  });
});

describe("dev-portless.mjs --check", () => {
  // `worker-configuration.d.ts` makes STAGE a required ProcessEnv key.
  const run = (appDir: string, env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [script, "--check", "--app-dir", appDir], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", STAGE: "development", ...env },
    });

  it("passes once apps/web/.env exists after the prep step", () => {
    const { appDir } = tree("A=1\n");
    const result = run(appDir, { PORTLESS_URL: "https://gmacko.localhost" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("apps/web/.env");
    expect(lstatSync(join(appDir, ".env")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(appDir, ".env.local"), "utf8")).toContain(
      "PORTLESS_URL=https://gmacko.localhost",
    );
  });

  it("fails, naming the fix, when no root .env exists", () => {
    const { appDir } = tree();
    const result = run(appDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no apps/web/.env");
    expect(result.stderr).toContain("pnpm dev:emulate");
  });
});
