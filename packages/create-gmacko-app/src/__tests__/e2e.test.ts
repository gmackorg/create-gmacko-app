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
  createFakeCliBin,
  createMockEnv,
  ensureTempDir,
  fileExists,
  generateAppName,
  readFile,
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

    it("should exercise ForgeGraph repo-local scripts", () => {
      console.log("[E2E] Running ForgeGraph script smoke test...");
      createMockEnv(appPath);

      const fakeBin = createFakeCliBin(appPath, {
        forge: 'echo "fake-forge $@"',
      });

      const result = runInApp(
        appPath,
        "pnpm forge:stages && pnpm forge:deploy:staging && pnpm forge:deploy:production",
        {
          env: {
            PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          },
          timeout: 120000,
        },
      );

      if (!result.success) {
        console.error("[E2E] ForgeGraph scripts failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
      expect(result.stdout).toContain("fake-forge stage list");
      expect(result.stdout).toContain(
        "fake-forge deploy create staging --wait",
      );
      expect(result.stdout).toContain(
        "fake-forge deploy create production --wait",
      );
    }, 180000);

    it("should resolve forge from the local repo install", () => {
      console.log("[E2E] Verifying local forge CLI resolution...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm exec forge --version", {
        timeout: 120000,
      });

      if (!result.success) {
        console.error("[E2E] Local forge CLI resolution failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toMatch(/^0\\./);
    }, 180000);

    it("should complete auth and db bootstrap commands", () => {
      console.log("[E2E] Running auth/db bootstrap checks...");
      createMockEnv(appPath);

      const authResult = runInApp(appPath, "pnpm auth:generate", {
        timeout: 300000,
      });

      if (!authResult.success) {
        console.error("[E2E] Auth generate failed:");
        console.error(authResult.stderr || authResult.stdout);
      }

      expect(authResult.success).toBe(true);

      const dbGenerateResult = runInApp(appPath, "pnpm db:generate", {
        timeout: 300000,
      });

      if (!dbGenerateResult.success) {
        console.error("[E2E] DB generate failed:");
        console.error(dbGenerateResult.stderr || dbGenerateResult.stdout);
      }

      expect(dbGenerateResult.success).toBe(true);
      expect(fileExists(appPath, "packages/db/src/auth-schema.ts")).toBe(true);
    }, 600000);

    it("should keep the Next.js health route scaffolded", () => {
      const healthRoute = readFile(
        appPath,
        "apps/nextjs/src/app/api/health/route.ts",
      );

      expect(healthRoute).toContain('status: "healthy"');
      expect(healthRoute).toContain('status: "degraded"');
      expect(healthRoute).toContain('status: "unhealthy"');
      expect(healthRoute).toContain("return NextResponse.json");
    });
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

  describe("vinext configuration", () => {
    let appPath: string;
    let appName: string;

    beforeAll(async () => {
      appName = generateAppName("e2e-vinext");
      console.log(`\n[E2E] Scaffolding vinext ${appName}...`);

      const result = await runCli({
        appName,
        flags: ["--yes", "--no-git", "--no-mobile", "--no-ai", "--vinext"],
        cwd: tempDir,
        timeout: 600000,
      });

      appPath = result.appPath;
      appsToClean.push(appPath);

      expect(result.exitCode).toBe(0);
      console.log(`[E2E] Scaffolded to ${appPath}`);
    }, 900000);

    it("should build the vinext lane", () => {
      console.log("[E2E] Running vinext build...");
      createMockEnv(appPath);

      const result = runInApp(
        appPath,
        "pnpm --filter @gmacko/nextjs build:vinext",
        {
          env: {
            CI: "true",
          },
          timeout: 600000,
        },
      );

      if (!result.success) {
        console.error("[E2E] Vinext build failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
    }, 900000);

    it("should validate Cloudflare doctor signals for vinext", () => {
      console.log("[E2E] Running doctor (vinext)...");
      createMockEnv(appPath);

      const doctorResult = runInApp(appPath, "pnpm doctor", {
        timeout: 120000,
      });

      if (!doctorResult.success) {
        console.error("[E2E] Doctor failed:");
        console.error(doctorResult.stderr || doctorResult.stdout);
      }

      expect(doctorResult.success).toBe(true);
      expect(doctorResult.stdout).toContain("Cloudflare Workers lane detected");
      expect(doctorResult.stdout).toContain("Wrangler CLI available");
      expect(doctorResult.stdout).toContain(
        "Cloudflare Workers credentials present",
      );
      expect(doctorResult.stdout).not.toContain(
        "CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN are missing",
      );
    }, 180000);

    it("should scaffold the expected Cloudflare runtime contract", () => {
      const wranglerConfig = readFile(appPath, "apps/nextjs/wrangler.jsonc");
      const cloudflareEnv = readFile(
        appPath,
        "apps/nextjs/src/cloudflare-env.ts",
      );

      expect(wranglerConfig).toContain('"main": "./worker/index.ts"');
      expect(wranglerConfig).toContain('"APP_ENV": "production"');
      expect(wranglerConfig).toContain('"staging"');
      expect(cloudflareEnv).toContain("CLOUDFLARE_ACCOUNT_ID");
      expect(cloudflareEnv).toContain("CLOUDFLARE_API_TOKEN");
    });
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

    it("should build TanStack Start explicitly", () => {
      console.log("[E2E] Running TanStack Start build (full)...");
      createMockEnv(appPath);

      const result = runInApp(
        appPath,
        "pnpm --filter @gmacko/tanstack-start build",
        {
          timeout: 600000,
        },
      );

      if (!result.success) {
        console.error("[E2E] TanStack Start build failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
    }, 900000);

    it("should typecheck Expo explicitly", () => {
      console.log("[E2E] Running Expo typecheck (full)...");
      createMockEnv(appPath);

      const result = runInApp(appPath, "pnpm --filter @gmacko/expo typecheck", {
        timeout: 300000,
      });

      if (!result.success) {
        console.error("[E2E] Expo typecheck failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
    }, 600000);

    it("should resolve Expo dev-client commands without network work", () => {
      console.log("[E2E] Running Expo dev-client smoke checks (full)...");
      createMockEnv(appPath);

      const helpResult = runInApp(
        appPath,
        "pnpm --filter @gmacko/expo exec expo start --dev-client --help",
        {
          timeout: 180000,
        },
      );

      if (!helpResult.success) {
        console.error("[E2E] Expo dev-client help failed:");
        console.error(helpResult.stderr || helpResult.stdout);
      }

      expect(helpResult.success).toBe(true);

      const configResult = runInApp(
        appPath,
        "pnpm --filter @gmacko/expo exec expo config --json",
        {
          timeout: 180000,
        },
      );

      if (!configResult.success) {
        console.error("[E2E] Expo config resolution failed:");
        console.error(configResult.stderr || configResult.stdout);
      }

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

  describe("pruned vinext configuration", () => {
    let appPath: string;
    let appName: string;

    beforeAll(async () => {
      appName = generateAppName("e2e-vinext-pruned");
      console.log(`\n[E2E] Scaffolding pruned vinext ${appName}...`);

      const result = await runCli({
        appName,
        flags: [
          "--yes",
          "--no-git",
          "--no-mobile",
          "--no-ai",
          "--prune",
          "--integrations",
          "",
          "--vinext",
        ],
        cwd: tempDir,
        timeout: 600000,
      });

      appPath = result.appPath;
      appsToClean.push(appPath);

      expect(result.exitCode).toBe(0);
      console.log(`[E2E] Scaffolded to ${appPath}`);
    }, 900000);

    it("should typecheck with vinext enabled", () => {
      console.log("[E2E] Running typecheck (pruned vinext)...");
      createMockEnv(appPath);

      const result = runInApp(
        appPath,
        "pnpm --filter @gmacko/nextjs typecheck",
        {
          timeout: 300000,
        },
      );

      if (!result.success) {
        console.error("[E2E] Typecheck failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
    }, 600000);

    it("should exercise the Cloudflare deploy script with a fake wrangler", () => {
      console.log("[E2E] Running fake Cloudflare deploy smoke test...");
      createMockEnv(appPath);

      const fakeBin = createFakeCliBin(appPath, {
        wrangler: 'echo "fake-wrangler $@"',
      });

      const result = runInApp(
        appPath,
        "pnpm --filter @gmacko/nextjs deploy:cloudflare:staging",
        {
          env: {
            PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          },
          timeout: 600000,
        },
      );

      if (!result.success) {
        console.error("[E2E] Fake Cloudflare deploy failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
      expect(result.stdout).toContain("fake-wrangler deploy --env staging");
    }, 900000);
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
          "--trpc-operators",
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

      const result = runInApp(appPath, "pnpm trpc:ops -- --help", {
        timeout: 180000,
      });

      if (!result.success) {
        console.error("[E2E] Operator CLI help failed:");
        console.error(result.stderr || result.stdout);
      }

      expect(result.success).toBe(true);
      expect(result.stdout).toContain("gmacko-ops");
      expect(result.stdout).toContain(
        "CLI + MCP wrappers over the same tRPC API",
      );
    }, 300000);

    it("should report operator env values in doctor output", () => {
      console.log("[E2E] Running doctor (operator lane)...");
      createMockEnv(appPath);

      const doctorResult = runInApp(appPath, "pnpm doctor", {
        timeout: 180000,
      });

      if (!doctorResult.success) {
        console.error("[E2E] Operator lane doctor failed:");
        console.error(doctorResult.stderr || doctorResult.stdout);
      }

      expect(doctorResult.success).toBe(true);
      expect(doctorResult.stdout).toContain("Operator API lane detected");
      expect(doctorResult.stdout).toContain("Operator API env values");
      expect(doctorResult.stdout).not.toContain(
        "Operator API env values missing",
      );
    }, 300000);
  });
});
