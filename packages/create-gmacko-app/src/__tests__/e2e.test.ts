/**
 * E2E Integration Tests for create-gmacko-app
 *
 * These tests verify that a generated app works out of the box:
 * - Dependencies install successfully
 * - TypeScript compiles without errors
 * - Linting passes
 * - Build succeeds
 *
 * These tests are SLOW (5-15 minutes each) and should be run:
 * - On release branches
 * - Nightly in CI
 * - Manually before publishing to npm
 *
 * Run with: pnpm test:e2e
 */

import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cleanupApp,
  createMockEnv,
  ensureTempDir,
  fileExists,
  generateAppName,
  runCli,
  runInApp,
} from "./helpers.js";

// Skip these tests unless explicitly running E2E
const SKIP_E2E = process.env.RUN_E2E !== "true";

describe.skipIf(SKIP_E2E)("create-gmacko-app E2E", () => {
  let tempDir: string;
  const appsToClean: string[] = [];

  beforeAll(() => {
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

  describe("default configuration", () => {
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
    });

    it("should pass typecheck", () => {
      console.log("[E2E] Running typecheck...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm typecheck", {
        timeout: 300000, // 5 minutes
      });

      if (!result.success) {
        console.error("[E2E] Typecheck failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
    }, 600000);

    it("should pass lint", () => {
      console.log("[E2E] Running lint...");

      const result = runInApp(appPath, "pnpm lint", {
        timeout: 300000, // 5 minutes
      });

      if (!result.success) {
        console.error("[E2E] Lint failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
    }, 600000);

    it("should build successfully", () => {
      console.log("[E2E] Running build...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm build", {
        timeout: 600000, // 10 minutes
      });

      if (!result.success) {
        console.error("[E2E] Build failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
    }, 900000);
  });

  describe("minimal configuration", () => {
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
      expect(fileExists(appPath, "apps/nextjs")).toBe(true);
      expect(fileExists(appPath, "apps/expo")).toBe(false);
      expect(fileExists(appPath, "packages/analytics")).toBe(false);
      expect(fileExists(appPath, "packages/monitoring")).toBe(false);
    });

    it("should pass typecheck", () => {
      console.log("[E2E] Running typecheck (minimal)...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm typecheck", {
        timeout: 300000,
      });

      if (!result.success) {
        console.error("[E2E] Typecheck failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
    }, 600000);

    it("should build successfully", () => {
      console.log("[E2E] Running build (minimal)...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm build", {
        timeout: 600000,
      });

      if (!result.success) {
        console.error("[E2E] Build failed:");
        console.error(result.stderr || result.stdout);
      }

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
          "--tanstack-start",
          "--integrations",
          "sentry,posthog,stripe,email",
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
      expect(fileExists(appPath, "apps/nextjs")).toBe(true);
      expect(fileExists(appPath, "apps/expo")).toBe(true);
      expect(fileExists(appPath, "apps/tanstack-start")).toBe(true);
      expect(fileExists(appPath, "packages/monitoring")).toBe(true);
      expect(fileExists(appPath, "packages/analytics")).toBe(true);
      expect(fileExists(appPath, "packages/payments")).toBe(true);
      expect(fileExists(appPath, "packages/email")).toBe(true);
    });

    it("should pass typecheck", () => {
      console.log("[E2E] Running typecheck (full)...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm typecheck", {
        timeout: 300000,
      });

      if (!result.success) {
        console.error("[E2E] Typecheck failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
    }, 600000);

    it("should build successfully", () => {
      console.log("[E2E] Running build (full)...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm build", {
        timeout: 600000,
      });

      if (!result.success) {
        console.error("[E2E] Build failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
    }, 900000);
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
        if (fileExists(appPath, pkgPath)) {
          const pkg = JSON.parse(
            require("fs").readFileSync(path.join(appPath, pkgPath), "utf-8"),
          );
          expect(pkg.name).toBe(expectedName);
        }
      };

      checkPackage("packages/api/package.json", "@mycompany/api");
      checkPackage("packages/db/package.json", "@mycompany/db");
      checkPackage("packages/auth/package.json", "@mycompany/auth");
      checkPackage("apps/nextjs/package.json", "@mycompany/nextjs");
    });

    it("should pass typecheck with custom scope", () => {
      console.log("[E2E] Running typecheck (custom scope)...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm typecheck", {
        timeout: 300000,
      });

      if (!result.success) {
        console.error("[E2E] Typecheck failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
    }, 600000);

    it("should build with custom scope", () => {
      console.log("[E2E] Running build (custom scope)...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm build", {
        timeout: 600000,
      });

      if (!result.success) {
        console.error("[E2E] Build failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
    }, 900000);
  });
});
