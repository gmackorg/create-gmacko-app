import path from "node:path";
import fs from "fs-extra";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupApp,
  ensureTempDir,
  EXPECTED_FILES,
  fileExists,
  generateAppName,
  readJson,
  runCli,
} from "./helpers.js";

describe("create-gmacko-app scaffold", () => {
  let tempDir: string;
  const appsToClean: string[] = [];

  beforeAll(() => {
    tempDir = ensureTempDir();
  });

  afterAll(() => {
    // Clean up all test apps
    for (const appPath of appsToClean) {
      cleanupApp(appPath);
    }
  });

  describe("basic scaffolding", () => {
    it("should scaffold a new app with defaults", async () => {
      const appName = generateAppName("basic");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, "package.json")).toBe(true);

      // Check root package.json
      const pkg = readJson<{ name: string }>(result.appPath, "package.json");
      expect(pkg.name).toBe(appName);

      // Check core files exist
      for (const file of EXPECTED_FILES.core) {
        expect(fileExists(result.appPath, file)).toBe(true);
      }
    }, 120000);

    it("should include web app by default", async () => {
      const appName = generateAppName("with-web");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      for (const file of EXPECTED_FILES.withWeb) {
        expect(fileExists(result.appPath, file)).toBe(true);
      }
    }, 120000);

    it("should include mobile app by default", async () => {
      const appName = generateAppName("with-mobile");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      for (const file of EXPECTED_FILES.withMobile) {
        expect(fileExists(result.appPath, file)).toBe(true);
      }
    }, 120000);

    it("should include AI workflow by default", async () => {
      const appName = generateAppName("with-ai");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      for (const file of EXPECTED_FILES.withAi) {
        expect(fileExists(result.appPath, file)).toBe(true);
      }
    }, 120000);
  });

  describe("platform options", () => {
    it("should exclude web app when --no-web is passed", async () => {
      const appName = generateAppName("no-web");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--no-web"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, "apps/nextjs")).toBe(false);
    }, 120000);

    it("should exclude mobile app when --no-mobile is passed", async () => {
      const appName = generateAppName("no-mobile");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--no-mobile"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, "apps/expo")).toBe(false);
    }, 120000);

    it("should include tanstack-start when --tanstack-start is passed", async () => {
      const appName = generateAppName("with-tanstack");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--tanstack-start"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      for (const file of EXPECTED_FILES.withTanstackStart) {
        expect(fileExists(result.appPath, file)).toBe(true);
      }
    }, 120000);

    it("should exclude AI when --no-ai is passed", async () => {
      const appName = generateAppName("no-ai");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--no-ai"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, ".opencode")).toBe(false);
      expect(fileExists(result.appPath, "opencode.json")).toBe(false);
    }, 120000);
  });

  describe("integration options", () => {
    it("should configure integrations via --integrations flag", async () => {
      const appName = generateAppName("custom-integrations");
      const result = await runCli({
        appName,
        flags: [
          "--yes",
          "--no-install",
          "--no-git",
          "--integrations",
          "sentry,posthog,stripe",
        ],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      // Check integrations.ts was updated
      const integrationsPath = path.join(
        result.appPath,
        "packages/config/src/integrations.ts",
      );
      const integrationsContent = fs.readFileSync(integrationsPath, "utf-8");

      expect(integrationsContent).toContain("sentry: true");
      expect(integrationsContent).toContain("posthog: true");
      expect(integrationsContent).toContain("stripe: true");
    }, 120000);

    it("should prune unused packages when --prune is passed", async () => {
      const appName = generateAppName("pruned");
      const result = await runCli({
        appName,
        flags: [
          "--yes",
          "--no-install",
          "--no-git",
          "--prune",
          "--integrations",
          "", // No integrations = prune all optional packages
        ],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      // These packages should be removed when their integrations are disabled
      expect(fileExists(result.appPath, "packages/monitoring")).toBe(false);
      expect(fileExists(result.appPath, "packages/analytics")).toBe(false);
      expect(fileExists(result.appPath, "packages/payments")).toBe(false);
    }, 120000);
  });

  describe("package scope", () => {
    it("should replace package scope when --package-scope is passed", async () => {
      const appName = generateAppName("custom-scope");
      const result = await runCli({
        appName,
        flags: [
          "--yes",
          "--no-install",
          "--no-git",
          "--package-scope",
          "@myorg",
        ],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      // Check that @gmacko was replaced with @myorg
      const apiPkg = readJson<{ name: string }>(
        result.appPath,
        "packages/api/package.json",
      );
      expect(apiPkg.name).toBe("@myorg/api");

      const dbPkg = readJson<{ name: string }>(
        result.appPath,
        "packages/db/package.json",
      );
      expect(dbPkg.name).toBe("@myorg/db");
    }, 120000);
  });

  describe("manifest file", () => {
    it("should create gmacko.integrations.json manifest", async () => {
      const appName = generateAppName("with-manifest");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, "gmacko.integrations.json")).toBe(true);

      const manifest = readJson<{
        preset: string;
        integrations: Record<string, unknown>;
        platforms: Record<string, boolean>;
        scaffoldedAt: string;
        packageScope: string;
      }>(result.appPath, "gmacko.integrations.json");

      expect(manifest.preset).toBeDefined();
      expect(manifest.integrations).toBeDefined();
      expect(manifest.platforms).toBeDefined();
      expect(manifest.scaffoldedAt).toBeDefined();
      expect(manifest.packageScope).toBe("@gmacko");
    }, 120000);
  });
});
