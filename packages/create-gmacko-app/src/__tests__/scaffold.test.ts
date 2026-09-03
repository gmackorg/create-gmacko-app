import path from "node:path";
import fs from "fs-extra";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cleanupApp,
  EXPECTED_FILES,
  ensureCliBuilt,
  ensureTempDir,
  fileExists,
  generateAppName,
  isCommandAvailable,
  readFile,
  readJson,
  runCli,
} from "./helpers.js";

describe("create-gmacko-app scaffold", () => {
  let tempDir: string;
  const appsToClean: string[] = [];

  beforeAll(() => {
    ensureCliBuilt();
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
      const pkg = readJson<{ name: string; scripts?: Record<string, string> }>(
        result.appPath,
        "package.json",
      );
      expect(pkg.name).toBe(appName);

      // Check core files exist
      for (const file of EXPECTED_FILES.core) {
        expect(fileExists(result.appPath, file)).toBe(true);
      }
      // The operator lane is opt-in: no packages and no root scripts for it.
      expect(
        fileExists(result.appPath, "packages/operator-core/package.json"),
      ).toBe(false);
      expect(fileExists(result.appPath, "packages/api-cli/package.json")).toBe(
        false,
      );
      expect(
        fileExists(result.appPath, "packages/mcp-server/package.json"),
      ).toBe(false);
      expect(pkg.scripts?.["api:ops"]).toBeUndefined();
      expect(pkg.scripts?.["mcp:app"]).toBeUndefined();
    }, 120000);

    it("should never ship the pre-migration stack", async () => {
      const appName = generateAppName("no-legacy");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      for (const file of EXPECTED_FILES.legacy) {
        expect(fileExists(result.appPath, file)).toBe(false);
      }

      const workspace = readFile(result.appPath, "pnpm-workspace.yaml");
      const rootPkg = readJson<{ scripts?: Record<string, string> }>(
        result.appPath,
        "package.json",
      );
      expect(workspace).not.toContain("next");
      expect(workspace).not.toContain("postgres");
      expect(rootPkg.scripts?.["dev:next"]).toBeUndefined();
      expect(rootPkg.scripts?.["db:legacy:push"]).toBeUndefined();
      expect(rootPkg.scripts?.["trpc:ops"]).toBeUndefined();
    }, 120000);

    it("should include the web app by default", async () => {
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

      const webPkg = readJson<{
        name: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
      }>(result.appPath, "apps/web/package.json");
      expect(webPkg.name).toBe("@gmacko/web");
      expect(webPkg.scripts?.dev).toBe("vite dev");
      expect(webPkg.scripts?.build).toBe("vite build");
      expect(webPkg.dependencies?.["@gmacko/api"]).toBeDefined();
      expect(webPkg.dependencies?.["@gmacko/api-client"]).toBeDefined();
      expect(webPkg.dependencies?.["@gmacko/domain"]).toBeDefined();
      expect(webPkg.dependencies?.["@tanstack/react-start"]).toBeDefined();
      expect(webPkg.dependencies?.effect).toBeDefined();
    }, 120000);

    it("should scaffold the D1 data layer and name the Worker after the app", async () => {
      const appName = generateAppName("d1-lane");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const dbPackage = readJson<{
        dependencies?: Record<string, string>;
        scripts?: Record<string, string>;
      }>(result.appPath, "packages/db/package.json");
      const wranglerConfig = readFile(
        result.appPath,
        "apps/web/wrangler.jsonc",
      );
      const migrations = fs.readdirSync(
        path.join(result.appPath, "packages/db/migrations"),
      );

      expect(dbPackage.dependencies?.["drizzle-orm"]).toBeDefined();
      expect(dbPackage.dependencies?.["@effect/sql-d1"]).toBeDefined();
      expect(dbPackage.dependencies?.postgres).toBeUndefined();
      expect(dbPackage.scripts?.["migrate:local"]).toContain(
        "wrangler d1 migrations apply DB --local",
      );
      expect(migrations.some((file) => file.endsWith(".sql"))).toBe(true);

      // The template's `gmacko-web` Worker/D1 names become `<app>-web`.
      expect(wranglerConfig).toContain(`"name": "${appName}-web"`);
      expect(wranglerConfig).toContain(`"${appName}-web-staging"`);
      expect(wranglerConfig).toContain(`"${appName}-web-preview"`);
      expect(wranglerConfig).not.toContain("gmacko-web");
      expect(wranglerConfig).toContain('"binding": "DB"');
      expect(wranglerConfig).toContain('"d1_databases"');

      // Next steps point at the D1 workflow, not a database URL.
      expect(result.stdout).toContain(
        `wrangler d1 create ${appName}-web-staging`,
      );
      expect(result.stdout).toContain("migrate:local");
      expect(result.stdout).not.toContain("DATABASE_URL=");
    }, 120000);

    it("should include Storybook in packages/ui by default", async () => {
      const appName = generateAppName("with-storybook");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      for (const file of EXPECTED_FILES.withStorybook) {
        expect(fileExists(result.appPath, file)).toBe(true);
      }

      const uiPkg = readJson<{ scripts?: Record<string, string> }>(
        result.appPath,
        "packages/ui/package.json",
      );
      expect(uiPkg.scripts?.storybook).toContain("storybook dev");
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

    it("should include Claude planning and design workflow guidance", async () => {
      const appName = generateAppName("with-claude-guidance");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const agentsInstructions = readFile(result.appPath, "AGENTS.md");
      const claudeInstructions = readFile(result.appPath, "CLAUDE.md");
      const initialProposal = readFile(
        result.appPath,
        "docs/ai/INITIAL_PROPOSAL.md",
      );

      expect(agentsInstructions).toContain("Codex");
      expect(agentsInstructions).toContain("Claude Code");
      expect(agentsInstructions).toContain("OpenCode");
      expect(claudeInstructions).toContain("superpowers:brainstorming");
      expect(claudeInstructions).toContain("/plan-ceo-review");
      expect(claudeInstructions).toContain("/plan-eng-review");
      expect(claudeInstructions).toContain("/design-consultation");
      expect(claudeInstructions).toContain("DESIGN.md");
      expect(claudeInstructions).toContain(
        "pnpm --filter @gmacko/ui storybook",
      );

      expect(initialProposal).toContain("superpowers:brainstorming");
      expect(initialProposal).toContain("/plan-ceo-review");
      expect(initialProposal).toContain("/plan-eng-review");
      expect(initialProposal).toContain("/design-consultation");
    }, 120000);

    it("should include create-gmacko-app repo skill guidance for Claude", async () => {
      const appName = generateAppName("with-gmacko-skill");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const claudeInstructions = readFile(result.appPath, "CLAUDE.md");
      const repoSkill = readFile(
        result.appPath,
        ".claude/skills/create-gmacko-app-workflow/SKILL.md",
      );

      expect(claudeInstructions).toContain("create-gmacko-app-workflow");
      expect(repoSkill).toContain("apps/web");
      expect(repoSkill).toContain("packages/domain");
      expect(repoSkill).toContain("packages/api-client");
      expect(repoSkill).toContain("packages/ui");
      expect(repoSkill).toContain("docs/ai");
      expect(repoSkill).toContain("Storybook");
      expect(repoSkill).not.toContain("apps/nextjs");
    }, 120000);

    it("should scaffold ForgeGraph repo metadata for the Workers + D1 lane by default", async () => {
      const appName = generateAppName("forgegraph-bootstrap");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const forgeGraphConfig = readFile(result.appPath, ".forgegraph.yaml");

      expect(forgeGraphConfig).toContain(`app: ${appName}`);
      expect(forgeGraphConfig).toContain("server: https://forge.example.com");
      expect(forgeGraphConfig).toContain("db:");
      expect(forgeGraphConfig).toContain("type: d1");
      expect(forgeGraphConfig).toContain(
        "migrate: node scripts/deploy-stage.mjs --migrate-only",
      );
      expect(forgeGraphConfig).toContain("stages:");
      expect(forgeGraphConfig).toContain("- name: staging");
      expect(forgeGraphConfig).toContain("- name: production");
      expect(forgeGraphConfig).toContain("sortOrder: 10");
      expect(forgeGraphConfig).toContain("sortOrder: 20");
      expect(forgeGraphConfig).toContain("platform: cloudflare-workers");
      expect(forgeGraphConfig).toContain(`workerName: ${appName}-web-staging`);
      expect(forgeGraphConfig).toContain(`workerName: ${appName}-web\n`);
      expect(forgeGraphConfig).toContain("configPath: apps/web/wrangler.jsonc");
      expect(forgeGraphConfig).toContain("deploy: pnpm deploy:staging");
      expect(forgeGraphConfig).toContain("deploy: pnpm deploy:production");
      expect(forgeGraphConfig).toContain("resources:");
      expect(forgeGraphConfig).toContain("d1:");
      expect(forgeGraphConfig).toContain(`- name: ${appName}-web-preview`);
      expect(forgeGraphConfig).toContain("# ForgeGraph operator notes:");
      expect(forgeGraphConfig).toContain(
        "# primary web service path: apps/web",
      );
      expect(forgeGraphConfig).toContain(
        "# healthcheck path: /.well-known/forge-health",
      );
      expect(forgeGraphConfig).toContain("# database strategy: cloudflare-d1");
      expect(forgeGraphConfig).toContain(
        "# preview domain: change-me.preview.example.com",
      );
      expect(forgeGraphConfig).toContain(
        "# production domain: change-me.example.com",
      );
      expect(forgeGraphConfig).not.toContain("postgres");
      expect(forgeGraphConfig).not.toContain("nodeId");
      expect(forgeGraphConfig).not.toContain("flakeRef");
    }, 120000);

    it("should allow ForgeGraph config to be customized from CLI flags", async () => {
      const appName = generateAppName("forgegraph-custom");
      const result = await runCli({
        appName,
        flags: [
          "--yes",
          "--no-install",
          "--no-git",
          "--forgegraph-server",
          "https://forge.gmac.io",
          "--forgegraph-preview-domain",
          "pr.preview.gmac.io",
          "--forgegraph-production-domain",
          "app.gmac.io",
        ],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const forgeGraphConfig = readFile(result.appPath, ".forgegraph.yaml");

      expect(forgeGraphConfig).toContain("server: https://forge.gmac.io");
      expect(forgeGraphConfig).toContain(
        "# preview domain: pr.preview.gmac.io",
      );
      expect(forgeGraphConfig).toContain("# production domain: app.gmac.io");
    }, 120000);

    it("should scaffold with forgegraph integration config", async () => {
      const appName = generateAppName("forgegraph-integration");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--forgegraph"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);
      expect(result.exitCode).toBe(0);

      const integrationsConfig = readFile(
        result.appPath,
        "packages/config/src/integrations.ts",
      );
      expect(integrationsConfig).toContain("forgegraph: true");

      const forgeGraphConfig = readFile(result.appPath, ".forgegraph.yaml");
      expect(forgeGraphConfig).toContain(
        "# healthcheck path: /.well-known/forge-health",
      );
      expect(forgeGraphConfig).toContain("type: d1");
    }, 120000);

    it("should reject the removed --tanstack-start and --vinext flags", async () => {
      for (const flag of ["--tanstack-start", "--vinext"]) {
        const appName = generateAppName("removed-flag");
        const result = await runCli({
          appName,
          flags: ["--yes", "--no-install", "--no-git", flag],
          cwd: tempDir,
        });

        appsToClean.push(result.appPath);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(`unknown option '${flag}'`);
        expect(fileExists(result.appPath, "package.json")).toBe(false);
      }
    }, 120000);

    it("should scaffold stronger Expo development-build defaults", async () => {
      const appName = generateAppName("expo-dx");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, "apps/expo/README.md")).toBe(true);

      const expoPkg = readJson<{
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
      }>(result.appPath, "apps/expo/package.json");
      const expoReadme = readFile(result.appPath, "apps/expo/README.md");
      const expoConfig = readFile(result.appPath, "apps/expo/app.config.ts");
      const expoIndex = readFile(result.appPath, "apps/expo/src/app/index.tsx");
      const expoSettings = readFile(
        result.appPath,
        "apps/expo/src/app/settings.tsx",
      );
      const settingsService = readFile(
        result.appPath,
        "packages/api/src/settings/service.ts",
      );
      const authIndex = readFile(result.appPath, "packages/auth/src/index.ts");
      const mobileQa = readFile(result.appPath, "apps/expo/docs/mobile-qa.md");
      const rootReadme = readFile(result.appPath, "README.md");
      const expectedDisplayName = appName
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

      expect(expoPkg.scripts?.["dev:client"]).toBeDefined();
      expect(expoPkg.scripts?.["build:device:ios"]).toBeDefined();
      expect(expoPkg.scripts?.["build:device:android"]).toBeDefined();
      expect(expoPkg.scripts?.["check:app-store"]).toBe(
        "node ./scripts/check-app-store-readiness.mjs",
      );
      expect(expoPkg.dependencies?.["expo-apple-authentication"]).toBeDefined();
      expect(expoPkg.dependencies?.["@gmacko/api-client"]).toBeDefined();
      expect(expoReadme).toContain("Expo Orbit");
      expect(expoReadme).toContain("development build");
      expect(expoReadme).toContain("EXPO_PUBLIC_APP_DOMAIN");
      expect(expoReadme).toContain("associated domains");
      expect(expoReadme).toContain("bundle identifier");
      expect(expoReadme).toContain("Sign in with Apple");
      expect(expoReadme).toContain("account deletion");
      expect(expoConfig).toContain(`slug: "${appName}"`);
      expect(expoConfig).toContain(`scheme: "${appName}"`);
      expect(expoConfig).toContain(
        `const base = "com.gmacko.${appName.replace(/-/g, "")}"`,
      );
      expect(expoConfig).toContain(`return "${expectedDisplayName}";`);
      expect(expoConfig).toContain(
        `return "${expectedDisplayName} (Preview)";`,
      );
      expect(expoConfig).toContain(`return "${expectedDisplayName} (Dev)";`);
      expect(expoConfig).toContain("EXPO_PUBLIC_APP_DOMAIN");
      expect(expoConfig).toContain('"change-me.example.com"');
      expect(expoConfig).toContain("usesAppleSignIn: true");
      expect(expoConfig).toContain('"expo-apple-authentication"');
      expect(expoConfig).toContain(
        "associatedDomains: [`applinks:${ASSOCIATED_DOMAIN}`]",
      );
      expect(expoConfig).toContain('scheme: "https"');
      expect(expoConfig).toContain("host: ASSOCIATED_DOMAIN");
      expect(expoConfig).toContain(
        "Scaffold note: replace these app identifiers and domains before store submission.",
      );
      expect(expoIndex).toContain("AppleAuthenticationButton");
      expect(expoIndex).toContain('provider: "apple"');
      expect(expoSettings).toContain("Delete Account");
      expect(expoSettings).toContain("deleteAccount");
      expect(settingsService).toContain("deleteAccount");
      expect(authIndex).toContain("apple");
      expect(authIndex).toContain("https://appleid.apple.com");
      expect(mobileQa).toContain("Sign in with Apple");
      expect(mobileQa).toContain("account deletion");
      expect(rootReadme).toContain("Scaffold profile");
      expect(rootReadme).toContain(
        "Platforms: Web (TanStack Start + Effect on Cloudflare Workers, D1), Expo",
      );
      expect(rootReadme).toContain(
        "Default deploy path: ForgeGraph → one Cloudflare Worker + one D1 per stage (migrate, then deploy)",
      );
      expect(rootReadme).toContain("pnpm bootstrap:local");
      expect(rootReadme).not.toContain(
        "Generated repos replace this block with a scaffold-specific profile summary.",
      );
      expect(rootReadme).toContain("Expo Orbit");
      expect(rootReadme).toContain("dev:client");
    }, 120000);

    it("should scaffold an app-store readiness script for Expo", async () => {
      const appName = generateAppName("expo-app-store");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(
        fileExists(
          result.appPath,
          "apps/expo/scripts/check-app-store-readiness.mjs",
        ),
      ).toBe(true);

      const appStoreCheck = readFile(
        result.appPath,
        "apps/expo/scripts/check-app-store-readiness.mjs",
      );

      expect(appStoreCheck).toContain("change-me.example.com");
      expect(appStoreCheck).toContain("your-project-id");
      expect(appStoreCheck).toContain("Your App Name");
      expect(appStoreCheck).toContain("privacy_url.txt");
      expect(appStoreCheck).toContain("support_url.txt");
      expect(appStoreCheck).toContain("process.exit(1)");
    }, 120000);

    it("should scaffold web env files without vercel presets", async () => {
      const appName = generateAppName("no-vercel-env");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const webEnv = readFile(result.appPath, "apps/web/src/env.ts");

      expect(webEnv).not.toContain("presets-zod");
      expect(webEnv).not.toContain("vercel()");
    }, 120000);

    it("should scaffold without vercel-specific runtime env hooks", async () => {
      const appName = generateAppName("no-vercel-runtime");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const turboConfig = readFile(result.appPath, "turbo.json");
      const analyticsWeb = readFile(
        result.appPath,
        "packages/analytics/src/web/index.tsx",
      );
      const monitoringWeb = readFile(
        result.appPath,
        "packages/monitoring/src/web/index.ts",
      );
      const previewConfig = readFile(
        result.appPath,
        "packages/config/src/preview.ts",
      );

      expect(turboConfig).not.toContain("VERCEL_ENV");
      expect(turboConfig).not.toContain("VERCEL_URL");
      expect(analyticsWeb).not.toContain("VERCEL_ENV");
      expect(monitoringWeb).not.toContain("VERCEL_ENV");
      expect(previewConfig).not.toContain("VERCEL_GIT_COMMIT_REF");
      expect(previewConfig).not.toContain("VERCEL_GIT_COMMIT_SHA");
    }, 120000);

    it("should not ship legacy k8s or sst deployment assets", async () => {
      const appName = generateAppName("no-legacy-deploy-assets");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, "deploy/README.md")).toBe(true);
      expect(fileExists(result.appPath, "deploy/k8s")).toBe(false);
      expect(fileExists(result.appPath, "deploy/sst")).toBe(false);
    }, 120000);

    it("should scaffold a Workers preview workflow named after the app", async () => {
      const appName = generateAppName("forgegraph-preview");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const previewWorkflow = readFile(
        result.appPath,
        ".github/workflows/preview.yml",
      );

      expect(previewWorkflow).toContain("wrangler deploy --env preview");
      expect(previewWorkflow).toContain(`${appName}-web-preview`);
      expect(previewWorkflow).not.toContain("gmacko-web");
      expect(previewWorkflow).not.toContain("DEPLOY_TARGET");
      expect(previewWorkflow).not.toContain("Deploy to Vercel");
      expect(previewWorkflow).not.toContain("Deploy to Kubernetes");
      expect(previewWorkflow).not.toContain("vercel");
      expect(previewWorkflow).not.toContain("kubectl");
    }, 120000);

    it("should scaffold agent workflows around AGENTS.md and agent-native configs", async () => {
      const appName = generateAppName("agent-dx");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const agentsInstructions = readFile(result.appPath, "AGENTS.md");
      const claudeInstructions = readFile(result.appPath, "CLAUDE.md");
      const developerExperience = readFile(
        result.appPath,
        "docs/ai/DEVELOPER_EXPERIENCE.md",
      );
      const claudeSettings = readJson<{
        permissions?: {
          additionalDirectories?: string[];
          deny?: string[];
        };
      }>(result.appPath, ".claude/settings.json");
      const openCodeConfig = readJson<{
        instructions?: string[];
      }>(result.appPath, "opencode.json");
      const mcpConfig = readJson<{
        mcpServers?: Record<string, { command?: string; args?: string[] }>;
      }>(result.appPath, ".mcp.json");

      expect(agentsInstructions).toContain("AGENTS.md");
      expect(agentsInstructions).toContain("Codex");
      expect(agentsInstructions).toContain("Claude Code");
      expect(agentsInstructions).toContain("OpenCode");
      expect(agentsInstructions).toContain("apps/web");
      expect(agentsInstructions).not.toContain("dev:next");
      expect(claudeInstructions).toContain("AGENTS.md");
      expect(developerExperience).toContain("ForgeGraph");
      expect(developerExperience).toContain("TanStack Start");
      expect(developerExperience).toContain("Expo Orbit");
      expect(developerExperience).not.toContain("vinext");
      expect(claudeSettings.permissions?.additionalDirectories).toContain(
        "../ForgeGraph",
      );
      expect(openCodeConfig.instructions).toContain("AGENTS.md");
      expect(openCodeConfig.instructions).toContain(
        "docs/ai/DEVELOPER_EXPERIENCE.md",
      );
      // `.mcp.json` ships empty; only the operator lane adds a server.
      expect(mcpConfig.mcpServers).toEqual({});

      const rootReadme = readFile(result.appPath, "README.md");
      expect(rootReadme).toContain("Agent quickstart");
      expect(rootReadme).toContain("AGENTS.md");
      expect(rootReadme).toContain(".mcp.json");
      expect(rootReadme).toContain(".claude/settings.json");
      expect(rootReadme).toContain("opencode.json");
    }, 120000);

    it("should scaffold a Claude SaaS bootstrap pack when requested", async () => {
      const appName = generateAppName("saas-bootstrap");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--saas-bootstrap"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(
        fileExists(result.appPath, ".claude/skills/bootstrap-saas/SKILL.md"),
      ).toBe(true);
      expect(
        fileExists(
          result.appPath,
          ".claude/skills/launch-landing-page/SKILL.md",
        ),
      ).toBe(true);
      expect(
        fileExists(
          result.appPath,
          ".claude/skills/setup-stripe-billing/SKILL.md",
        ),
      ).toBe(true);
      expect(
        fileExists(
          result.appPath,
          ".claude/skills/bootstrap-expo-app/SKILL.md",
        ),
      ).toBe(true);
      expect(
        fileExists(
          result.appPath,
          ".claude/skills/test-mobile-with-maestro/SKILL.md",
        ),
      ).toBe(true);
      expect(fileExists(result.appPath, "docs/ai/BOOTSTRAP_PLAYBOOK.md")).toBe(
        true,
      );

      const claudeInstructions = readFile(result.appPath, "CLAUDE.md");
      const bootstrapPlaybook = readFile(
        result.appPath,
        "docs/ai/BOOTSTRAP_PLAYBOOK.md",
      );
      const rootReadme = readFile(result.appPath, "README.md");
      const bootstrapSkill = readFile(
        result.appPath,
        ".claude/skills/bootstrap-saas/SKILL.md",
      );

      expect(claudeInstructions).toContain("After `pnpm bootstrap:local`");
      expect(claudeInstructions).toContain("/office-hours");
      expect(claudeInstructions).toContain("/autoplan");
      expect(claudeInstructions).toContain("/design-consultation");
      expect(claudeInstructions).toContain("bootstrap-saas");
      expect(bootstrapPlaybook).toContain("Post-setup SaaS bootstrap");
      expect(bootstrapPlaybook).toContain("/office-hours");
      expect(bootstrapPlaybook).toContain("/autoplan");
      expect(bootstrapPlaybook).toContain("/design-consultation");
      expect(bootstrapPlaybook).toContain("/bootstrap-expo-app");
      expect(bootstrapPlaybook).toContain("/test-mobile-with-maestro");
      expect(bootstrapPlaybook).toContain("## Claude-only");
      expect(bootstrapPlaybook).toContain("## Codex");
      expect(bootstrapPlaybook).toContain("## OpenCode");
      expect(bootstrapPlaybook).toContain("Claude-only");
      expect(bootstrapPlaybook).not.toContain("## Selected SaaS layers");
      expect(bootstrapPlaybook).not.toContain("/launch-landing-page");
      expect(bootstrapPlaybook).not.toContain("/setup-stripe-billing");
      expect(rootReadme).toContain("Post-setup SaaS bootstrap");
      expect(rootReadme).toContain("docs/ai/BOOTSTRAP_PLAYBOOK.md");
      expect(rootReadme).not.toContain(
        "/Volumes/dev/create-gmacko-app/docs/ai/BOOTSTRAP_PLAYBOOK.md",
      );
      expect(bootstrapSkill).toContain("/office-hours");
      expect(bootstrapSkill).toContain("/autoplan");
      expect(bootstrapSkill).toContain("/design-consultation");
    }, 120000);

    it("should scaffold feature-aware SaaS bootstrap recommendations when SaaS layers are selected", async () => {
      const appName = generateAppName("saas-bootstrap-aware");
      const result = await runCli({
        appName,
        flags: [
          "--yes",
          "--no-install",
          "--no-git",
          "--saas-bootstrap",
          "--saas-billing",
          "--saas-support",
          "--saas-operator-apis",
        ],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const bootstrapPlaybook = readFile(
        result.appPath,
        "docs/ai/BOOTSTRAP_PLAYBOOK.md",
      );
      const rootReadme = readFile(result.appPath, "README.md");

      expect(bootstrapPlaybook).toContain("## Claude-only");
      expect(bootstrapPlaybook).toContain("## Codex");
      expect(bootstrapPlaybook).toContain("## OpenCode");
      expect(bootstrapPlaybook).toContain("## Selected SaaS layers");
      expect(bootstrapPlaybook).toContain("Billing");
      expect(bootstrapPlaybook).toContain("Support");
      expect(bootstrapPlaybook).toContain("Operator APIs");
      expect(bootstrapPlaybook).toContain("/setup-stripe-billing");
      expect(bootstrapPlaybook).toContain("/launch-landing-page");
      expect(bootstrapPlaybook).toContain("pnpm api:ops -- --help");
      expect(bootstrapPlaybook).toContain("pnpm mcp:app");
      expect(bootstrapPlaybook).toContain(
        "packages/domain/src/settings/api.ts",
      );
      expect(bootstrapPlaybook).toContain("Claude-only");
      const selectedLayersStart = bootstrapPlaybook.indexOf(
        "## Selected SaaS layers",
      );
      const selectedLayersEnd = bootstrapPlaybook.indexOf(
        "- Use [docs/ai/BOOTSTRAP_PLAYBOOK.md](docs/ai/BOOTSTRAP_PLAYBOOK.md) for the full handoff.",
      );
      const selectedLayersSection =
        selectedLayersStart !== -1 && selectedLayersEnd !== -1
          ? bootstrapPlaybook.slice(selectedLayersStart, selectedLayersEnd)
          : "";
      expect(selectedLayersSection).not.toContain("/setup-stripe-billing");
      expect(selectedLayersSection).not.toContain("/launch-landing-page");
      expect(selectedLayersSection).not.toContain("Claude-only:");
      expect(rootReadme).toContain("Selected SaaS layers");
      expect(rootReadme).toContain("billing");
      expect(rootReadme).toContain("support");
      expect(rootReadme).toContain("operator APIs");
    }, 120000);

    it("should scaffold modular SaaS wizard options when requested", async () => {
      const appName = generateAppName("saas-wizard");
      const result = await runCli({
        appName,
        flags: [
          "--yes",
          "--no-install",
          "--no-git",
          "--saas-collaboration",
          "--saas-billing",
          "--saas-metering",
          "--saas-support",
          "--saas-launch",
          "--saas-referrals",
          "--saas-operator-apis",
        ],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(
        fileExists(result.appPath, "packages/operator-core/package.json"),
      ).toBe(true);
      expect(fileExists(result.appPath, "packages/api-cli/package.json")).toBe(
        true,
      );
      expect(
        fileExists(result.appPath, "packages/mcp-server/package.json"),
      ).toBe(true);
      expect(
        fileExists(result.appPath, "packages/mcp-server/src/core.ts"),
      ).toBe(true);

      const rootReadme = readFile(result.appPath, "README.md");
      const integrationsConfig = readFile(
        result.appPath,
        "packages/config/src/integrations.ts",
      );
      expect(rootReadme).toContain("Scaffold profile");
      expect(rootReadme).toContain("SaaS layers");
      expect(rootReadme).toContain("collaboration");
      expect(rootReadme).toContain("billing");
      expect(rootReadme).toContain("metering");
      expect(rootReadme).toContain("support");
      expect(rootReadme).toContain("launch");
      expect(rootReadme).toContain("referrals");
      expect(rootReadme).toContain("operator APIs");
      expect(integrationsConfig).toContain("export const saasFeatures = {");
      expect(integrationsConfig).toContain("collaboration: true");
      expect(integrationsConfig).toContain("billing: true");
      expect(integrationsConfig).toContain("metering: true");
      expect(integrationsConfig).toContain("support: true");
      expect(integrationsConfig).toContain("launch: true");
      expect(integrationsConfig).toContain("referrals: true");
      expect(integrationsConfig).toContain("operatorApis: true");
    }, 120000);

    it("should scaffold launch-control routes, public-shell copy and the admin contract", async () => {
      const appName = generateAppName("launch-shell");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--saas-launch"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      for (const route of [
        "pricing",
        "faq",
        "changelog",
        "contact",
        "privacy",
        "terms",
      ]) {
        expect(
          fileExists(result.appPath, `apps/web/src/routes/${route}.tsx`),
        ).toBe(true);
      }

      const publicHome = readFile(
        result.appPath,
        "apps/web/src/routes/index.tsx",
      );
      const adminModels = readFile(
        result.appPath,
        "packages/domain/src/admin/models.ts",
      );
      const adminApi = readFile(
        result.appPath,
        "packages/domain/src/admin/api.ts",
      );

      expect(publicHome).toContain("LaunchBanner");
      expect(publicHome).toContain("Request access");
      expect(publicHome).toContain("waitlist");
      expect(publicHome).toContain("See pricing");
      expect(publicHome).toContain("/contact");
      expect(adminModels).toContain("maintenanceMode");
      expect(adminModels).toContain("signupEnabled");
      expect(adminModels).toContain("allowedEmailDomains");
      expect(adminApi).toContain("waitlist");
      expect(adminApi).toContain("AdminOnly");
    }, 120000);

    it("should scaffold the operator CLI and MCP lane over the HTTP API when requested", async () => {
      const appName = generateAppName("operator-lane");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--operator-lane"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(
        fileExists(result.appPath, "packages/operator-core/package.json"),
      ).toBe(true);
      expect(fileExists(result.appPath, "packages/api-cli/package.json")).toBe(
        true,
      );
      expect(fileExists(result.appPath, "packages/api-cli/src/index.ts")).toBe(
        true,
      );
      expect(
        fileExists(result.appPath, "packages/mcp-server/package.json"),
      ).toBe(true);

      const rootPackage = readJson<{
        scripts?: Record<string, string>;
      }>(result.appPath, "package.json");
      const mcpConfig = readJson<{
        mcpServers?: Record<
          string,
          { command?: string; args?: string[]; env?: Record<string, string> }
        >;
      }>(result.appPath, ".mcp.json");
      const operatorCorePackage = readJson<{
        name?: string;
        dependencies?: Record<string, string>;
      }>(result.appPath, "packages/operator-core/package.json");
      const integrationsConfig = readFile(
        result.appPath,
        "packages/config/src/integrations.ts",
      );
      const apiCliPackage = readJson<{
        name?: string;
        bin?: Record<string, string>;
      }>(result.appPath, "packages/api-cli/package.json");
      const apiCliSource = readFile(
        result.appPath,
        "packages/api-cli/src/index.ts",
      );
      const mcpServerSource = readFile(
        result.appPath,
        "packages/mcp-server/src/index.ts",
      );
      const mcpServerCoreSource = readFile(
        result.appPath,
        "packages/mcp-server/src/core.ts",
      );
      const rootReadme = readFile(result.appPath, "README.md");

      expect(rootPackage.scripts?.["api:ops"]).toContain("@gmacko/api-cli");
      expect(rootPackage.scripts?.["mcp:app"]).toContain("@gmacko/mcp-server");
      expect(rootPackage.scripts?.["trpc:ops"]).toBeUndefined();
      expect(operatorCorePackage.name).toBe("@gmacko/operator-core");
      expect(
        operatorCorePackage.dependencies?.["@gmacko/api-client"],
      ).toBeDefined();
      expect(apiCliPackage.name).toBe("@gmacko/api-cli");
      expect(Object.keys(apiCliPackage.bin ?? {})).toContain("gmacko-ops");
      expect(apiCliSource).toContain("@gmacko/operator-core");
      expect(apiCliSource).toContain("HTTP API");
      expect(mcpServerCoreSource).toContain("@gmacko/operator-core");
      expect(mcpServerSource).toContain('name: "gmacko-app"');
      expect(mcpServerSource).not.toContain(
        "Error: GMACKO_API_KEY environment variable is required",
      );
      expect(mcpConfig.mcpServers?.["gmacko-app"]?.command).toBe("pnpm");
      expect(mcpConfig.mcpServers?.["gmacko-app"]?.args).toContain(
        "@gmacko/mcp-server",
      );
      expect(mcpConfig.mcpServers?.["gmacko-app"]?.env).toMatchObject({
        GMACKO_API_URL: "http://localhost:3001",
        GMACKO_API_KEY: "change-me",
      });
      expect(mcpConfig.mcpServers?.["next-devtools"]).toBeUndefined();
      expect(rootReadme).toContain("CLI + MCP wrappers over the same HTTP API");
      expect(rootReadme).toContain("pnpm api:ops -- --help");
      expect(rootReadme).toContain("pnpm api:ops -- auth_help");
      expect(rootReadme).toContain("pnpm api:ops -- get_workspace_context");
      expect(rootReadme).toContain("pnpm api:ops -- list_api_keys");
      expect(rootReadme).toContain("pnpm mcp:app");
      expect(rootReadme).toContain("`admin` scope");
      expect(integrationsConfig).toContain("operatorApis: false");

      const doctorScript = readFile(result.appPath, "scripts/doctor.sh");
      expect(doctorScript).toContain("Operator API lane detected");
      expect(doctorScript).toContain("Operator API env values");
      expect(doctorScript).toContain("GMACKO_API_URL");
      expect(doctorScript).toContain("GMACKO_API_KEY");
    }, 120000);

    it("should omit the generated agent quickstart when AI workflow files are excluded", async () => {
      const appName = generateAppName("no-ai-quickstart");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--no-ai"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const rootReadme = readFile(result.appPath, "README.md");
      expect(rootReadme).not.toContain("## Agent quickstart");
    }, 120000);

    it("should scaffold a mobile QA checklist when Expo is included", async () => {
      const appName = generateAppName("mobile-qa");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, "apps/expo/docs/mobile-qa.md")).toBe(
        true,
      );

      const expoReadme = readFile(result.appPath, "apps/expo/README.md");
      const mobileQa = readFile(result.appPath, "apps/expo/docs/mobile-qa.md");

      expect(expoReadme).toContain("mobile QA checklist");
      expect(mobileQa).toContain("dev client");
      expect(mobileQa).toContain("deep link");
      expect(mobileQa).toContain("auth callback");
      expect(mobileQa).toContain("store metadata");
      expect(mobileQa).toContain("release build");
    }, 120000);

    it("should not generate the mobile QA checklist when Expo is excluded", async () => {
      const appName = generateAppName("no-mobile-qa");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--no-mobile"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, "apps/expo/docs/mobile-qa.md")).toBe(
        false,
      );
    }, 120000);

    it("should avoid legacy eslint suppression comments in scaffold source files", async () => {
      const appName = generateAppName("no-eslint-suppressions");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const sourceFiles = [
        "apps/web/src/lib/api.ts",
        "apps/web/src/server/runtime.ts",
        "packages/api-client/src/client.ts",
        "packages/ui/src/theme.tsx",
      ].map((file) => readFile(result.appPath, file));

      for (const source of sourceFiles) {
        expect(source).not.toContain("eslint-disable");
      }
    }, 120000);

    it("should keep active guidance free of legacy platform names", () => {
      const activeDocs = [
        "../../../../deploy/README.md",
        "../../../../packages/create-gmacko-app/README.md",
        "../../../../docs/ai/IMPLEMENTATION_PLAN.md",
        "../../../../docs/ai/DEVELOPER_EXPERIENCE.md",
        "../../../../docs/ai/SCAFFOLD_SPEC.md",
      ].map((relativePath) =>
        fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"),
      );

      for (const doc of activeDocs) {
        expect(doc).not.toContain("Neon");
        expect(doc).not.toContain("Vercel");
        expect(doc).not.toContain("vinext");
        expect(doc).not.toContain("apps/nextjs");
        expect(doc).not.toContain("trpc:ops");
      }
    });

    it("should provide a substantive current-era implementation plan", () => {
      const plan = fs.readFileSync(
        new URL("../../../../docs/ai/IMPLEMENTATION_PLAN.md", import.meta.url),
        "utf8",
      );

      expect(plan).toContain("**Goal:**");
      expect(plan).toContain("**Architecture:**");
      expect(plan).toContain("**Tech Stack:**");
      expect(plan).toContain("ForgeGraph");
      expect(plan).toContain("D1");
      expect(plan).not.toContain("Postgres");
    });

    it("should keep the workers support matrix explicit about maturity by integration", () => {
      const developerExperience = fs.readFileSync(
        new URL("../../../../docs/ai/DEVELOPER_EXPERIENCE.md", import.meta.url),
        "utf8",
      );

      expect(developerExperience).toContain("Workers Integration Matrix");
      expect(developerExperience).toContain("Sentry");
      expect(developerExperience).toContain("PostHog");
      expect(developerExperience).toContain("Stripe");
      expect(developerExperience).toContain("stable");
      expect(developerExperience).toContain("experimental");
      expect(developerExperience).toContain("unsupported");
    });

    it("should scaffold a modern tooling baseline", async () => {
      const appName = generateAppName("modern-tooling");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, "biome.json")).toBe(true);
      expect(fileExists(result.appPath, ".oxlintrc.json")).toBe(true);
      expect(fileExists(result.appPath, "lefthook.yml")).toBe(true);
      expect(fileExists(result.appPath, "commitlint.config.mjs")).toBe(true);
      expect(fileExists(result.appPath, "knip.json")).toBe(true);
      expect(fileExists(result.appPath, "scripts/doctor.sh")).toBe(true);
      expect(fileExists(result.appPath, "scripts/bootstrap-local.sh")).toBe(
        true,
      );
      expect(fileExists(result.appPath, "scripts/deploy-stage.mjs")).toBe(true);
      expect(
        fileExists(result.appPath, "scripts/check-app-standards.mjs"),
      ).toBe(true);

      const pkg = readJson<{
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
      }>(result.appPath, "package.json");
      const setupScript = readFile(result.appPath, "scripts/setup.sh");
      const doctorScript = readFile(result.appPath, "scripts/doctor.sh");
      const bootstrapScript = readFile(
        result.appPath,
        "scripts/bootstrap-local.sh",
      );
      const envExample = readFile(result.appPath, ".env.example");
      const rootReadme = readFile(result.appPath, "README.md");

      expect(pkg.devDependencies?.["@biomejs/biome"]).toBeDefined();
      expect(pkg.devDependencies?.oxlint).toBeDefined();
      expect(pkg.devDependencies?.lefthook).toBeDefined();
      expect(pkg.devDependencies?.["@commitlint/cli"]).toBeDefined();
      expect(
        pkg.devDependencies?.["@commitlint/config-conventional"],
      ).toBeDefined();
      expect(pkg.devDependencies?.["@forgegraph/cli"]).toBe("^0.3.0");
      expect(pkg.devDependencies?.["@gmacko/emulate"]).toBeDefined();
      expect(pkg.devDependencies?.knip).toBeDefined();
      expect(pkg.scripts?.["lint:ox"]).toBeDefined();
      expect(pkg.scripts?.["format:check"]).toBeDefined();
      expect(pkg.scripts?.["format:fix"]).toBeDefined();
      expect(pkg.scripts?.doctor).toBe("./scripts/doctor.sh");
      expect(pkg.scripts?.["bootstrap:local"]).toBe(
        "./scripts/bootstrap-local.sh",
      );
      expect(pkg.scripts?.["check:fast"]).toBe(
        "pnpm lint && pnpm typecheck && pnpm check:standards",
      );
      expect(pkg.scripts?.check).toBe(
        "pnpm check:fast && pnpm test && pnpm build",
      );
      expect(pkg.scripts?.["check:standards"]).toBe(
        "node scripts/check-app-standards.mjs",
      );
      expect(pkg.scripts?.["test:workers"]).toBe("turbo run test:workers");
      expect(pkg.scripts?.["e2e:cli:full"]).toBe(
        "RUN_E2E=true pnpm --dir packages/create-gmacko-app exec vitest run src/__tests__/e2e.test.ts",
      );
      expect(pkg.scripts?.["release:cli:dry-run"]).toBeDefined();
      expect(pkg.scripts?.["check:release"]).toBe(
        "pnpm --dir packages/create-gmacko-app test && pnpm --dir packages/create-gmacko-app build && pnpm release:cli:dry-run",
      );
      expect(pkg.scripts?.dev).toContain("dev:emulate");
      expect(pkg.scripts?.dev).toContain("dev:web");
      expect(pkg.scripts?.["dev:web"]).toBe("pnpm -F @gmacko/web dev:portless");
      expect(pkg.scripts?.["db:generate"]).toBe("pnpm -F @gmacko/db generate");
      expect(pkg.scripts?.["db:migrate:local"]).toBe(
        "pnpm -F @gmacko/db migrate:local",
      );
      expect(pkg.scripts?.["db:migrate:remote"]).toBe(
        "pnpm -F @gmacko/db migrate:remote",
      );
      expect(pkg.scripts?.["db:seed"]).toBe("pnpm -F @gmacko/db seed:local");
      expect(pkg.scripts?.["deploy:staging"]).toBe(
        "node scripts/deploy-stage.mjs --stage staging",
      );
      expect(pkg.scripts?.["deploy:production"]).toBe(
        "node scripts/deploy-stage.mjs --stage production",
      );
      expect(pkg.scripts?.["secrets:push"]).toBe(
        "node scripts/secrets-push.mjs",
      );
      expect(pkg.scripts?.["forge:init"]).toBe("forge init --full");
      expect(pkg.scripts?.["forge:doctor"]).toBe("forge doctor");
      expect(pkg.scripts?.["forge:status"]).toBe("forge status");
      expect(pkg.scripts?.["forge:diff"]).toBe("forge diff");
      expect(pkg.scripts?.["forge:apply"]).toBe("forge apply");
      expect(pkg.scripts?.["forge:pull"]).toBe("forge pull");
      expect(pkg.scripts?.["forge:deploy:staging"]).toBe(
        "forge deploy create staging --wait",
      );
      expect(pkg.scripts?.["forge:deploy:production"]).toBe(
        "forge deploy create production --wait",
      );
      expect(pkg.scripts?.["forge:stages"]).toBe("forge stage list");
      expect(pkg.scripts?.knip).toBeDefined();
      expect(pkg.scripts?.prepare).toBe(
        "git rev-parse --git-dir >/dev/null 2>&1 && lefthook install || true",
      );
      expect(setupScript).toContain('REQUIRED_NODE_VERSION="24"');
      expect(setupScript).toContain("pnpm bootstrap:local");
      expect(setupScript).toContain("@forgegraph/cli");
      expect(setupScript).toContain("pnpm forge:doctor");
      expect(bootstrapScript).toContain("pnpm doctor");
      expect(bootstrapScript).toContain("pnpm auth:generate");
      expect(bootstrapScript).toContain("pnpm db:generate");
      expect(bootstrapScript).toContain("pnpm db:migrate:local");
      expect(bootstrapScript).toContain(
        'if [ -f apps/web/wrangler.jsonc ]; then\n  echo "Applying D1 migrations to the local database..."\n  pnpm db:migrate:local\n  pnpm db:seed',
      );
      expect(bootstrapScript).toContain("Skipping D1 migrate/seed");
      expect(bootstrapScript).not.toContain("db:legacy:push");
      expect(bootstrapScript).not.toContain("docker");
      expect(bootstrapScript).toContain("pnpm check:fast");
      expect(bootstrapScript).toContain("pnpm dev:emulate");
      expect(bootstrapScript).toContain(
        "ForgeGraph placeholders are still present in .forgegraph.yaml",
      );
      expect(bootstrapScript).toContain("pnpm forge:apply");
      expect(doctorScript).toContain(
        "Checking local development prerequisites",
      );
      expect(doctorScript).toContain("ForgeGraph CLI");
      expect(doctorScript).toContain("@forgegraph/cli");
      expect(doctorScript).toContain("Core app env values");
      expect(doctorScript).toContain("ForgeGraph deploy values");
      expect(doctorScript).toContain("Feature flags");
      expect(doctorScript).toContain("Background jobs");
      expect(doctorScript).toContain("Rate limits");
      expect(doctorScript).toContain("Compliance export hooks");
      expect(doctorScript).toContain(
        ".forgegraph.yaml still has placeholder ForgeGraph values; update server, domains, and stage node IDs before deploying",
      );
      expect(doctorScript).toContain("Cloudflare Workers lane detected");
      expect(doctorScript).toContain("Wrangler CLI available");
      expect(doctorScript).toContain("Cloudflare Workers env values");
      expect(doctorScript).toContain(".dev.vars");
      expect(doctorScript).not.toContain("Docker");
      expect(doctorScript).not.toContain("DATABASE_URL");
      expect(envExample).toContain("# WEB APP (apps/web)");
      expect(envExample).toContain("# MOBILE APP ENV");
      expect(envExample).toContain("# CLOUDFLARE (deploys");
      expect(envExample).toContain('STAGE="development"');
      expect(envExample).toContain("pnpm secrets:push --stage");
      expect(envExample).not.toContain("# LEGACY");
      expect(envExample).not.toContain("postgresql://");
      expect(rootReadme).toContain("@forgegraph/cli");
      expect(
        fs.statSync(path.join(result.appPath, "scripts/setup.sh")).mode & 0o111,
      ).toBeTruthy();
      expect(
        fs.statSync(path.join(result.appPath, "scripts/doctor.sh")).mode &
          0o111,
      ).toBeTruthy();
      expect(
        fs.statSync(path.join(result.appPath, "scripts/bootstrap-local.sh"))
          .mode & 0o111,
      ).toBeTruthy();
    }, 120000);

    it("should scaffold Resend-aware doctor checks when email integration is enabled", async () => {
      const appName = generateAppName("resend-doctor");
      const result = await runCli({
        appName,
        flags: [
          "--yes",
          "--no-install",
          "--no-git",
          "--integrations",
          "email",
          "--email-provider",
          "resend",
        ],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const doctorScript = readFile(result.appPath, "scripts/doctor.sh");
      const integrationsConfig = readFile(
        result.appPath,
        "packages/config/src/integrations.ts",
      );

      expect(integrationsConfig).toContain('provider: "resend"');
      expect(doctorScript).toContain("Resend email env values");
      expect(doctorScript).toContain("RESEND_API_KEY");
    }, 120000);

    it("should warn that realtime is Node-only when it is enabled", async () => {
      const appName = generateAppName("realtime-warning");
      const result = await runCli({
        appName,
        flags: [
          "--yes",
          "--no-install",
          "--no-git",
          "--integrations",
          "realtime",
        ],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, "packages/realtime/package.json")).toBe(
        true,
      );
      expect(result.stdout).toContain("Node-only");

      const integrationsConfig = readFile(
        result.appPath,
        "packages/config/src/integrations.ts",
      );
      expect(integrationsConfig).toContain('provider: "redis"');
      expect(integrationsConfig).toContain("Node-only");

      const rootReadme = readFile(result.appPath, "README.md");
      expect(rootReadme).toContain("Node services only");
    }, 120000);

    it("should initialize a jj repo by default", async () => {
      const appName = generateAppName("jj-repo");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, ".git")).toBe(true);
      // jj creates a colocated repo (.jj + .git) when installed; otherwise the
      // scaffolder falls back to a plain git repo. Don't require jj on the runner
      // (CI ubuntu images don't ship it).
      if (isCommandAvailable("jj")) {
        expect(fileExists(result.appPath, ".jj")).toBe(true);
      } else {
        expect(fileExists(result.appPath, ".jj")).toBe(false);
      }
    }, 120000);

    it("should scaffold without the legacy eslint and prettier stack", async () => {
      const appName = generateAppName("no-legacy-lint-stack");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, "tooling/eslint")).toBe(false);
      expect(fileExists(result.appPath, "tooling/prettier")).toBe(false);
      expect(fileExists(result.appPath, "apps/web/eslint.config.ts")).toBe(
        false,
      );
      expect(fileExists(result.appPath, "packages/db/eslint.config.ts")).toBe(
        false,
      );

      const rootPkg = readJson<{
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
      }>(result.appPath, "package.json");
      const webPkg = readJson<{
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
      }>(result.appPath, "apps/web/package.json");

      expect(rootPkg.devDependencies?.prettier).toBeFalsy();
      expect(rootPkg.devDependencies?.["@gmacko/prettier-config"]).toBeFalsy();
      expect(rootPkg.scripts?.format).not.toContain("prettier");
      expect(rootPkg.scripts?.lint).not.toContain("eslint");

      expect(webPkg.devDependencies?.eslint).toBeFalsy();
      expect(webPkg.devDependencies?.prettier).toBeFalsy();
      expect(webPkg.devDependencies?.["@gmacko/eslint-config"]).toBeFalsy();
      expect(webPkg.devDependencies?.["@gmacko/prettier-config"]).toBeFalsy();
      expect(webPkg.scripts?.format).toContain("biome");
      expect(webPkg.scripts?.lint).toContain("oxlint");
    }, 120000);
  });

  it("keeps the template release workflow scoped to the CLI package", () => {
    const releaseWorkflow = fs.readFileSync(
      path.resolve(process.cwd(), "../../.github/workflows/release.yml"),
      "utf8",
    );

    expect(releaseWorkflow).toContain(
      "pnpm --dir packages/create-gmacko-app test",
    );
    expect(releaseWorkflow).toContain(
      "pnpm --dir packages/create-gmacko-app build",
    );
    expect(releaseWorkflow).toContain("pnpm release:cli:dry-run");
    expect(releaseWorkflow).not.toContain("pnpm check:release");
    expect(releaseWorkflow).not.toContain(
      "pnpm --filter create-gmacko-app test",
    );
  });

  it("keeps the CLI E2E workflow aligned with the current template baseline", () => {
    const e2eWorkflow = fs.readFileSync(
      path.resolve(process.cwd(), "../../.github/workflows/cli-e2e.yml"),
      "utf8",
    );

    expect(e2eWorkflow).toContain('node-version-file: ".nvmrc"');
    expect(e2eWorkflow).not.toContain("node-version: 22");
    expect(e2eWorkflow).not.toContain("2>&1 || true");
    expect(e2eWorkflow).toContain("pnpm run doctor");
    expect(e2eWorkflow).toContain("pnpm check:fast");
    expect(e2eWorkflow).toContain(
      "pnpm --dir packages/create-gmacko-app build",
    );
    // The mock .env mirrors .env.example: Worker bindings, no DATABASE_URL.
    expect(e2eWorkflow).toContain('STAGE="development"');
    expect(e2eWorkflow).toContain('AUTH_GITHUB_ID="test-github-client-id"');
    expect(e2eWorkflow).toContain(
      'AUTH_GITHUB_SECRET="test-github-client-secret"',
    );
    expect(e2eWorkflow).toContain(
      'CLOUDFLARE_ACCOUNT_ID="test-cloudflare-account"',
    );
    expect(e2eWorkflow).toContain(
      'CLOUDFLARE_API_TOKEN="test-cloudflare-token"',
    );
    expect(e2eWorkflow).toContain(
      'EXPO_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"',
    );
    expect(e2eWorkflow).not.toContain("DATABASE_URL");
    expect(e2eWorkflow).not.toContain("NEXT_PUBLIC_");
    // The matrix: default, operators, minimal (web only), custom scope, full, mobile only.
    expect(e2eWorkflow).toContain("pnpm --filter @gmacko/web build");
    expect(e2eWorkflow).toContain("pnpm --filter @mycompany/web build");
    expect(e2eWorkflow).toContain("pnpm --filter @gmacko/expo typecheck");
    expect(e2eWorkflow).toContain(
      "pnpm --filter @gmacko/expo exec expo start --dev-client --help",
    );
    expect(e2eWorkflow).toContain(
      "pnpm --filter @gmacko/expo exec expo config --json",
    );
    expect(e2eWorkflow).toContain("--operator-lane");
    expect(e2eWorkflow).toContain("pnpm api:ops -- --help");
    expect(e2eWorkflow).toContain("Operator API env values");
    expect(e2eWorkflow).toContain('GMACKO_API_URL="http://localhost:3001"');
    expect(e2eWorkflow).toContain('GMACKO_API_KEY="test-gmacko-api-key"');
    expect(e2eWorkflow).toContain("pnpm exec forge version");
    expect(e2eWorkflow).toContain("forge stage list");
    expect(e2eWorkflow).toContain("forge deploy create staging --wait");
    expect(e2eWorkflow).toContain("pnpm auth:generate");
    expect(e2eWorkflow).toContain("pnpm db:generate");
    expect(e2eWorkflow).toContain("pnpm db:migrate:local");
    expect(e2eWorkflow).toContain("pnpm db:seed");
    expect(e2eWorkflow).toContain("pnpm test:workers");
    expect(e2eWorkflow).toContain("Cloudflare Workers lane detected");
    expect(e2eWorkflow).toContain("Cloudflare Workers env values");
    expect(e2eWorkflow).toContain("--no-web");
    expect(e2eWorkflow).toContain("test ! -d apps/web");
    expect(e2eWorkflow).toContain("fake-wrangler");
    expect(e2eWorkflow).toContain('RUN_E2E: "true"');
    expect(e2eWorkflow).toContain(
      "pnpm --dir packages/create-gmacko-app exec vitest run src/__tests__/e2e.test.ts",
    );
    expect(e2eWorkflow).not.toContain("nextjs");
    expect(e2eWorkflow).not.toContain("vinext");
    expect(e2eWorkflow).not.toContain("trpc");
    expect(e2eWorkflow).not.toContain("legacy-");
  });

  it("keeps repo formatting focused on first-party files", () => {
    const biomeConfig = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "../../biome.json"), "utf8"),
    ) as {
      files?: {
        includes?: string[];
      };
      css?: {
        parser?: {
          tailwindDirectives?: boolean;
        };
      };
    };
    const compiledTsconfig = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "../../tooling/typescript/compiled-package.json",
      ),
      "utf8",
    );
    const baseTsconfig = fs.readFileSync(
      path.resolve(process.cwd(), "../../tooling/typescript/base.json"),
      "utf8",
    );

    expect(biomeConfig.files?.includes).toContain("!**/.claude");
    expect(biomeConfig.css?.parser?.tailwindDirectives).toBe(true);
    expect(() => JSON.parse(compiledTsconfig)).not.toThrow();
    expect(() => JSON.parse(baseTsconfig)).not.toThrow();
  });

  it("keeps local release artifacts out of git status", () => {
    const gitignore = fs.readFileSync(
      path.resolve(process.cwd(), "../../.gitignore"),
      "utf8",
    );

    expect(gitignore).toContain(".artifacts");
  });

  it("keeps repo lint noise focused on first-party files", () => {
    const oxlintConfig = JSON.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), "../../.oxlintrc.json"),
        "utf8",
      ),
    ) as {
      ignorePatterns?: string[];
    };
    const indexSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/index.ts"),
      "utf8",
    );
    const promptsSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/prompts.ts"),
      "utf8",
    );
    const testSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/__tests__/scaffold.test.ts"),
      "utf8",
    );
    const testImportBlock = testSource.split("\n").slice(0, 4).join("\n");

    expect(oxlintConfig.ignorePatterns).toContain(".claude/**");
    expect(indexSource).not.toContain("DEFAULT_INTEGRATIONS");
    expect(indexSource).not.toContain("storageProvider?: string");
    expect(promptsSource).not.toContain("PlatformConfig");
    expect(testImportBlock).not.toContain("beforeEach");
  });

  it("keeps the scaffolder sources free of the pre-migration stack", () => {
    const sources = [
      "index.ts",
      "prompts.ts",
      "scaffold.ts",
      "types.ts",
      "provision.ts",
    ]
      .map((file) => path.resolve(process.cwd(), "src", file))
      .map((file) => fs.readFileSync(file, "utf8"));

    for (const source of sources) {
      expect(source).not.toContain("tanstackStart");
      expect(source).not.toContain("vinext");
      expect(source).not.toContain("apps/nextjs");
      expect(source).not.toContain("@gmacko/nextjs");
      expect(source).not.toContain("legacy-");
      expect(source).not.toContain("trpc");
      expect(source).not.toContain("postgres");
    }
  });

  describe("platform options", () => {
    it("should exclude the web app and its root wiring when --no-web is passed", async () => {
      const appName = generateAppName("no-web");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--no-web"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, "apps/web")).toBe(false);
      expect(fileExists(result.appPath, "apps/expo")).toBe(true);
      expect(fileExists(result.appPath, ".github/workflows/preview.yml")).toBe(
        false,
      );

      const rootPkg = readJson<{ scripts?: Record<string, string> }>(
        result.appPath,
        "package.json",
      );
      const portless = readJson<{ apps?: Record<string, unknown> }>(
        result.appPath,
        "portless.json",
      );
      const forgeGraphConfig = readFile(result.appPath, ".forgegraph.yaml");

      expect(rootPkg.scripts?.dev).toBe("pnpm dev:emulate");
      for (const script of [
        "dev:web",
        "dev:app",
        "e2e:web",
        "cf-typegen",
        "check:cf-types",
        "deploy:migrate",
        "deploy:staging",
        "deploy:production",
        "secrets:push",
      ]) {
        expect(rootPkg.scripts?.[script]).toBeUndefined();
      }
      expect(portless.apps?.["apps/web"]).toBeUndefined();
      expect(forgeGraphConfig).toContain(`app: ${appName}`);
      expect(forgeGraphConfig).not.toContain("stages:");
      expect(forgeGraphConfig).toContain(
        "# primary web service path: apps/expo",
      );
      expect(forgeGraphConfig).toContain("mobile-only scaffold");
      expect(result.stdout).toContain("EXPO_PUBLIC_API_URL");
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
      expect(fileExists(result.appPath, "apps/web")).toBe(true);
    }, 120000);

    it("should refuse to scaffold nothing when both platforms are excluded", async () => {
      const appName = generateAppName("no-platforms");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--no-web", "--no-mobile"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Nothing to scaffold");
      expect(fileExists(result.appPath, "package.json")).toBe(false);
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
      expect(fileExists(result.appPath, ".claude")).toBe(false);
      expect(fileExists(result.appPath, "CLAUDE.md")).toBe(false);
      expect(fileExists(result.appPath, "docs/ai")).toBe(false);
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

    it("should prune unused packages and their web wiring when --prune is passed", async () => {
      const appName = generateAppName("pruned");
      const result = await runCli({
        appName,
        flags: [
          "--yes",
          "--no-install",
          "--no-git",
          "--no-mobile",
          "--no-ai",
          "--prune",
          "--integrations",
          "", // No integrations = prune all optional packages
        ],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      // These packages should be removed when their integrations are disabled
      for (const pkg of [
        "monitoring",
        "analytics",
        "payments",
        "purchases",
        "notifications",
        "email",
        "realtime",
        "storage",
      ]) {
        expect(fileExists(result.appPath, `packages/${pkg}`)).toBe(false);
      }

      const webPkg = readJson<{
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      }>(result.appPath, "apps/web/package.json");
      const webProviders = readFile(
        result.appPath,
        "apps/web/src/providers.tsx",
      );
      const stripeWebhook = readFile(
        result.appPath,
        "apps/web/src/server/stripe-webhook.ts",
      );

      expect(webPkg.dependencies?.["@gmacko/analytics"]).toBeUndefined();
      expect(webPkg.dependencies?.["@gmacko/payments"]).toBeUndefined();
      expect(webPkg.dependencies?.["@gmacko/monitoring"]).toBeUndefined();
      expect(webPkg.dependencies?.["@gmacko/api"]).toBeDefined();
      expect(webProviders).not.toContain("@gmacko/analytics/web");
      expect(stripeWebhook).not.toContain("@gmacko/payments");
      expect(stripeWebhook).toContain("webhook not configured");
      expect(
        fileExists(
          result.appPath,
          "apps/web/src/server/__tests__/stripe-webhook.test.ts",
        ),
      ).toBe(false);

      // No remaining workspace package may still declare a pruned dependency.
      for (const dir of ["apps", "packages", "tooling"]) {
        const base = path.join(result.appPath, dir);
        if (!fs.existsSync(base)) continue;
        for (const entry of fs.readdirSync(base)) {
          const pkgPath = path.join(base, entry, "package.json");
          if (!fs.existsSync(pkgPath)) continue;
          const pkg = fs.readJsonSync(pkgPath) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
          };
          for (const dep of [
            "@gmacko/monitoring",
            "@gmacko/analytics",
            "@gmacko/payments",
            "@gmacko/email",
            "@gmacko/realtime",
            "@gmacko/storage",
          ]) {
            expect(pkg.dependencies?.[dep]).toBeUndefined();
            expect(pkg.devDependencies?.[dep]).toBeUndefined();
          }
        }
      }
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
      for (const [pkgPath, expected] of [
        ["packages/api/package.json", "@myorg/api"],
        ["packages/domain/package.json", "@myorg/domain"],
        ["packages/api-client/package.json", "@myorg/api-client"],
        ["packages/db/package.json", "@myorg/db"],
        ["packages/auth/package.json", "@myorg/auth"],
        ["apps/web/package.json", "@myorg/web"],
        ["apps/expo/package.json", "@myorg/expo"],
      ] as const) {
        const pkg = readJson<{ name: string }>(result.appPath, pkgPath);
        expect(pkg.name).toBe(expected);
      }

      const webPkg = readJson<{ dependencies?: Record<string, string> }>(
        result.appPath,
        "apps/web/package.json",
      );
      expect(webPkg.dependencies?.["@myorg/api"]).toBe("workspace:*");

      // @gmacko/emulate is an external dev dependency and must keep its name.
      const rootPkg = readJson<{ devDependencies?: Record<string, string> }>(
        result.appPath,
        "package.json",
      );
      expect(rootPkg.devDependencies?.["@gmacko/emulate"]).toBeDefined();
      expect(rootPkg.devDependencies?.["@myorg/emulate"]).toBeUndefined();
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
      expect(manifest.platforms).toEqual({ web: true, mobile: true });
      expect(manifest.scaffoldedAt).toBeDefined();
      expect(manifest.packageScope).toBe("@gmacko");
    }, 120000);
  });
});
