import { execSync } from "node:child_process";
import path from "node:path";
import * as p from "@clack/prompts";
import fs from "fs-extra";
import pc from "picocolors";

import type { CliOptions, IntegrationConfig } from "./types.js";
import { runProvisioning } from "./provision.js";

const TEMPLATE_REPO =
  process.env.CREATE_GMACKO_APP_TEMPLATE_REPO ??
  "https://github.com/gmackorg/create-gmacko-app.git";

export async function scaffold(options: CliOptions): Promise<void> {
  const targetDir = path.resolve(process.cwd(), options.appName);

  if (fs.existsSync(targetDir)) {
    const files = fs.readdirSync(targetDir);
    if (files.length > 0) {
      p.log.error(
        `Directory ${pc.cyan(options.appName)} already exists and is not empty.`,
      );
      process.exit(1);
    }
  }

  const spinner = p.spinner();

  spinner.start("Cloning template...");
  try {
    if (isLocalTemplatePath(TEMPLATE_REPO)) {
      fs.copySync(TEMPLATE_REPO, targetDir, {
        filter: (src) => shouldCopyTemplatePath(src, TEMPLATE_REPO),
      });
    } else {
      execSync(`git clone --depth 1 ${TEMPLATE_REPO} "${targetDir}"`, {
        stdio: "pipe",
      });
      fs.removeSync(path.join(targetDir, ".git"));
    }

    spinner.stop("Template cloned");
  } catch {
    spinner.stop("Failed to clone template");
    p.log.error("Failed to clone template repository");
    process.exit(1);
  }

  spinner.start("Configuring project...");

  updatePackageJson(targetDir, options);
  updateIntegrationsConfig(targetDir, options.integrations);
  updatePackageScope(targetDir, options.packageScope);
  createManifest(targetDir, options);
  createForgeGraphConfig(targetDir, options.appName);

  if (!options.platforms.web) {
    fs.removeSync(path.join(targetDir, "apps/nextjs"));
  }
  if (!options.platforms.mobile) {
    fs.removeSync(path.join(targetDir, "apps/expo"));
  }
  if (!options.platforms.tanstackStart) {
    fs.removeSync(path.join(targetDir, "apps/tanstack-start"));
  }

  if (options.platforms.web && options.vinext) {
    configureVinext(targetDir);
  }

  if (options.platforms.mobile) {
    configureExpoApp(targetDir, options.appName);
  }

  if (!options.includeAi) {
    fs.removeSync(path.join(targetDir, ".claude"));
    fs.removeSync(path.join(targetDir, ".opencode"));
    fs.removeSync(path.join(targetDir, "CLAUDE.md"));
    fs.removeSync(path.join(targetDir, "DESIGN.md"));
    fs.removeSync(path.join(targetDir, "docs/ai"));
    fs.removeSync(path.join(targetDir, "opencode.json"));
  }

  if (!options.includeProvision) {
    fs.removeSync(path.join(targetDir, "scripts/provision.sh"));
  }

  if (options.prune) {
    pruneIntegrations(targetDir, options.integrations);
  }

  spinner.stop("Project configured");

  if (options.git) {
    spinner.start("Initializing repository...");
    initializeRepository(targetDir, spinner);
  }

  if (options.install) {
    spinner.start("Installing dependencies...");
    try {
      execSync("pnpm install", { cwd: targetDir, stdio: "pipe" });
      spinner.stop("Dependencies installed");
    } catch {
      spinner.stop("Failed to install dependencies");
      p.log.warn("Run 'pnpm install' manually to complete setup");
    }
  }

  p.outro(pc.green("Scaffolding complete!"));

  // Skip provisioning prompt in CI or non-interactive environments
  const isInteractive = process.stdout.isTTY && !process.env.CI;

  if (isInteractive) {
    const shouldProvision = await p.confirm({
      message: "Would you like to set up cloud services now?",
      initialValue: true,
    });

    if (!p.isCancel(shouldProvision) && shouldProvision) {
      await runProvisioning({
        projectPath: targetDir,
        appName: options.appName,
        platforms: {
          web: options.platforms.web,
          mobile: options.platforms.mobile,
        },
      });
    }
  }

  console.log(`
${pc.bold("Next steps:")}

  ${pc.cyan("cd")} ${options.appName}
  ${pc.cyan("cp")} .env.example .env
  ${pc.dim("# Update .env with your credentials")}
  ${pc.dim("# Update .forgegraph.yaml with your real ForgeGraph server")}
  ${pc.cyan("docker compose")} up -d postgres
  ${pc.cyan("pnpm")} db:push
  ${pc.cyan("pnpm")} fg:doctor
  ${pc.cyan("pnpm")} format:check
  ${pc.cyan("pnpm")} lint:ox
  ${pc.cyan("pnpm")} dev
`);
}

function initializeRepository(
  targetDir: string,
  spinner: ReturnType<typeof p.spinner>,
): void {
  try {
    execSync("jj git init .", { cwd: targetDir, stdio: "pipe" });
    spinner.stop("Repository initialized with jj");
    return;
  } catch {
    p.log.warn("jj was unavailable; falling back to a plain Git repo.");
  }

  try {
    execSync("git init", { cwd: targetDir, stdio: "pipe" });
    spinner.stop("Repository initialized with git");
  } catch {
    spinner.stop("Failed to initialize repository");
  }
}

function updatePackageJson(targetDir: string, options: CliOptions): void {
  const pkgPath = path.join(targetDir, "package.json");
  const pkg = fs.readJsonSync(pkgPath);
  pkg.name = options.appName;
  fs.writeJsonSync(pkgPath, pkg, { spaces: 2 });
}

function updateIntegrationsConfig(
  targetDir: string,
  integrations: IntegrationConfig,
): void {
  const configPath = path.join(
    targetDir,
    "packages/config/src/integrations.ts",
  );

  const content = `export const integrations = {
  sentry: ${integrations.sentry},
  posthog: ${integrations.posthog},
  stripe: ${integrations.stripe},
  revenuecat: ${integrations.revenuecat},
  notifications: ${integrations.notifications},
  email: {
    enabled: ${integrations.email.enabled},
    provider: "${integrations.email.provider}" as "resend" | "sendgrid" | "none",
  },
  realtime: {
    enabled: ${integrations.realtime.enabled},
    provider: "${integrations.realtime.provider}" as "pusher" | "ably" | "none",
  },
  storage: {
    enabled: ${integrations.storage.enabled},
    provider: "${integrations.storage.provider}" as "uploadthing" | "none",
  },
  i18n: false,
  openapi: false,
} as const;

export type Integrations = typeof integrations;

export const isSentryEnabled = () => integrations.sentry;
export const isPostHogEnabled = () => integrations.posthog;
export const isStripeEnabled = () => integrations.stripe;
export const isRevenueCatEnabled = () => integrations.revenuecat;
export const isNotificationsEnabled = () => integrations.notifications;
export const isEmailEnabled = () => integrations.email.enabled;
export const isRealtimeEnabled = () => integrations.realtime.enabled;
export const isStorageEnabled = () => integrations.storage.enabled;
export const isI18nEnabled = () => integrations.i18n;
export const isOpenApiEnabled = () => integrations.openapi;
`;

  fs.writeFileSync(configPath, content);
}

function updatePackageScope(targetDir: string, scope: string): void {
  if (scope === "@gmacko") return;

  const files = getAllFiles(targetDir);

  for (const file of files) {
    if (
      file.endsWith(".json") ||
      file.endsWith(".ts") ||
      file.endsWith(".tsx") ||
      file.endsWith(".js") ||
      file.endsWith(".mjs")
    ) {
      try {
        let content = fs.readFileSync(file, "utf-8");
        if (content.includes("@gmacko/")) {
          content = content.replace(/@gmacko\//g, `${scope}/`);
          fs.writeFileSync(file, content);
        }
      } catch {
        // Skip files that can't be read
      }
    }
  }
}

function createManifest(targetDir: string, options: CliOptions): void {
  const manifest = {
    preset:
      options.integrations.sentry && options.integrations.posthog
        ? "recommended"
        : "custom",
    integrations: options.integrations,
    platforms: options.platforms,
    scaffoldedAt: new Date().toISOString(),
    packageScope: options.packageScope,
  };

  fs.writeJsonSync(path.join(targetDir, "gmacko.integrations.json"), manifest, {
    spaces: 2,
  });
}

function createForgeGraphConfig(targetDir: string, appName: string): void {
  fs.writeFileSync(
    path.join(targetDir, ".forgegraph.yaml"),
    `app: ${appName}
server: https://forge.example.com
stages:
  - name: staging
    nodeId: change-me-staging-node
    sortOrder: 10
  - name: production
    nodeId: change-me-production-node
    sortOrder: 20
`,
  );
}

function configureVinext(targetDir: string): void {
  const nextPkgPath = path.join(targetDir, "apps/nextjs/package.json");
  const nextPkg = fs.readJsonSync(nextPkgPath) as {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  nextPkg.scripts ??= {};
  nextPkg.devDependencies ??= {};

  nextPkg.scripts["dev:vinext"] = "vinext dev";
  nextPkg.scripts["build:vinext"] = "vinext build";
  nextPkg.scripts["start:vinext"] = "vinext start";
  nextPkg.scripts["deploy:cloudflare"] = "vinext deploy";

  nextPkg.devDependencies.vinext = "^0.7.4";
  nextPkg.devDependencies.vite = "^7.1.7";
  nextPkg.devDependencies.wrangler = "^4.43.0";
  nextPkg.devDependencies["@cloudflare/vite-plugin"] = "^1.13.6";

  fs.writeJsonSync(nextPkgPath, nextPkg, { spaces: 2 });

  fs.writeFileSync(
    path.join(targetDir, "apps/nextjs/vite.config.ts"),
    `import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vinext()],
});
`,
  );

  fs.writeFileSync(
    path.join(targetDir, "apps/nextjs/wrangler.jsonc"),
    `{
  "name": "${path.basename(targetDir)}",
  "compatibility_date": "2026-03-23",
  "compatibility_flags": ["nodejs_compat"],
  "main": ".open-next/worker.js",
  "vars": {
    "APP_ENV": "production"
  },
  "env": {
    "staging": {
      "vars": {
        "APP_ENV": "staging"
      }
    }
  }
}
`,
  );
}

function configureExpoApp(targetDir: string, appName: string): void {
  const expoConfigPath = path.join(targetDir, "apps/expo/app.config.ts");
  const sanitizedId = appName.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  const bundleSegment = sanitizedId.replace(/-/g, "");

  let content = fs.readFileSync(expoConfigPath, "utf-8");
  content = content.replace(
    'const base = "com.gmacko.app";',
    `const base = "com.gmacko.${bundleSegment}";`,
  );
  content = content.replace('slug: "gmacko",', `slug: "${sanitizedId}",`);
  content = content.replace('scheme: "gmacko",', `scheme: "${sanitizedId}",`);

  fs.writeFileSync(expoConfigPath, content);
}

function pruneIntegrations(
  targetDir: string,
  integrations: IntegrationConfig,
): void {
  const packagesToPrune: string[] = [];

  if (!integrations.sentry) {
    packagesToPrune.push("monitoring");
  }
  if (!integrations.posthog) {
    packagesToPrune.push("analytics");
  }
  if (!integrations.stripe) {
    packagesToPrune.push("payments");
  }
  if (!integrations.revenuecat) {
    packagesToPrune.push("purchases");
  }
  if (!integrations.notifications) {
    packagesToPrune.push("notifications");
  }
  if (!integrations.email.enabled) {
    packagesToPrune.push("email");
  }
  if (!integrations.realtime.enabled) {
    packagesToPrune.push("realtime");
  }
  if (!integrations.storage.enabled) {
    packagesToPrune.push("storage");
  }

  for (const pkg of packagesToPrune) {
    const pkgDir = path.join(targetDir, `packages/${pkg}`);
    if (fs.existsSync(pkgDir)) {
      fs.removeSync(pkgDir);
    }
  }

  for (const app of ["nextjs", "expo", "tanstack-start"]) {
    const appPkgPath = path.join(targetDir, `apps/${app}/package.json`);
    if (fs.existsSync(appPkgPath)) {
      const pkg = fs.readJsonSync(appPkgPath);
      for (const pkgName of packagesToPrune) {
        delete pkg.dependencies?.[`@gmacko/${pkgName}`];
        delete pkg.devDependencies?.[`@gmacko/${pkgName}`];
      }
      fs.writeJsonSync(appPkgPath, pkg, { spaces: 2 });
    }
  }
}

function getAllFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name !== "node_modules" &&
          entry.name !== ".git" &&
          entry.name !== "dist"
        ) {
          walk(fullPath);
        }
      } else {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function isLocalTemplatePath(templateRepo: string): boolean {
  return fs.existsSync(templateRepo) && fs.statSync(templateRepo).isDirectory();
}

function shouldCopyTemplatePath(src: string, templateRoot: string): boolean {
  const basename = path.basename(src);

  if (
    basename === ".git" ||
    basename === "node_modules" ||
    basename === ".turbo" ||
    basename === ".cache" ||
    basename === "dist"
  ) {
    return false;
  }

  if (src === templateRoot) {
    return true;
  }

  return true;
}
