import path from "node:path";
import fs from "fs-extra";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupApp,
  ensureTempDir,
  EXPECTED_FILES,
  fileExists,
  generateAppName,
  readFile,
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

    it("should include Storybook for the web app by default", async () => {
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
      expect(repoSkill).toContain("apps/nextjs");
      expect(repoSkill).toContain("packages/ui");
      expect(repoSkill).toContain("docs/ai");
      expect(repoSkill).toContain("Storybook");
    }, 120000);

    it("should scaffold postgres-first runtime files with nix support", async () => {
      const appName = generateAppName("postgres-nix");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, "flake.nix")).toBe(true);

      const dbPackage = readJson<{
        dependencies?: Record<string, string>;
      }>(result.appPath, "packages/db/package.json");
      const dbClient = readFile(result.appPath, "packages/db/src/client.ts");

      expect(dbPackage.dependencies?.postgres).toBeDefined();
      expect(dbPackage.dependencies?.["@neondatabase/serverless"]).toBeFalsy();
      expect(dbClient).toContain('from "postgres"');
      expect(dbClient).toContain('from "drizzle-orm/postgres-js"');
      expect(dbClient).not.toContain("@neondatabase/serverless");
      expect(dbClient).not.toContain("drizzle-orm/neon-http");
    }, 120000);

    it("should scaffold ForgeGraph repo metadata by default", async () => {
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
      expect(forgeGraphConfig).toContain("stages:");
      expect(forgeGraphConfig).toContain("- name: staging");
      expect(forgeGraphConfig).toContain("- name: production");
      expect(forgeGraphConfig).toContain("nodeId: change-me-staging-node");
      expect(forgeGraphConfig).toContain("nodeId: change-me-production-node");
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
          "--forgegraph-staging-node",
          "node-staging-1",
          "--forgegraph-production-node",
          "node-production-1",
        ],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const forgeGraphConfig = readFile(result.appPath, ".forgegraph.yaml");

      expect(forgeGraphConfig).toContain("server: https://forge.gmac.io");
      expect(forgeGraphConfig).toContain("nodeId: node-staging-1");
      expect(forgeGraphConfig).toContain("nodeId: node-production-1");
    }, 120000);

    it("should scaffold vinext support when requested", async () => {
      const appName = generateAppName("vinext");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--vinext"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);
      expect(fileExists(result.appPath, "apps/nextjs/vite.config.ts")).toBe(true);
      expect(fileExists(result.appPath, "apps/nextjs/wrangler.jsonc")).toBe(true);
      expect(fileExists(result.appPath, "apps/nextjs/worker/index.ts")).toBe(
        true,
      );

      const nextPkg = readJson<{
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
      }>(result.appPath, "apps/nextjs/package.json");
      const viteConfig = readFile(result.appPath, "apps/nextjs/vite.config.ts");
      const wranglerConfig = readFile(
        result.appPath,
        "apps/nextjs/wrangler.jsonc",
      );
      const cloudflareEnv = readFile(
        result.appPath,
        "apps/nextjs/src/cloudflare-env.ts",
      );
      const envExample = readFile(result.appPath, ".env.example");
      const cloudflareReadme = readFile(
        result.appPath,
        "deploy/cloudflare/README.md",
      );

      expect(nextPkg.scripts?.["dev:vinext"]).toBeDefined();
      expect(nextPkg.scripts?.["build:vinext"]).toBeDefined();
      expect(nextPkg.scripts?.["deploy:cloudflare"]).toBeDefined();
      expect(nextPkg.scripts?.["deploy:cloudflare:staging"]).toBeDefined();
      expect(nextPkg.scripts?.["deploy:cloudflare:production"]).toBeDefined();
      expect(nextPkg.scripts?.["prebuild:vinext"]).toBe(
        "pnpm --dir ../.. --filter @gmacko/nextjs^... build",
      );
      expect(nextPkg.scripts?.["build:vinext"]).toContain("pnpm prebuild:vinext");
      expect(nextPkg.scripts?.["build:vinext"]).toContain("pnpm with-env vinext build");
      expect(nextPkg.scripts?.["deploy:cloudflare:staging"]).toContain(
        "pnpm with-env wrangler deploy --env staging",
      );
      expect(nextPkg.scripts?.["deploy:cloudflare:production"]).toContain(
        "pnpm with-env wrangler deploy",
      );
      const nextDevDependencyNames = Object.keys(nextPkg.devDependencies ?? {});
      expect(nextDevDependencyNames).toEqual(
        [...nextDevDependencyNames].sort((left, right) =>
          left.localeCompare(right),
        ),
      );
      expect(nextPkg.devDependencies?.vinext).toBeDefined();
      expect(nextPkg.devDependencies?.vite).toBeDefined();
      expect(nextPkg.devDependencies?.wrangler).toBeDefined();
      expect(nextPkg.devDependencies?.["@vitejs/plugin-rsc"]).toBeDefined();
      expect(viteConfig).toContain('@cloudflare/vite-plugin');
      expect(viteConfig).toContain("cloudflare({");
      expect(wranglerConfig).toContain(`"name": "${appName}"`);
      expect(wranglerConfig).toContain('"compatibility_date"');
      expect(wranglerConfig).toContain('"compatibility_flags"');
      expect(wranglerConfig).toContain('"nodejs_compat"');
      expect(wranglerConfig).toContain('"main": "./worker/index.ts"');
      expect(wranglerConfig).toContain('"assets"');
      expect(wranglerConfig).toContain('"binding": "ASSETS"');
      expect(wranglerConfig).toContain('"images"');
      expect(wranglerConfig).toContain('"binding": "IMAGES"');
      expect(wranglerConfig).toContain('"vars"');
      expect(wranglerConfig).toContain('"APP_ENV": "production"');
      expect(wranglerConfig).toContain('"env"');
      expect(wranglerConfig).toContain('"staging"');
      expect(cloudflareEnv).toContain("CLOUDFLARE_ACCOUNT_ID");
      expect(cloudflareEnv).toContain("CLOUDFLARE_API_TOKEN");
      expect(envExample).toContain("CLOUDFLARE_ACCOUNT_ID");
      expect(envExample).toContain("CLOUDFLARE_API_TOKEN");
      expect(cloudflareReadme).toContain("pnpm --filter @gmacko/nextjs build:vinext");
      expect(cloudflareReadme).toContain(
        "pnpm --filter @gmacko/nextjs deploy:cloudflare:staging",
      );
      expect(cloudflareReadme).toContain(
        "pnpm --filter @gmacko/nextjs deploy:cloudflare:production",
      );
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
      }>(result.appPath, "apps/expo/package.json");
      const expoReadme = readFile(result.appPath, "apps/expo/README.md");
      const expoConfig = readFile(result.appPath, "apps/expo/app.config.ts");
      const rootReadme = readFile(result.appPath, "README.md");

      expect(expoPkg.scripts?.["dev:client"]).toBeDefined();
      expect(expoPkg.scripts?.["build:device:ios"]).toBeDefined();
      expect(expoPkg.scripts?.["build:device:android"]).toBeDefined();
      expect(expoReadme).toContain("Expo Orbit");
      expect(expoReadme).toContain("development build");
      expect(expoConfig).toContain(`slug: "${appName}"`);
      expect(expoConfig).toContain(`scheme: "${appName}"`);
      expect(expoConfig).toContain(
        `const base = "com.gmacko.${appName.replace(/-/g, "")}"`,
      );
      expect(rootReadme).toContain("Expo Orbit");
      expect(rootReadme).toContain("dev:client");
    }, 120000);

    it("should scaffold web env files without vercel presets", async () => {
      const appName = generateAppName("no-vercel-env");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--tanstack-start"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const nextEnv = readFile(result.appPath, "apps/nextjs/src/env.ts");
      const tanstackEnv = readFile(
        result.appPath,
        "apps/tanstack-start/src/env.ts",
      );

      expect(nextEnv).not.toContain("presets-zod");
      expect(nextEnv).not.toContain("vercel()");
      expect(tanstackEnv).not.toContain("presets-zod");
      expect(tanstackEnv).not.toContain("vercel()");
    }, 120000);

    it("should scaffold without vercel-specific runtime env hooks", async () => {
      const appName = generateAppName("no-vercel-runtime");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--tanstack-start"],
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

    it("should scaffold a ForgeGraph-oriented preview workflow", async () => {
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

      expect(previewWorkflow).toContain("ForgeGraph");
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
      expect(claudeInstructions).toContain("AGENTS.md");
      expect(developerExperience).toContain("ForgeGraph");
      expect(developerExperience).toContain("vinext");
      expect(developerExperience).toContain("Expo Orbit");
      expect(claudeSettings.permissions?.additionalDirectories).toContain(
        "../ForgeGraph",
      );
      expect(openCodeConfig.instructions).toContain("AGENTS.md");
      expect(openCodeConfig.instructions).toContain("docs/ai/DEVELOPER_EXPERIENCE.md");
      expect(mcpConfig.mcpServers?.["next-devtools"]?.command).toBe("npx");
      expect(mcpConfig.mcpServers?.["next-devtools"]?.args).toContain(
        "next-devtools-mcp@latest",
      );
    }, 120000);

    it("should avoid legacy eslint suppression comments in scaffold source files", async () => {
      const appName = generateAppName("no-eslint-suppressions");
      const result = await runCli({
        appName,
        flags: ["--yes", "--no-install", "--no-git", "--tanstack-start"],
        cwd: tempDir,
      });

      appsToClean.push(result.appPath);

      expect(result.exitCode).toBe(0);

      const sourceFiles = [
        "apps/nextjs/src/trpc/react.tsx",
        "apps/nextjs/src/trpc/server.tsx",
        "apps/tanstack-start/src/lib/url.ts",
        "apps/tanstack-start/src/routeTree.gen.ts",
        "packages/trpc-client/src/client.ts",
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
        "../../../../docs/plans/2026-01-14-e2e-implementation.md",
        "../../../../docs/plans/2026-01-14-e2e-testing-plan.md",
      ].map((relativePath) =>
        fs.readFileSync(
          new URL(relativePath, import.meta.url),
          "utf8",
        ),
      );

      for (const doc of activeDocs) {
        expect(doc).not.toContain("Neon");
        expect(doc).not.toContain("Vercel");
      }
    });

    it("should provide substantive current-era implementation plans", () => {
      const activePlans = [
        fs.readFileSync(
          new URL("../../../../docs/ai/IMPLEMENTATION_PLAN.md", import.meta.url),
          "utf8",
        ),
        fs.readFileSync(
          new URL(
            "../../../../docs/plans/2026-01-14-e2e-implementation.md",
            import.meta.url,
          ),
          "utf8",
        ),
        fs.readFileSync(
          new URL(
            "../../../../docs/plans/2026-01-14-e2e-testing-plan.md",
            import.meta.url,
          ),
          "utf8",
        ),
      ];

      for (const plan of activePlans) {
        expect(plan).toContain("**Goal:**");
        expect(plan).toContain("**Architecture:**");
        expect(plan).toContain("**Tech Stack:**");
        expect(plan).toContain("ForgeGraph");
        expect(plan).toContain("Postgres");
      }
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

      const pkg = readJson<{
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
      }>(result.appPath, "package.json");
      const setupScript = readFile(result.appPath, "scripts/setup.sh");
      const doctorScript = readFile(result.appPath, "scripts/doctor.sh");

      expect(pkg.devDependencies?.["@biomejs/biome"]).toBeDefined();
      expect(pkg.devDependencies?.oxlint).toBeDefined();
      expect(pkg.devDependencies?.lefthook).toBeDefined();
      expect(pkg.devDependencies?.["@commitlint/cli"]).toBeDefined();
      expect(pkg.devDependencies?.["@commitlint/config-conventional"]).toBeDefined();
      expect(pkg.devDependencies?.knip).toBeDefined();
      expect(pkg.scripts?.["lint:ox"]).toBeDefined();
      expect(pkg.scripts?.["format:check"]).toBeDefined();
      expect(pkg.scripts?.["format:fix"]).toBeDefined();
      expect(pkg.scripts?.doctor).toBe("./scripts/doctor.sh");
      expect(pkg.scripts?.["check:fast"]).toBe("pnpm lint && pnpm typecheck");
      expect(pkg.scripts?.check).toBe(
        "pnpm check:fast && pnpm test && pnpm build",
      );
      expect(pkg.scripts?.["release:cli:dry-run"]).toBeDefined();
      expect(pkg.scripts?.["check:release"]).toBe(
        "pnpm --dir packages/create-gmacko-app test && pnpm --dir packages/create-gmacko-app build && pnpm release:cli:dry-run",
      );
      expect(pkg.scripts?.["fg:init"]).toBe("fg init --full");
      expect(pkg.scripts?.["fg:doctor"]).toBe("fg doctor");
      expect(pkg.scripts?.["fg:status"]).toBe("fg status");
      expect(pkg.scripts?.knip).toBeDefined();
      expect(pkg.scripts?.prepare).toBe(
        "git rev-parse --git-dir >/dev/null 2>&1 && lefthook install || true",
      );
      expect(setupScript).toContain('REQUIRED_NODE_VERSION="24"');
      expect(setupScript).toContain("pnpm doctor");
      expect(setupScript).toContain("pnpm check:fast");
      expect(doctorScript).toContain("Checking local development prerequisites");
      expect(doctorScript).toContain("ForgeGraph CLI");
      expect(fs.statSync(path.join(result.appPath, "scripts/setup.sh")).mode & 0o111).toBeTruthy();
      expect(fs.statSync(path.join(result.appPath, "scripts/doctor.sh")).mode & 0o111).toBeTruthy();
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
      expect(fileExists(result.appPath, ".jj")).toBe(true);
      expect(fileExists(result.appPath, ".git")).toBe(true);
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
      expect(fileExists(result.appPath, "apps/nextjs/eslint.config.ts")).toBe(false);
      expect(fileExists(result.appPath, "packages/db/eslint.config.ts")).toBe(false);

      const rootPkg = readJson<{
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
      }>(result.appPath, "package.json");
      const nextPkg = readJson<{
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
      }>(result.appPath, "apps/nextjs/package.json");

      expect(rootPkg.devDependencies?.prettier).toBeFalsy();
      expect(rootPkg.devDependencies?.["@gmacko/prettier-config"]).toBeFalsy();
      expect(rootPkg.scripts?.format).not.toContain("prettier");
      expect(rootPkg.scripts?.lint).not.toContain("eslint");

      expect(nextPkg.devDependencies?.eslint).toBeFalsy();
      expect(nextPkg.devDependencies?.prettier).toBeFalsy();
      expect(nextPkg.devDependencies?.["@gmacko/eslint-config"]).toBeFalsy();
      expect(nextPkg.devDependencies?.["@gmacko/prettier-config"]).toBeFalsy();
      expect(nextPkg.scripts?.format).toContain("biome");
      expect(nextPkg.scripts?.lint).toContain("oxlint");
    }, 120000);
  });

  it("keeps the template release workflow scoped to the CLI package", () => {
    const releaseWorkflow = fs.readFileSync(
      path.resolve(process.cwd(), "../../.github/workflows/release.yml"),
      "utf8",
    );

    expect(releaseWorkflow).toContain("pnpm --dir packages/create-gmacko-app test");
    expect(releaseWorkflow).toContain("pnpm --dir packages/create-gmacko-app build");
    expect(releaseWorkflow).toContain("pnpm release:cli:dry-run");
    expect(releaseWorkflow).not.toContain("pnpm check:release");
    expect(releaseWorkflow).not.toContain("pnpm --filter create-gmacko-app test");
  });

  it("keeps the CLI E2E workflow aligned with the current template baseline", () => {
    const e2eWorkflow = fs.readFileSync(
      path.resolve(process.cwd(), "../../.github/workflows/cli-e2e.yml"),
      "utf8",
    );

    expect(e2eWorkflow).toContain('node-version-file: ".nvmrc"');
    expect(e2eWorkflow).not.toContain("node-version: 22");
    expect(e2eWorkflow).not.toContain("2>&1 || true");
    expect(e2eWorkflow).toContain("pnpm doctor");
    expect(e2eWorkflow).toContain("pnpm check:fast");
    expect(e2eWorkflow).toContain("pnpm --dir packages/create-gmacko-app build");
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

    it("should prune unused packages when --prune is passed", async () => {
      const appName = generateAppName("pruned");
      const result = await runCli({
        appName,
        flags: [
          "--yes",
          "--no-install",
          "--no-git",
          "--no-mobile",
          "--no-ai",
          "--vinext",
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
      expect(fileExists(result.appPath, "apps/nextjs/sentry.client.config.ts")).toBe(
        false,
      );
      expect(fileExists(result.appPath, "apps/nextjs/sentry.edge.config.ts")).toBe(
        false,
      );
      expect(fileExists(result.appPath, "apps/nextjs/sentry.server.config.ts")).toBe(
        false,
      );

      const nextProviders = readFile(result.appPath, "apps/nextjs/src/app/providers.tsx");
      const nextErrorPage = readFile(result.appPath, "apps/nextjs/src/app/error.tsx");
      const nextGlobalError = readFile(
        result.appPath,
        "apps/nextjs/src/app/global-error.tsx",
      );
      const nextErrorBoundary = readFile(
        result.appPath,
        "apps/nextjs/src/components/error-boundary.tsx",
      );
      const nextInstrumentation = readFile(
        result.appPath,
        "apps/nextjs/src/instrumentation.ts",
      );

      expect(nextProviders).not.toContain("@gmacko/analytics/web");
      expect(nextErrorPage).not.toContain("@gmacko/monitoring/web");
      expect(nextGlobalError).not.toContain("@gmacko/monitoring/web");
      expect(nextErrorBoundary).not.toContain("@gmacko/monitoring/web");
      expect(nextInstrumentation).not.toContain("sentry.server.config");
      expect(nextInstrumentation).not.toContain("sentry.edge.config");
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
