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
  createForgeGraphConfig(targetDir, options);

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
  ${pc.cyan("pnpm")} doctor
  ${pc.cyan("cp")} .env.example .env
  ${pc.dim("# Update .env with your credentials")}
  ${pc.dim("# Update .forgegraph.yaml with your real ForgeGraph server")}
  ${pc.cyan("docker compose")} up -d postgres
  ${pc.cyan("pnpm")} db:push
  ${pc.cyan("pnpm")} fg:doctor
  ${pc.cyan("pnpm")} check:fast
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

function createForgeGraphConfig(targetDir: string, options: CliOptions): void {
  fs.writeFileSync(
    path.join(targetDir, ".forgegraph.yaml"),
    `app: ${options.appName}
server: ${options.forgegraphServer}
stages:
  - name: staging
    nodeId: ${options.forgegraphStagingNode}
    sortOrder: 10
  - name: production
    nodeId: ${options.forgegraphProductionNode}
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

  nextPkg.scripts["prebuild:vinext"] =
    "pnpm --dir ../.. --filter @gmacko/nextjs^... build";
  nextPkg.scripts["dev:vinext"] = "pnpm prebuild:vinext && pnpm with-env vinext dev";
  nextPkg.scripts["build:vinext"] =
    "pnpm prebuild:vinext && pnpm with-env vinext build";
  nextPkg.scripts["start:vinext"] = "pnpm with-env vinext start";
  nextPkg.scripts["deploy:cloudflare"] = "pnpm deploy:cloudflare:production";
  nextPkg.scripts["deploy:cloudflare:staging"] =
    "pnpm build:vinext && pnpm with-env wrangler deploy --env staging";
  nextPkg.scripts["deploy:cloudflare:production"] =
    "pnpm build:vinext && pnpm with-env wrangler deploy";

  nextPkg.devDependencies.vinext = "^0.0.35";
  nextPkg.devDependencies.vite = "^8.0.2";
  nextPkg.devDependencies.wrangler = "^4.77.0";
  nextPkg.devDependencies["@cloudflare/vite-plugin"] = "^1.30.1";
  nextPkg.devDependencies["@vitejs/plugin-rsc"] = "^0.5.21";
  nextPkg.devDependencies = sortObjectKeys(nextPkg.devDependencies);

  fs.writeJsonSync(nextPkgPath, nextPkg, { spaces: 2 });

  fs.writeFileSync(
    path.join(targetDir, "apps/nextjs/vite.config.ts"),
    `import { cloudflare } from "@cloudflare/vite-plugin";
import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
  ],
});
`,
  );

  fs.writeFileSync(
    path.join(targetDir, "apps/nextjs/wrangler.jsonc"),
    `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "${path.basename(targetDir)}",
  "compatibility_date": "2026-03-23",
  "compatibility_flags": ["nodejs_compat"],
  "main": "./worker/index.ts",
  "assets": {
    "directory": "dist/client",
    "not_found_handling": "none",
    "binding": "ASSETS"
  },
  "images": {
    "binding": "IMAGES"
  },
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

  fs.writeFileSync(
    path.join(targetDir, "apps/nextjs/src/cloudflare-env.ts"),
    `import { z } from "zod/v4";

export const cloudflareEnvSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("production"),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_API_TOKEN: z.string().min(1),
});

export type CloudflareEnv = z.infer<typeof cloudflareEnvSchema>;
`,
  );

  fs.ensureDirSync(path.join(targetDir, "apps/nextjs/worker"));
  fs.writeFileSync(
    path.join(targetDir, "apps/nextjs/worker/index.ts"),
    `import {
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
  handleImageOptimization,
} from "vinext/server/image-optimization";
import type { ImageConfig } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  APP_ENV?: "development" | "staging" | "production";
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const imageConfig: ImageConfig = {};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (assetPath) =>
            env.ASSETS.fetch(new Request(new URL(assetPath, request.url))),
          imageConfig,
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    return handler.fetch(request, env, ctx);
  },
};
`,
  );

  const envExamplePath = path.join(targetDir, ".env.example");
  const envExample = fs.readFileSync(envExamplePath, "utf-8");
  if (!envExample.includes("CLOUDFLARE_ACCOUNT_ID")) {
    fs.writeFileSync(
      envExamplePath,
      `${envExample}

# =====================================================
# OPTIONAL: Cloudflare Workers (vinext)
# Used for the experimental Next.js-on-Workers lane
# =====================================================
# CLOUDFLARE_ACCOUNT_ID='your-account-id'
# CLOUDFLARE_API_TOKEN='your-api-token'
`,
    );
  }
}

function sortObjectKeys(
  record: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    [...Object.entries(record)].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
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

  if (!integrations.sentry) {
    pruneNextSentryFiles(targetDir);
  }

  if (!integrations.posthog) {
    pruneNextAnalyticsFiles(targetDir);
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

function pruneNextSentryFiles(targetDir: string): void {
  const sentryFiles = [
    "apps/nextjs/sentry.client.config.ts",
    "apps/nextjs/sentry.edge.config.ts",
    "apps/nextjs/sentry.server.config.ts",
  ];

  for (const relativePath of sentryFiles) {
    const filePath = path.join(targetDir, relativePath);
    if (fs.existsSync(filePath)) {
      fs.removeSync(filePath);
    }
  }

  removeSnippet(
    path.join(targetDir, "apps/nextjs/src/app/error.tsx"),
    'import { captureException } from "@gmacko/monitoring/web";\n',
  );
  removeSnippet(
    path.join(targetDir, "apps/nextjs/src/app/error.tsx"),
    `    // Report error to Sentry if enabled
    if (integrations.sentry) {
      captureException(error);
    }

`,
  );

  removeSnippet(
    path.join(targetDir, "apps/nextjs/src/app/global-error.tsx"),
    'import { captureException } from "@gmacko/monitoring/web";\n',
  );
  removeSnippet(
    path.join(targetDir, "apps/nextjs/src/app/global-error.tsx"),
    `    // Report error to Sentry if enabled
    if (integrations.sentry) {
      captureException(error);
    }

`,
  );

  removeSnippet(
    path.join(targetDir, "apps/nextjs/src/components/error-boundary.tsx"),
    'import { captureException } from "@gmacko/monitoring/web";\n',
  );
  removeSnippet(
    path.join(targetDir, "apps/nextjs/src/components/error-boundary.tsx"),
    `    // Report to Sentry if enabled
    if (integrations.sentry) {
      captureException(error);
    }

`,
  );

  const instrumentationPath = path.join(
    targetDir,
    "apps/nextjs/src/instrumentation.ts",
  );
  if (fs.existsSync(instrumentationPath)) {
    fs.writeFileSync(
      instrumentationPath,
      `export async function register() {}
`,
    );
  }
}

function pruneNextAnalyticsFiles(targetDir: string): void {
  const providersPath = path.join(targetDir, "apps/nextjs/src/app/providers.tsx");
  if (!fs.existsSync(providersPath)) return;

  fs.writeFileSync(
    providersPath,
    `"use client";

import type { ReactNode } from "react";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return <>{children}</>;
}
`,
  );
}

function removeSnippet(filePath: string, snippet: string): void {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.includes(snippet)) return;

  fs.writeFileSync(filePath, content.replace(snippet, ""));
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
