/**
 * E2E Integration Tests for create-gmacko-app
 *
 * These tests verify that a generated app works out of the box:
 * - Dependencies install successfully
 * - TypeScript compiles without errors
 * - Linting and the app standards pass
 * - The Worker builds (Vite + Cloudflare plugin) and the local D1 migrates
 *
 * These tests are SLOW (5-15 minutes each) and should be run:
 * - On release branches
 * - Nightly in CI
 * - Manually before publishing to npm
 *
 * Run with: RUN_E2E=true pnpm e2e:cli:full
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cleanupApp,
  createMockEnv,
  ensureCliBuilt,
  ensureTempDir,
  fileExists,
  generateAppName,
  readFile,
  runCli,
  runInApp,
} from "./helpers.js";

// Skip these tests unless explicitly running E2E
const SKIP_E2E = process.env.RUN_E2E !== "true";

/** Print a failed step's output so the CI log says why. */
function logFailure(label: string, result: { stdout: string; stderr: string }) {
  console.error(`[E2E] ${label} failed:`);
  console.error(result.stderr || result.stdout);
}

/**
 * Replace every resolved `node_modules/.bin/<bin>` in the app with a fake
 * that echoes its arguments. pnpm prepends `.bin` when running scripts, so a
 * PATH-only fake never wins; overwriting the resolved bin does. Returns a
 * restore function.
 */
function swapBin(appPath: string, bin: string, fakeName: string): () => void {
  const swapped = execSync(`find . -path '*/node_modules/.bin/${bin}'`, {
    cwd: appPath,
    encoding: "utf-8",
  })
    .split("\n")
    .filter(Boolean)
    .map((rel) => {
      const full = path.join(appPath, rel);
      const backup = `${full}.real`;
      fs.renameSync(full, backup);
      fs.writeFileSync(full, `#!/bin/sh\necho "${fakeName} $@"\n`, {
        mode: 0o755,
      });
      return { full, backup };
    });
  return () => {
    for (const { full, backup } of swapped) {
      fs.rmSync(full, { force: true });
      fs.renameSync(backup, full);
    }
  };
}

describe.skipIf(SKIP_E2E)("create-gmacko-app E2E", () => {
  let tempDir: string;
  const appsToClean: string[] = [];

  beforeAll(() => {
    ensureCliBuilt();
    tempDir = ensureTempDir();
    console.log(`E2E tests using temp directory: ${tempDir}`);
  });

  afterAll(() => {
    // Clean up all test apps (comment out for debugging)
    if (process.env.KEEP_TEST_APPS !== "true") {
      for (const appPath of appsToClean) {
        cleanupApp(appPath);
      }
    }
  });

  describe("default configuration (web + mobile)", () => {
    let appPath: string;
    let appName: string;

    beforeAll(async () => {
      appName = generateAppName("e2e-default");
      console.log(`\n[E2E] Scaffolding ${appName}...`);

      const result = await runCli({
        appName,
        flags: ["--yes", "--no-git"],
        cwd: tempDir,
        timeout: 600000, // 10 minutes for clone + install
      });

      appPath = result.appPath;
      appsToClean.push(appPath);

      expect(result.exitCode).toBe(0);
      console.log(`[E2E] Scaffolded to ${appPath}`);
    }, 900000); // 15 minute timeout for beforeAll

    it("should have valid package structure", () => {
      expect(fileExists(appPath, "package.json")).toBe(true);
      expect(fileExists(appPath, "pnpm-workspace.yaml")).toBe(true);
      expect(fileExists(appPath, "turbo.json")).toBe(true);
      expect(fileExists(appPath, "node_modules")).toBe(true);
      expect(fileExists(appPath, "apps/web")).toBe(true);
      expect(fileExists(appPath, "apps/expo")).toBe(true);
      expect(fileExists(appPath, "apps/nextjs")).toBe(false);
      expect(fileExists(appPath, "packages/legacy-db")).toBe(false);
    });

    it("should pass typecheck", () => {
      console.log("[E2E] Running typecheck...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm typecheck", {
        timeout: 300000, // 5 minutes
      });

      if (!result.success) logFailure("Typecheck", result);
      expect(result.success).toBe(true);
    }, 600000);

    it("should pass lint and the app standards", () => {
      console.log("[E2E] Running lint + check:standards...");

      const result = runInApp(appPath, "pnpm lint && pnpm check:standards", {
        timeout: 300000, // 5 minutes
      });

      if (!result.success) logFailure("Lint", result);
      expect(result.success).toBe(true);
    }, 600000);

    it("should build successfully", () => {
      console.log("[E2E] Running build...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm build", {
        timeout: 600000, // 10 minutes
      });

      if (!result.success) logFailure("Build", result);
      expect(result.success).toBe(true);
      // The Worker bundle Vite emits for wrangler.
      expect(fileExists(appPath, "apps/web/dist")).toBe(true);
    }, 900000);

    it("should migrate and seed the local D1, then pass the Workers tests", () => {
      console.log("[E2E] Running D1 migrate + seed + test:workers...");
      createMockEnv(appPath);

      const result = runInApp(
        appPath,
        "pnpm db:migrate:local && pnpm db:seed && pnpm test:workers",
        { timeout: 600000 },
      );

      if (!result.success) logFailure("D1 migrate/seed/test:workers", result);
      expect(result.success).toBe(true);
    }, 900000);

    it("should exercise ForgeGraph repo-local scripts", () => {
      console.log("[E2E] Running ForgeGraph script smoke test...");
      createMockEnv(appPath);

      // The real @forgegraph/cli is installed, and its `forge` bin in
      // node_modules/.bin shadows any PATH fake. Temporarily swap the resolved
      // forge bin(s) for a fake so we can assert the forge:* scripts pass the
      // right args, then restore the real bin for the sibling test.
      const restore = swapBin(appPath, "forge", "fake-forge");

      try {
        const result = runInApp(
          appPath,
          "pnpm forge:stages && pnpm forge:deploy:staging && pnpm forge:deploy:production",
          { timeout: 120000 },
        );

        if (!result.success) logFailure("ForgeGraph scripts", result);
        expect(result.success).toBe(true);
        expect(result.stdout).toContain("fake-forge stage list");
        expect(result.stdout).toContain(
          "fake-forge deploy create staging --wait",
        );
        expect(result.stdout).toContain(
          "fake-forge deploy create production --wait",
        );
      } finally {
        restore();
      }
    }, 180000);

    it("should resolve forge from the local repo install", () => {
      console.log("[E2E] Verifying local forge CLI resolution...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm exec forge version", {
        timeout: 120000,
      });

      if (!result.success) logFailure("Local forge CLI resolution", result);
      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toMatch(/forge \d+\./);
    }, 180000);

    it("should run the migrate-then-deploy stage script against a fake wrangler", () => {
      console.log("[E2E] Running fake deploy:staging...");
      createMockEnv(appPath);

      // scripts/deploy-stage.mjs applies the D1 migrations (`wrangler d1
      // migrations apply --remote`) and then builds + deploys the Worker.
      // Swap wrangler for a fake so no Cloudflare credentials are needed and
      // assert the sequence reaches `wrangler deploy`.
      const restore = swapBin(appPath, "wrangler", "fake-wrangler");
      try {
        const result = runInApp(appPath, "pnpm deploy:staging", {
          timeout: 600000,
        });

        if (!result.success) logFailure("Fake deploy:staging", result);
        expect(result.success).toBe(true);
        expect(result.stdout).toContain("fake-wrangler d1 migrations apply");
        expect(result.stdout).toContain("fake-wrangler deploy");
        expect(result.stdout.indexOf("d1 migrations apply")).toBeLessThan(
          result.stdout.indexOf("fake-wrangler deploy"),
        );
      } finally {
        restore();
      }
    }, 900000);

    it("should complete auth and db bootstrap commands", () => {
      console.log("[E2E] Running auth/db bootstrap checks...");
      createMockEnv(appPath);

      const authResult = runInApp(appPath, "pnpm auth:generate", {
        timeout: 300000,
      });

      if (!authResult.success) logFailure("Auth generate", authResult);
      expect(authResult.success).toBe(true);
      // The CLI output lands in .cache for reconciliation; the committed,
      // hand-maintained schema is never overwritten (its v1 `relations()`
      // blocks would not even load under drizzle-orm 1.0).
      expect(
        fileExists(appPath, "packages/db/.cache/auth-schema.generated.ts"),
      ).toBe(true);
      expect(readFile(appPath, "packages/db/src/auth-schema.ts")).toContain(
        "hand-maintained",
      );

      // `db:generate` (drizzle-kit generate + flatten) is a no-op on a clean
      // schema; `db:check` proves the checked-in snapshots are consistent.
      const dbResult = runInApp(appPath, "pnpm db:generate && pnpm db:check", {
        timeout: 300000,
      });

      if (!dbResult.success) logFailure("DB generate/check", dbResult);
      expect(dbResult.success).toBe(true);
      const migrations = fs.readdirSync(
        path.join(appPath, "packages/db/migrations"),
      );
      expect(migrations.some((file) => file.endsWith(".sql"))).toBe(true);
    }, 600000);

    it("should keep the health contract in the domain package", () => {
      const healthApi = readFile(appPath, "packages/domain/src/health/api.ts");
      expect(healthApi).toContain("forge-health");
      expect(healthApi).toContain("/api/health/live");
      expect(healthApi).toContain("/api/health/ready");
    });
  });

  describe("minimal configuration (web only, pruned)", () => {
    let appPath: string;
    let appName: string;

    beforeAll(async () => {
      appName = generateAppName("e2e-minimal");
      console.log(`\n[E2E] Scaffolding minimal ${appName}...`);

      const result = await runCli({
        appName,
        flags: [
          "--yes",
          "--no-git",
          "--no-mobile",
          "--no-ai",
          "--prune",
          "--integrations",
          "", // No integrations
        ],
        cwd: tempDir,
        timeout: 600000,
      });

      appPath = result.appPath;
      appsToClean.push(appPath);

      expect(result.exitCode).toBe(0);
      console.log(`[E2E] Scaffolded to ${appPath}`);
    }, 900000);

    it("should have web-only structure", () => {
      expect(fileExists(appPath, "apps/web")).toBe(true);
      expect(fileExists(appPath, "apps/expo")).toBe(false);
      expect(fileExists(appPath, "packages/analytics")).toBe(false);
      expect(fileExists(appPath, "packages/monitoring")).toBe(false);
      expect(fileExists(appPath, "packages/payments")).toBe(false);
    });

    it("should pass the doctor and fast checks", () => {
      console.log("[E2E] Running doctor + check:fast (minimal)...");
      createMockEnv(appPath);

      const doctor = runInApp(appPath, "pnpm run doctor", { timeout: 120000 });
      if (!doctor.success) logFailure("Doctor", doctor);
      expect(doctor.success).toBe(true);
      expect(doctor.stdout).toContain("Cloudflare Workers lane detected");
      expect(doctor.stdout).toContain("Cloudflare Workers env values");

      const result = runInApp(appPath, "pnpm check:fast", {
        timeout: 300000,
      });
      if (!result.success) logFailure("check:fast", result);
      expect(result.success).toBe(true);
    }, 600000);

    it("should build successfully", () => {
      console.log("[E2E] Running build (minimal)...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm build", {
        timeout: 600000,
      });

      if (!result.success) logFailure("Build", result);
      expect(result.success).toBe(true);
    }, 900000);
  });

  describe("full configuration", () => {
    let appPath: string;
    let appName: string;

    beforeAll(async () => {
      appName = generateAppName("e2e-full");
      console.log(`\n[E2E] Scaffolding full ${appName}...`);

      const result = await runCli({
        appName,
        flags: [
          "--yes",
          "--no-git",
          "--saas-bootstrap",
          "--integrations",
          "sentry,posthog,stripe,revenuecat,notifications,email,storage",
          "--email-provider",
          "resend",
        ],
        cwd: tempDir,
        timeout: 600000,
      });

      appPath = result.appPath;
      appsToClean.push(appPath);

      expect(result.exitCode).toBe(0);
      console.log(`[E2E] Scaffolded to ${appPath}`);
    }, 900000);

    it("should have full structure", () => {
      expect(fileExists(appPath, "apps/web")).toBe(true);
      expect(fileExists(appPath, "apps/expo")).toBe(true);
      expect(fileExists(appPath, "packages/monitoring")).toBe(true);
      expect(fileExists(appPath, "packages/analytics")).toBe(true);
      expect(fileExists(appPath, "packages/payments")).toBe(true);
      expect(fileExists(appPath, "packages/email")).toBe(true);
      expect(fileExists(appPath, "packages/storage")).toBe(true);
      expect(fileExists(appPath, "docs/ai/BOOTSTRAP_PLAYBOOK.md")).toBe(true);
    });

    it("should pass typecheck", () => {
      console.log("[E2E] Running typecheck (full)...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm typecheck", {
        timeout: 300000,
      });

      if (!result.success) logFailure("Typecheck", result);
      expect(result.success).toBe(true);
    }, 600000);

    it("should build successfully", () => {
      console.log("[E2E] Running build (full)...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm build", {
        timeout: 600000,
      });

      if (!result.success) logFailure("Build", result);
      expect(result.success).toBe(true);
    }, 900000);

    it("should build the web app explicitly", () => {
      console.log("[E2E] Running web build (full)...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm --filter @gmacko/web build", {
        timeout: 600000,
      });

      if (!result.success) logFailure("Web build", result);
      expect(result.success).toBe(true);
    }, 900000);

    it("should typecheck Expo explicitly", () => {
      console.log("[E2E] Running Expo typecheck (full)...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm --filter @gmacko/expo typecheck", {
        timeout: 300000,
      });

      if (!result.success) logFailure("Expo typecheck", result);
      expect(result.success).toBe(true);
    }, 600000);

    it("should resolve Expo dev-client commands without network work", () => {
      console.log("[E2E] Running Expo dev-client smoke checks (full)...");
      createMockEnv(appPath);

      const helpResult = runInApp(
        appPath,
        "pnpm --filter @gmacko/expo exec expo start --dev-client --help",
        { timeout: 180000 },
      );

      if (!helpResult.success) logFailure("Expo dev-client help", helpResult);
      expect(helpResult.success).toBe(true);

      const configResult = runInApp(
        appPath,
        "pnpm --filter @gmacko/expo exec expo config --json",
        { timeout: 180000 },
      );

      if (!configResult.success)
        logFailure("Expo config resolution", configResult);
      expect(configResult.success).toBe(true);
      expect(configResult.stdout).toContain('"name"');
    }, 300000);
  });

  describe("custom package scope", () => {
    let appPath: string;
    let appName: string;

    beforeAll(async () => {
      appName = generateAppName("e2e-scope");
      console.log(`\n[E2E] Scaffolding with custom scope ${appName}...`);

      const result = await runCli({
        appName,
        flags: [
          "--yes",
          "--no-git",
          "--no-mobile",
          "--no-ai",
          "--prune",
          "--package-scope",
          "@mycompany",
          "--integrations",
          "",
        ],
        cwd: tempDir,
        timeout: 600000,
      });

      appPath = result.appPath;
      appsToClean.push(appPath);

      expect(result.exitCode).toBe(0);
      console.log(`[E2E] Scaffolded to ${appPath}`);
    }, 900000);

    it("should use custom scope in package names", () => {
      const checkPackage = (pkgPath: string, expectedName: string) => {
        expect(fileExists(appPath, pkgPath)).toBe(true);
        const pkg = JSON.parse(
          fs.readFileSync(path.join(appPath, pkgPath), "utf-8"),
        ) as { name: string };
        expect(pkg.name).toBe(expectedName);
      };

      checkPackage("packages/api/package.json", "@mycompany/api");
      checkPackage("packages/domain/package.json", "@mycompany/domain");
      checkPackage("packages/db/package.json", "@mycompany/db");
      checkPackage("packages/auth/package.json", "@mycompany/auth");
      checkPackage("apps/web/package.json", "@mycompany/web");
    });

    it("should pass typecheck with custom scope", () => {
      console.log("[E2E] Running typecheck (custom scope)...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm typecheck", {
        timeout: 300000,
      });

      if (!result.success) logFailure("Typecheck", result);
      expect(result.success).toBe(true);
    }, 600000);

    it("should build with custom scope", () => {
      console.log("[E2E] Running build (custom scope)...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm --filter @mycompany/web build", {
        timeout: 600000,
      });

      if (!result.success) logFailure("Build", result);
      expect(result.success).toBe(true);
    }, 900000);
  });

  describe("mobile-only configuration", () => {
    let appPath: string;
    let appName: string;

    beforeAll(async () => {
      appName = generateAppName("e2e-mobile");
      console.log(`\n[E2E] Scaffolding mobile-only ${appName}...`);

      const result = await runCli({
        appName,
        flags: ["--yes", "--no-git", "--no-web", "--no-ai"],
        cwd: tempDir,
        timeout: 600000,
      });

      appPath = result.appPath;
      appsToClean.push(appPath);

      expect(result.exitCode).toBe(0);
      console.log(`[E2E] Scaffolded to ${appPath}`);
    }, 900000);

    it("should have no web app and no Worker wiring", () => {
      expect(fileExists(appPath, "apps/web")).toBe(false);
      expect(fileExists(appPath, "apps/expo")).toBe(true);
      expect(fileExists(appPath, ".github/workflows/preview.yml")).toBe(false);
    });

    it("should pass typecheck and the doctor without a Worker", () => {
      console.log("[E2E] Running typecheck + doctor (mobile-only)...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm typecheck", {
        timeout: 300000,
      });
      if (!result.success) logFailure("Typecheck", result);
      expect(result.success).toBe(true);

      const doctor = runInApp(appPath, "pnpm run doctor", { timeout: 120000 });
      if (!doctor.success) logFailure("Doctor", doctor);
      expect(doctor.success).toBe(true);
      expect(doctor.stdout).not.toContain("Cloudflare Workers lane detected");
    }, 600000);
  });

  describe("operator lane configuration", () => {
    let appPath: string;
    let appName: string;

    beforeAll(async () => {
      appName = generateAppName("e2e-operators");
      console.log(`\n[E2E] Scaffolding operator lane ${appName}...`);

      const result = await runCli({
        appName,
        flags: [
          "--yes",
          "--no-git",
          "--no-mobile",
          "--saas-bootstrap",
          "--operator-lane",
        ],
        cwd: tempDir,
        timeout: 600000,
      });

      appPath = result.appPath;
      appsToClean.push(appPath);

      expect(result.exitCode).toBe(0);
      console.log(`[E2E] Scaffolded to ${appPath}`);
    }, 900000);

    it("should expose the operator CLI help", () => {
      console.log("[E2E] Running operator CLI help smoke check...");
      createMockEnv(appPath);

      // `pnpm api:ops` runs the operator CLI source via tsx (no build/bin
      // linking needed — a workspace package's own bin is never linked into
      // node_modules/.bin). This exercises the real script users run.
      const result = runInApp(appPath, "pnpm api:ops -- --help", {
        timeout: 180000,
      });

      if (!result.success) {
        console.error("[E2E] Operator CLI help failed:");
        console.error(`stdout:\n${result.stdout}`);
        console.error(`stderr:\n${result.stderr}`);
      }

      expect(result.success).toBe(true);
      expect(result.stdout).toContain("gmacko-ops");
      expect(result.stdout).toContain(
        "CLI + MCP wrappers over the same HTTP API",
      );
    }, 300000);

    it("should report operator env values in doctor output", () => {
      console.log("[E2E] Running doctor (operator lane)...");
      createMockEnv(appPath);

      const doctorResult = runInApp(appPath, "pnpm run doctor", {
        timeout: 180000,
      });

      if (!doctorResult.success)
        logFailure("Operator lane doctor", doctorResult);
      expect(doctorResult.success).toBe(true);
      expect(doctorResult.stdout).toContain("Operator API lane detected");
      expect(doctorResult.stdout).toContain("Operator API env values");
      expect(doctorResult.stdout).not.toContain(
        "Operator API env values missing",
      );
    }, 300000);
  });
});
