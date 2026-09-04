import { execSync } from "node:child_process";
import path from "node:path";
import * as p from "@clack/prompts";
import fs from "fs-extra";
import pc from "picocolors";
import { REALTIME_WARNING } from "./prompts.js";
import { runProvisioning, workerName } from "./provision.js";
import type { CliOptions, IntegrationConfig } from "./types.js";

const TEMPLATE_REPO =
  process.env.CREATE_GMACKO_APP_TEMPLATE_REPO ??
  "https://github.com/gmackorg/create-gmacko-app.git";

/** The web app: TanStack Start + the Effect HTTP API as one Worker on D1. */
export const WEB_APP_DIR = "apps/web";
/** The Expo app. */
export const MOBILE_APP_DIR = "apps/expo";
/** The template's worker/D1 base name; renamed to `<app>-web` per scaffold. */
const TEMPLATE_WORKER_NAME = "gmacko-web";

/** The `package.json` fields the scaffolder rewrites in the generated app. */
interface RootPackageManifest {
  scripts?: Record<string, string>;
}

interface McpServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

/** The `.mcp.json` shape Claude Code reads and the operator lane extends. */
interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>;
}

interface PortlessApp {
  name?: string;
  script?: string;
}

/** The `portless.json` shape: one entry per app directory it proxies. */
interface PortlessConfig {
  apps?: Record<string, PortlessApp>;
}

/**
 * Reads the generated app's root `package.json`. Every field below is optional
 * because these readers run against a freshly copied template file and then
 * write it straight back with `writeJsonSync`, so nothing here may assume a
 * key exists.
 */
function readRootPackage(rootPackagePath: string): RootPackageManifest {
  return fs.readJsonSync(rootPackagePath);
}

function readMcpConfig(mcpConfigPath: string): McpConfig {
  return fs.readJsonSync(mcpConfigPath);
}

function readPortlessConfig(portlessPath: string): PortlessConfig {
  return fs.readJsonSync(portlessPath);
}

/**
 * `execSync` with piped stdio throws an Error carrying the child's captured
 * `stderr`; a failure from anywhere else (a missing binary, say) carries none.
 */
function capturedStderr(cause: unknown): string {
  if (!(cause instanceof Error) || !("stderr" in cause)) return "";
  return String(cause.stderr ?? "");
}

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
        filter: (src) => shouldCopyTemplatePath(src),
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
  updateIntegrationsConfig(targetDir, options, options.integrations);
  // Prune BEFORE renaming the package scope. The prune helpers operate on the
  // default @gmacko/* names (removing pruned packages and scrubbing their
  // imports/deps); running after updatePackageScope would miss the @scope/*
  // references and leave dangling workspace deps and broken imports.
  if (options.prune) {
    pruneIntegrations(targetDir, options.integrations, options.platforms.web);
  }
  renameWorkerNames(targetDir, options.appName);
  createManifest(targetDir, options);
  createForgeGraphConfig(targetDir, options);
  addForgeGraphScripts(targetDir);
  addOptionalOperatorScripts(targetDir, options);
  customizeMcpConfig(targetDir, options);
  customizeClaudeInstructions(targetDir, options);
  customizeBootstrapPlaybook(targetDir, options);

  if (!options.platforms.web) {
    removeWebApp(targetDir);
  }
  if (!options.platforms.mobile) {
    fs.removeSync(path.join(targetDir, MOBILE_APP_DIR));
  }

  if (options.platforms.mobile) {
    configureExpoApp(targetDir, options.appName, options.displayName);
  }

  customizeGeneratedReadme(targetDir, options);
  pruneOptionalLanes(targetDir, options);
  // Rename the package scope LAST: every generator above writes the template's
  // @gmacko/* names (the forge/operator root scripts, .mcp.json,
  // .forgegraph.yaml, the README/playbook blocks), so the rename has to run
  // after all of them or those files keep the old scope.
  updatePackageScope(targetDir, options.packageScope);

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

  spinner.stop("Project configured");

  if (options.integrations.realtime.enabled) {
    p.log.warn(REALTIME_WARNING);
  }

  if (options.git) {
    spinner.start("Initializing repository...");
    initializeRepository(targetDir, spinner);
  }

  if (options.install) {
    spinner.start("Installing dependencies...");
    try {
      // Force a non-frozen install: scaffolding rewrites package.json (name,
      // integrations, pruned deps) without regenerating the lockfile, and pnpm
      // implies --frozen-lockfile under CI=1 — which then fails instantly on the
      // now-stale lockfile.
      execSync("pnpm install --no-frozen-lockfile", {
        cwd: targetDir,
        stdio: "pipe",
      });
      spinner.stop("Dependencies installed");
    } catch (err) {
      spinner.stop("Failed to install dependencies");
      // Surface why — a swallowed install failure otherwise only shows up later
      // as confusing "turbo: not found" errors.
      const stderr = capturedStderr(err);
      if (stderr.trim()) {
        p.log.error(stderr.trim().split("\n").slice(-25).join("\n"));
      }
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

  console.log(buildNextSteps(options));
}

function buildNextSteps(options: CliOptions): string {
  const worker = workerName(options.appName);
  const scope = options.packageScope;
  const lines = [
    "",
    `  ${pc.bold("Next steps:")}`,
    "",
    `  ${pc.cyan("cd")} ${options.appName}`,
    `  ${pc.cyan("pnpm")} bootstrap:local   ${pc.dim("# doctor, .env, auth + db generate, local D1 migrate + seed, check:fast")}`,
  ];
  if (options.platforms.web) {
    lines.push(
      `  ${pc.cyan("pnpm")} dev               ${pc.dim("# emulate + apps/web at https://gmacko.localhost (local D1, no DATABASE_URL)")}`,
      "",
      `  ${pc.dim("# Schema changes: edit packages/db/src/schema.ts, then")}`,
      `  ${pc.cyan("pnpm")} db:generate && ${pc.cyan("pnpm")} db:migrate:local`,
      "",
      `  ${pc.dim("# Deploys (once per stage): create the D1 databases, paste the ids into apps/web/wrangler.jsonc")}`,
      `  ${pc.cyan("pnpm")} -F ${scope}/web exec wrangler d1 create ${worker}-staging`,
      `  ${pc.cyan("pnpm")} -F ${scope}/web exec wrangler d1 create ${worker}`,
      `  ${pc.dim("# Update .forgegraph.yaml (server, domains), then: pnpm forge:doctor && pnpm deploy:staging")}`,
    );
  } else {
    lines.push(
      `  ${pc.cyan("pnpm")} --filter ${scope}/expo dev:client   ${pc.dim("# point EXPO_PUBLIC_API_URL at your hosted API")}`,
    );
  }
  if (options.platforms.mobile && options.platforms.web) {
    lines.push(
      `  ${pc.cyan("pnpm")} --filter ${scope}/expo dev:client   ${pc.dim("# the Expo dev client against the web app's API")}`,
    );
  }
  lines.push("");
  return lines.join("\n");
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
  options: CliOptions,
  integrations: IntegrationConfig,
): void {
  const configPath = path.join(
    targetDir,
    "packages/config/src/integrations.ts",
  );

  const content = `/** The transactional email provider; \`none\` means the app sends no email. */
export type EmailProvider = "resend" | "sendgrid" | "none";
/** The pub/sub + queue backend \`@gmacko/realtime\` talks to. */
export type RealtimeProvider = "redis" | "none";
/** The file storage service \`@gmacko/storage\` uploads through. */
export type StorageProvider = "uploadthing" | "none";

// Each provider-bearing integration is declared through its own contract
// rather than written inline under \`as const\`, which would pin \`provider\` to
// the single literal it is scaffolded with and turn every
// \`provider === "…"\` comparison in this repo into a "no overlap" error.
// \`enabled\` keeps the literal the scaffolder wrote, so a disabled integration
// stays statically disabled for its consumers.

/** How the app sends transactional email. */
interface EmailIntegration {
  readonly enabled: ${integrations.email.enabled};
  readonly provider: EmailProvider;
}
/** How the app publishes and subscribes to realtime events. */
interface RealtimeIntegration {
  readonly enabled: ${integrations.realtime.enabled};
  readonly provider: RealtimeProvider;
}
/** Where the app stores uploaded files. */
interface StorageIntegration {
  readonly enabled: ${integrations.storage.enabled};
  readonly provider: StorageProvider;
}

const email: EmailIntegration = {
  enabled: ${integrations.email.enabled},
  provider: "${integrations.email.provider}",
};
// Node-only (ioredis + BullMQ): unsupported on the web app, which runs on
// Cloudflare Workers. Enable it only for a Node service on a VPS node; see
// packages/realtime/README.md.
const realtime: RealtimeIntegration = {
  enabled: ${integrations.realtime.enabled},
  provider: "${integrations.realtime.provider}",
};
const storage: StorageIntegration = {
  enabled: ${integrations.storage.enabled},
  provider: "${integrations.storage.provider}",
};

export const integrations = {
  sentry: ${integrations.sentry},
  posthog: ${integrations.posthog},
  forgegraph: ${integrations.forgegraph},
  stripe: ${integrations.stripe},
  revenuecat: ${integrations.revenuecat},
  notifications: ${integrations.notifications},
  email,
  realtime,
  storage,
  i18n: false,
  openapi: false,
} as const;

export type Integrations = typeof integrations;

export const saasFeatures = {
  collaboration: ${options.saasCollaboration},
  billing: ${options.saasBilling},
  metering: ${options.saasMetering},
  support: ${options.saasSupport},
  launch: ${options.saasLaunch},
  referrals: ${options.saasReferrals},
  operatorApis: ${options.saasOperatorApis},
} as const;

export type SaasFeatures = typeof saasFeatures;

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
export const isForgeGraphEnabled = () => integrations.forgegraph;
export const isSaasCollaborationEnabled = () => saasFeatures.collaboration;
export const isSaasBillingEnabled = () => saasFeatures.billing;
export const isSaasMeteringEnabled = () => saasFeatures.metering;
export const isSaasSupportEnabled = () => saasFeatures.support;
export const isSaasLaunchEnabled = () => saasFeatures.launch;
export const isSaasReferralsEnabled = () => saasFeatures.referrals;
export const isSaasOperatorApisEnabled = () => saasFeatures.operatorApis;

export const platformPrimitives = {
  featureFlags: {
    enabled: true,
    provider: "local" as const,
  },
  jobs: {
    enabled: true,
    provider: "local" as const,
  },
  rateLimits: {
    enabled: true,
    scopes: ["auth", "contact", "signup", "api-keys", "operator-api"] as const,
  },
  botProtection: {
    enabled: true,
    provider: "local-rate-limit" as const,
  },
  compliance: {
    enabled: true,
    dataExport: true,
    dataDeletion: true,
  },
  emailDelivery: {
    enabled: integrations.email.enabled,
    provider: integrations.email.provider,
    requiredEnv:
      integrations.email.enabled && integrations.email.provider === "resend"
        ? (["RESEND_API_KEY"] as const)
        : ([] as const),
  },
} as const;

export type PlatformPrimitives = typeof platformPrimitives;

export const isEmailDeliveryEnabled = () =>
  platformPrimitives.emailDelivery.enabled;
`;

  fs.writeFileSync(configPath, content);
}

const TEXT_EXTENSIONS = new Set([
  ".json",
  ".jsonc",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".css",
  ".md",
  ".yml",
  ".yaml",
  ".sh",
]);

/**
 * `--package-scope`: rename the workspace packages from `@gmacko/*` to
 * `@scope/*` in every text file — sources and package.json files, but also
 * the workflows (`pnpm -F @gmacko/web ...`), `.forgegraph.yaml`,
 * `.mcp.json`, `scripts/*.sh` and the docs, which all spell the scope out.
 */
function updatePackageScope(targetDir: string, scope: string): void {
  if (scope === "@gmacko") return;

  for (const file of getAllFiles(targetDir)) {
    if (!TEXT_EXTENSIONS.has(path.extname(file))) continue;
    try {
      const content = fs.readFileSync(file, "utf-8");
      if (!content.includes("@gmacko/")) continue;
      // Rename internal workspace packages only. @gmacko/emulate and
      // @gmacko/cloudfault are external published dev dependencies — renaming
      // either to @scope/… makes `pnpm install` 404, and for cloudfault it
      // would also rewrite the import specifiers in apps/web/fault, which
      // `pnpm typecheck` now covers. Add any future external @gmacko/* dep
      // to this list.
      fs.writeFileSync(
        file,
        content.replace(/@gmacko\/(?!(?:emulate|cloudfault)\b)/g, `${scope}/`),
      );
    } catch {
      // Skip files that can't be read
    }
  }
}

/**
 * The template names its Worker and D1 databases `gmacko-web` (`-staging`,
 * `-preview`, `-pr-<n>`); a scaffold is `<app>-web`. Applied to every text
 * file (wrangler.jsonc, the preview workflow, the deploy docs, the
 * telemetry service name) so the names agree everywhere; the scaffolder's
 * own sources and tests are left alone.
 */
function renameWorkerNames(targetDir: string, appName: string): void {
  const worker = workerName(appName);
  if (worker === TEMPLATE_WORKER_NAME) return;
  const pattern = new RegExp(`\\b${TEMPLATE_WORKER_NAME}\\b`, "g");

  for (const file of getAllFiles(targetDir)) {
    if (!TEXT_EXTENSIONS.has(path.extname(file))) continue;
    const relativePath = path.relative(targetDir, file);
    if (relativePath.startsWith("packages/create-gmacko-app/")) continue;
    try {
      const content = fs.readFileSync(file, "utf-8");
      if (!pattern.test(content)) continue;
      fs.writeFileSync(file, content.replace(pattern, worker));
    } catch {
      // Skip files that can't be read
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

function customizeGeneratedReadme(
  targetDir: string,
  options: CliOptions,
): void {
  const readmePath = path.join(targetDir, "README.md");
  const startMarker = "<!-- SCAFFOLD_PROFILE_START -->";
  const endMarker = "<!-- SCAFFOLD_PROFILE_END -->";

  if (!fs.existsSync(readmePath)) {
    return;
  }

  const readme = fs.readFileSync(readmePath, "utf8");
  const profileBlock = buildScaffoldProfileBlock(options);
  const agentQuickstartBlock = options.includeAi
    ? `\n\n${buildAgentQuickstartBlock()}`
    : "";
  const saasBootstrapBlock =
    options.includeAi && options.saasBootstrap
      ? `\n\n${buildSaasBootstrapBlock(options)}`
      : "";
  const operatorLaneBlock = options.operatorLane
    ? `\n\n${buildOperatorLaneBlock()}`
    : "";
  const startIndex = readme.indexOf(startMarker);
  const endIndex = readme.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return;
  }

  const updatedReadme =
    readme.slice(0, startIndex) +
    profileBlock +
    agentQuickstartBlock +
    saasBootstrapBlock +
    operatorLaneBlock +
    readme.slice(endIndex + endMarker.length);

  fs.writeFileSync(readmePath, updatedReadme);
}

function buildAgentQuickstartBlock(): string {
  return `## Agent quickstart

- Read \`AGENTS.md\` first for the shared repo rules.
- Use \`.mcp.json\` for the repo MCP server setup.
- Claude Code users should check \`.claude/settings.json\`.
- OpenCode users should check \`opencode.json\`.
`;
}

function buildSaasBootstrapBlock(options: CliOptions): string {
  return buildSaasBootstrapContent(options, true);
}

function buildSaasBootstrapContent(
  options: CliOptions,
  includeSummaryLink: boolean,
): string {
  const { claudeLines, codexLines, opencodeLines, selectedLayerLines } =
    getBootstrapRecommendations(options);

  const summaryLink = includeSummaryLink
    ? `
- Use [docs/ai/BOOTSTRAP_PLAYBOOK.md](docs/ai/BOOTSTRAP_PLAYBOOK.md) for the full handoff.`
    : "";

  const selectedLayerSection =
    selectedLayerLines.length > 0
      ? `
## Selected SaaS layers

${selectedLayerLines.join("\n")}
`
      : "";

  return `# Post-setup SaaS bootstrap

Run this after \`pnpm bootstrap:local\`.

## Claude-only

${claudeLines.join("\n")}

## Codex

${codexLines.join("\n")}

## OpenCode

${opencodeLines.join("\n")}${selectedLayerSection}${summaryLink}
`;
}

interface BootstrapRecommendations {
  claudeLines: string[];
  codexLines: string[];
  opencodeLines: string[];
  selectedLayerLines: string[];
}

function getBootstrapRecommendations(
  options: CliOptions,
): BootstrapRecommendations {
  const claudeLines = [
    "- Claude-only: run `/office-hours` to force clarity on customer, problem, and wedge.",
    "- Claude-only: if your user-level gstack install includes `/autoplan`, run it next.",
    "- Claude-only: run `/design-consultation` once the product direction is clear so `DESIGN.md` becomes the visual source of truth.",
  ];
  const codexLines = [
    "- Start from `AGENTS.md` and `docs/ai/IMPLEMENTATION_PLAN.md`.",
    "- Run `pnpm bootstrap:local`, then `pnpm run doctor` and `pnpm check:fast`.",
  ];
  const opencodeLines = [
    "- Start from `AGENTS.md`, `opencode.json`, and `docs/ai/IMPLEMENTATION_PLAN.md`.",
    "- Run `pnpm bootstrap:local`, then `pnpm run doctor` and `pnpm check:fast`.",
  ];
  const selectedLayerLines: string[] = [];

  const collaborationPaths =
    "`packages/db/src/schema.ts`, `packages/domain/src/settings/api.ts` (the contract) and `packages/api/src/settings/service.ts` (the `Workspaces` service)";
  const billingPaths =
    "`packages/billing`, `packages/domain/src/settings/api.ts` and `packages/api/src/settings/billing.ts`";
  const supportPaths =
    "`apps/web/src/routes` (pricing, faq, changelog, contact, privacy, terms), `packages/domain/src/admin/api.ts` and `packages/api/src/admin/service.ts`";
  const referralPaths = "`packages/api/src/admin/service.ts`";

  if (options.saasCollaboration) {
    selectedLayerLines.push(
      `- Collaboration: use ${collaborationPaths} for workspace membership and invites.`,
    );
    codexLines.push(
      `- Collaboration: inspect ${collaborationPaths} for workspace membership and invites.`,
    );
    opencodeLines.push(
      `- Collaboration: inspect ${collaborationPaths} for workspace membership and invites.`,
    );
  }

  if (options.saasBilling || options.saasMetering) {
    selectedLayerLines.push(
      `- Billing and metering: use ${billingPaths} for plan shape, limits, and usage rollups.`,
    );
    codexLines.push(
      `- Billing and metering: use ${billingPaths} for plans, limits, and usage rollups.`,
    );
    opencodeLines.push(
      `- Billing and metering: use ${billingPaths} for plans, limits, and usage rollups.`,
    );
    claudeLines.push(
      "- Claude-only: run `/setup-stripe-billing` once the workspace, plan, and usage model are clear.",
    );
  }

  if (options.saasSupport || options.saasLaunch) {
    selectedLayerLines.push(
      `- Support and launch: use ${supportPaths} for landing, contact, FAQ, changelog, maintenance mode, signup toggles, and waitlist review.`,
    );
    codexLines.push(
      `- Support and launch: use ${supportPaths} for landing, contact, FAQ, changelog, maintenance mode, signup toggles, and waitlist review.`,
    );
    opencodeLines.push(
      `- Support and launch: use ${supportPaths} for landing, contact, FAQ, changelog, maintenance mode, signup toggles, and waitlist review.`,
    );
    claudeLines.push(
      "- Claude-only: run `/launch-landing-page` once the public shell and support flow are ready to shape.",
    );
  }

  if (options.saasReferrals) {
    selectedLayerLines.push(
      "- Referrals: keep referral capture and invite growth tied to the landing page and admin review tools.",
    );
    codexLines.push(
      `- Referrals: keep referral capture and invite growth tied to the landing page and admin review tools in ${referralPaths}.`,
    );
    opencodeLines.push(
      `- Referrals: keep referral capture and invite growth tied to the landing page and admin review tools in ${referralPaths}.`,
    );
  }

  if (options.saasOperatorApis || options.operatorLane) {
    selectedLayerLines.push(
      "- Operator APIs: use `pnpm api:ops -- --help` and `pnpm mcp:app` for the shared CLI and MCP wrapper lane (an API key with the `admin` scope).",
    );
    codexLines.push(
      "- Operator APIs: use `packages/operator-core`, `packages/api-cli`, and `packages/mcp-server` for the shared CLI and MCP wrapper lane.",
    );
    opencodeLines.push(
      "- Operator APIs: use `packages/operator-core`, `packages/api-cli`, and `packages/mcp-server` for the shared CLI and MCP wrapper lane.",
    );
  }

  if (options.platforms.mobile) {
    claudeLines.push(
      "- Claude-only: use `/bootstrap-expo-app` and `/test-mobile-with-maestro` for the Expo lane.",
    );
    codexLines.push(
      "- Mobile: use `apps/expo` and the mobile QA checklist to complete the Expo baseline.",
    );
    opencodeLines.push(
      "- Mobile: use `apps/expo` and the mobile QA checklist to complete the Expo baseline.",
    );
  }

  return { claudeLines, codexLines, opencodeLines, selectedLayerLines };
}

function customizeBootstrapPlaybook(
  targetDir: string,
  options: CliOptions,
): void {
  if (!options.includeAi || !options.saasBootstrap) {
    return;
  }

  const playbookPath = path.join(targetDir, "docs/ai/BOOTSTRAP_PLAYBOOK.md");
  if (!fs.existsSync(playbookPath)) {
    return;
  }

  fs.writeFileSync(playbookPath, buildSaasBootstrapContent(options, false));
}

function buildOperatorLaneBlock(): string {
  return `## Operator lane

- This scaffold includes CLI + MCP wrappers over the same HTTP API (\`@gmacko/api-client\`).
- Use \`pnpm api:ops -- --help\` for the terminal operator surface.
- Start with \`pnpm api:ops -- auth_help\` for login guidance.
- Use \`pnpm api:ops -- get_workspace_context\` to inspect the current workspace.
- Use \`pnpm api:ops -- list_api_keys\` and \`pnpm api:ops -- create_api_key --name automation\` for automation credentials.
- Use \`pnpm api:ops -- get_billing_overview\` for usage and limits.
- Use \`pnpm mcp:app\` to run the local MCP server. \`auth_help\` works without an API key; protected tools require \`GMACKO_API_KEY\` (a key holding the \`admin\` scope).
`;
}

function buildScaffoldProfileBlock(options: CliOptions): string {
  const platforms = [
    options.platforms.web
      ? "Web (TanStack Start + Effect on Cloudflare Workers, D1)"
      : null,
    options.platforms.mobile ? "Expo" : null,
  ].filter(Boolean);

  const integrations = [
    options.integrations.sentry ? "Sentry" : null,
    options.integrations.posthog ? "PostHog" : null,
    options.integrations.stripe ? "Stripe" : null,
    options.integrations.revenuecat ? "RevenueCat" : null,
    options.integrations.notifications ? "Push notifications" : null,
    options.integrations.email.enabled
      ? `Email (${options.integrations.email.provider})`
      : null,
    options.integrations.forgegraph
      ? "ForgeGraph (health, logging, OTEL)"
      : null,
    options.integrations.realtime.enabled
      ? "Realtime + Jobs (Redis + BullMQ, Node services only)"
      : null,
    options.integrations.storage.enabled
      ? `Storage (${options.integrations.storage.provider})`
      : null,
  ].filter(Boolean);

  const saasLayers = [
    options.saasCollaboration ? "collaboration" : null,
    options.saasBilling ? "billing" : null,
    options.saasMetering ? "metering" : null,
    options.saasSupport ? "support" : null,
    options.saasLaunch ? "launch" : null,
    options.saasReferrals ? "referrals" : null,
    options.saasOperatorApis ? "operator APIs" : null,
  ].filter(Boolean);

  const preferredDevCommands = [
    "- `pnpm bootstrap:local`",
    options.platforms.web ? "- `pnpm dev`" : null,
    options.platforms.mobile
      ? "- `pnpm --filter @gmacko/expo dev:client`"
      : null,
    options.operatorLane ? "- `pnpm api:ops -- --help`" : null,
  ]
    .filter(Boolean)
    .join("\n");

  const deployPath = options.platforms.web
    ? "ForgeGraph → one Cloudflare Worker + one D1 per stage (migrate, then deploy)"
    : "EAS Build (no web app scaffolded)";

  return `<!-- SCAFFOLD_PROFILE_START -->
> **Scaffold profile**
> - Platforms: ${platforms.join(", ") || "none selected"}
> - Integrations: ${integrations.join(", ") || "core only"}
> - SaaS layers: ${saasLayers.join(", ") || "none selected"}
> - Default deploy path: ${deployPath}
> - Claude SaaS bootstrap pack: ${options.saasBootstrap ? "enabled" : "not scaffolded"}
> - Operator lane: ${options.operatorLane ? "CLI + MCP wrappers over the same HTTP API" : "not scaffolded"}
>
> **Recommended first commands**
${preferredDevCommands}
<!-- SCAFFOLD_PROFILE_END -->`;
}

/**
 * `.forgegraph.yaml`: the ForgeGraph repo contract for the web lane — one
 * `cloudflare-workers` target per stage, the D1 resources, the health URL and
 * the migrate-then-deploy sequence (`scripts/deploy-stage.mjs`). A
 * mobile-only scaffold registers the app with no stages.
 */
function createForgeGraphConfig(targetDir: string, options: CliOptions): void {
  const worker = workerName(options.appName);
  const notes = `# ForgeGraph operator notes:
# primary web service path: ${options.platforms.web ? WEB_APP_DIR : options.platforms.mobile ? MOBILE_APP_DIR : "."}
# healthcheck path: ${options.platforms.web ? "/.well-known/forge-health" : "n/a (mobile-only scaffold)"}
# database strategy: ${options.platforms.web ? `cloudflare-d1 (per stage; previews share ${worker}-preview)` : "n/a (mobile-only scaffold)"}
# preview domain: ${options.forgegraphPreviewDomain}
# production domain: ${options.forgegraphProductionDomain}
`;

  if (!options.platforms.web) {
    fs.writeFileSync(
      path.join(targetDir, ".forgegraph.yaml"),
      `# ForgeGraph repo contract. This scaffold has no web app: the Expo app talks
# to a separately hosted API, so no stage is registered here. Add stages
# once a backend repo exists (see deploy/README.md for the Workers shape).
app: ${options.appName}
server: ${options.forgegraphServer}

${notes}`,
    );
    return;
  }

  const stage = (name: string, sortOrder: number, workerSuffix: string) =>
    `  - name: ${name}
    sortOrder: ${sortOrder}
    targets:
      - name: web
        platform: cloudflare-workers
        config:
          workerName: ${worker}${workerSuffix}
          configPath: ${WEB_APP_DIR}/wrangler.jsonc
          environment: ${name}
          deploy: pnpm -F @gmacko/web deploy:${name}`;

  fs.writeFileSync(
    path.join(targetDir, ".forgegraph.yaml"),
    `# ForgeGraph repo contract for the web lane (${WEB_APP_DIR} on Cloudflare Workers + D1).
# \`forge diff\` / \`forge apply\` sync this file with the server; \`forge deploy
# create <stage> --wait\` (pnpm forge:deploy:<stage>) runs the repo's deploy
# workflow for a cloudflare-workers target (deploy/forgegraph/deploy.yml).
#
# Deploy sequence per stage:
#   1. pnpm -F @gmacko/db migrate:remote --env <stage>   # D1 migrations, forward-only
#   2. pnpm -F @gmacko/web deploy:<stage>                # CLOUDFLARE_ENV=<stage> vite build && wrangler deploy
# scripts/deploy-stage.mjs is the single place that ordering lives: \`pnpm
# deploy:<stage>\` and deploy/forgegraph/deploy.yml both run it once and it
# does 1 then 2. ForgeGraph's own stage machinery runs the two halves
# separately — \`db.migrate\` below is step 1 (deploy-stage.mjs --migrate-only)
# and each target's \`deploy\` is step 2 alone — so a stage is migrated exactly
# once either way. A failing migration aborts the deploy. Migrations are expand/contract
# only (docs/drizzle-migrations.md).
#
# D1 is NOT provisioned by \`forge db create\`. Create the databases once with
# wrangler and put their ids in ${WEB_APP_DIR}/wrangler.jsonc (\`env.<stage>.d1_databases\`):
#   pnpm -F @gmacko/web exec wrangler d1 create ${worker}-staging
#   pnpm -F @gmacko/web exec wrangler d1 create ${worker}
#   pnpm -F @gmacko/web exec wrangler d1 create ${worker}-preview   # shared by PR previews
# Stage secrets live in ForgeGraph (\`forge secret set KEY --stage <stage>\`)
# and reach the Worker with \`pnpm secrets:push --stage <stage>\`.

app: ${options.appName}
server: ${options.forgegraphServer}

db:
  type: d1
  name: ${worker}
  # Run by ForgeGraph before the deploy step; FG_STAGE selects the stage.
  migrate: node scripts/deploy-stage.mjs --migrate-only
  migrateType: wrangler

stages:
${stage("staging", 10, "-staging")}
${stage("production", 20, "")}

resources:
  d1:
    - name: ${worker}-staging
      binding: DB
    - name: ${worker}
      binding: DB
    - name: ${worker}-preview
      binding: DB

health:
  # Served by the Worker (packages/api HealthApi); generic outside development.
  url: /.well-known/forge-health
  interval: 60
  timeout: 10

${notes}`,
  );
}

function addForgeGraphScripts(targetDir: string): void {
  const rootPackagePath = path.join(targetDir, "package.json");
  const rootPackage = readRootPackage(rootPackagePath);

  rootPackage.scripts ??= {};
  rootPackage.scripts["forge:diff"] = "forge diff";
  rootPackage.scripts["forge:apply"] = "forge apply";
  rootPackage.scripts["forge:pull"] = "forge pull";
  rootPackage.scripts["forge:deploy:staging"] =
    "forge deploy create staging --wait";
  rootPackage.scripts["forge:deploy:production"] =
    "forge deploy create production --wait";
  rootPackage.scripts["forge:stages"] = "forge stage list";

  fs.writeJsonSync(rootPackagePath, rootPackage, { spaces: 2 });
}

function addOptionalOperatorScripts(
  targetDir: string,
  options: CliOptions,
): void {
  if (!options.operatorLane) {
    return;
  }

  const rootPackagePath = path.join(targetDir, "package.json");
  const rootPackage = readRootPackage(rootPackagePath);

  rootPackage.scripts ??= {};
  // Run the operator CLI / MCP server source via tsx. pnpm never links a
  // workspace package's OWN declared bin into node_modules/.bin, so the
  // `exec gmacko-ops` / `exec gmacko-mcp` bin forms fail EACCES.
  rootPackage.scripts["api:ops"] =
    "pnpm --filter @gmacko/api-cli exec tsx src/index.ts";
  rootPackage.scripts["mcp:app"] =
    "pnpm --filter @gmacko/mcp-server exec tsx src/index.ts";

  fs.writeJsonSync(rootPackagePath, rootPackage, { spaces: 2 });
}

/**
 * `.mcp.json` ships empty; the operator lane adds the app's own MCP server
 * (packages/mcp-server over the HTTP API) when AI files are kept.
 */
function customizeMcpConfig(targetDir: string, options: CliOptions): void {
  if (!options.includeAi || !options.operatorLane) {
    return;
  }

  const mcpConfigPath = path.join(targetDir, ".mcp.json");
  if (!fs.existsSync(mcpConfigPath)) {
    return;
  }

  const mcpConfig = readMcpConfig(mcpConfigPath);

  mcpConfig.mcpServers ??= {};
  mcpConfig.mcpServers["gmacko-app"] = {
    command: "pnpm",
    args: ["--filter", "@gmacko/mcp-server", "exec", "tsx", "src/index.ts"],
    env: {
      GMACKO_API_URL: "http://localhost:3001",
      GMACKO_API_KEY: "change-me",
    },
  };

  fs.writeJsonSync(mcpConfigPath, mcpConfig, { spaces: 2 });
}

function customizeClaudeInstructions(
  targetDir: string,
  options: CliOptions,
): void {
  if (!options.includeAi || !options.saasBootstrap) {
    return;
  }

  const claudePath = path.join(targetDir, "CLAUDE.md");
  if (!fs.existsSync(claudePath)) {
    return;
  }

  const content = fs.readFileSync(claudePath, "utf8");
  if (content.includes("## Post-Setup SaaS Bootstrap")) {
    return;
  }

  fs.writeFileSync(
    claudePath,
    `${content.trimEnd()}

## Post-Setup SaaS Bootstrap

After \`pnpm bootstrap:local\`:

1. Run \`/office-hours\` to pressure-test the problem, customer, and wedge.
2. If your user-level gstack install includes \`/autoplan\`, run it next to turn the product direction into an execution track.
3. Run \`/design-consultation\` once the problem and audience are clear so \`DESIGN.md\` becomes the visual source of truth.
4. Then use the local skills in \`.claude/skills/bootstrap-saas\`, \`.claude/skills/launch-landing-page\`, \`.claude/skills/setup-stripe-billing\`, \`.claude/skills/bootstrap-expo-app\`, and \`.claude/skills/test-mobile-with-maestro\`.
`,
  );
}

/**
 * `--no-web`: drop the Worker and everything in the root that only drives it
 * (its dev/deploy/e2e scripts, the per-PR preview workflow). The Expo app
 * then targets a separately hosted API (`EXPO_PUBLIC_API_URL`).
 */
function removeWebApp(targetDir: string): void {
  fs.removeSync(path.join(targetDir, WEB_APP_DIR));
  fs.removeSync(path.join(targetDir, ".github/workflows/preview.yml"));

  const rootPackagePath = path.join(targetDir, "package.json");
  const rootPackage = readRootPackage(rootPackagePath);
  rootPackage.scripts ??= {};
  // The D1 scripts run wrangler against apps/web/wrangler.jsonc, which is
  // gone with the app.
  for (const script of [
    "dev:web",
    "dev:app",
    "e2e:web",
    "cf-typegen",
    "check:cf-types",
    "db:migrate:local",
    "db:migrate:remote",
    "db:seed",
    "deploy:migrate",
    "deploy:staging",
    "deploy:production",
    "secrets:push",
  ]) {
    delete rootPackage.scripts[script];
  }
  rootPackage.scripts.dev = "pnpm dev:emulate";
  fs.writeJsonSync(rootPackagePath, rootPackage, { spaces: 2 });

  const portlessPath = path.join(targetDir, "portless.json");
  if (fs.existsSync(portlessPath)) {
    const portless = readPortlessConfig(portlessPath);
    if (portless.apps) delete portless.apps[WEB_APP_DIR];
    fs.writeJsonSync(portlessPath, portless, { spaces: 2 });
  }
}

function configureExpoApp(
  targetDir: string,
  appName: string,
  displayName: string,
): void {
  const expoConfigPath = path.join(
    targetDir,
    `${MOBILE_APP_DIR}/app.config.ts`,
  );
  const sanitizedId = appName.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  const bundleSegment = sanitizedId.replace(/-/g, "");

  let content = fs.readFileSync(expoConfigPath, "utf-8");
  content = content.replace(
    /const base = "com\.gmacko\.app";/,
    `const base = "com.gmacko.${bundleSegment}";`,
  );
  content = content.replace(/return "Gmacko";/, `return "${displayName}";`);
  content = content.replace(
    /return "Gmacko \(Preview\)";/,
    `return "${displayName} (Preview)";`,
  );
  content = content.replace(
    /return "Gmacko \(Dev\)";/,
    `return "${displayName} (Dev)";`,
  );
  content = content.replace(/slug: "gmacko",/, `slug: "${sanitizedId}",`);
  content = content.replace(/scheme: "gmacko",/, `scheme: "${sanitizedId}",`);

  fs.writeFileSync(expoConfigPath, content);
}

function pruneIntegrations(
  targetDir: string,
  integrations: IntegrationConfig,
  keepWebApp: boolean,
): void {
  const packagesToPrune: string[] = [];

  // `@gmacko/monitoring` is structural for the web lane, not optional
  // decoration: apps/web imports it for the browser Sentry init, the root
  // error boundary and the Worker's `withSentry` wrapper, and the package is
  // already inert when `integrations.sentry` is off (every entry point checks
  // the flag). Deleting it would leave four dangling imports, so with a web
  // app it stays and Sentry is simply off.
  const pruneMonitoring = !integrations.sentry && !keepWebApp;
  if (pruneMonitoring) {
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

  if (!integrations.posthog) {
    pruneWebAnalyticsFiles(targetDir);
  }

  if (!integrations.stripe) {
    pruneWebStripeFiles(targetDir);
  }

  // Only rewrite the Expo files for a package that is actually gone; an
  // integration that is merely off is handled at runtime by `integrations`.
  if (!integrations.posthog || pruneMonitoring) {
    pruneExpoProviders(targetDir, {
      posthog: integrations.posthog,
      sentry: !pruneMonitoring,
    });
  }

  if (pruneMonitoring) {
    pruneExpoErrorBoundary(targetDir);
  }

  // Remove references to pruned packages from EVERY remaining workspace
  // package.json — not just apps. e.g. apps/web declares @gmacko/payments,
  // so pruning payments (Stripe off) otherwise breaks `pnpm install` with
  // ERR_PNPM_WORKSPACE_PKG_NOT_FOUND.
  const prunedDeps = packagesToPrune.map((p) => `@gmacko/${p}`);
  for (const dir of ["apps", "packages", "tooling"]) {
    const base = path.join(targetDir, dir);
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base)) {
      const pkgPath = path.join(base, entry, "package.json");
      if (!fs.existsSync(pkgPath)) continue;
      const pkg = fs.readJsonSync(pkgPath);
      let changed = false;
      for (const dep of prunedDeps) {
        if (pkg.dependencies?.[dep] !== undefined) {
          delete pkg.dependencies[dep];
          changed = true;
        }
        if (pkg.devDependencies?.[dep] !== undefined) {
          delete pkg.devDependencies[dep];
          changed = true;
        }
      }
      // Drop now-empty dependency maps entirely — sherif (pnpm lint:ws, run in
      // postinstall) rejects empty `dependencies`/`devDependencies` fields.
      if (pkg.dependencies && Object.keys(pkg.dependencies).length === 0) {
        delete pkg.dependencies;
      }
      if (
        pkg.devDependencies &&
        Object.keys(pkg.devDependencies).length === 0
      ) {
        delete pkg.devDependencies;
      }
      if (changed) fs.writeJsonSync(pkgPath, pkg, { spaces: 2 });
    }
  }
}

function pruneOptionalLanes(targetDir: string, options: CliOptions): void {
  if (!options.saasBootstrap) {
    fs.removeSync(path.join(targetDir, "docs/ai/BOOTSTRAP_PLAYBOOK.md"));
    fs.removeSync(path.join(targetDir, ".claude/skills/bootstrap-saas"));
    fs.removeSync(path.join(targetDir, ".claude/skills/launch-landing-page"));
    fs.removeSync(path.join(targetDir, ".claude/skills/setup-stripe-billing"));
    fs.removeSync(path.join(targetDir, ".claude/skills/bootstrap-expo-app"));
    fs.removeSync(
      path.join(targetDir, ".claude/skills/test-mobile-with-maestro"),
    );
  }

  if (!options.operatorLane) {
    fs.removeSync(path.join(targetDir, "packages/operator-core"));
    fs.removeSync(path.join(targetDir, "packages/api-cli"));
    fs.removeSync(path.join(targetDir, "packages/mcp-server"));
    // The template root carries the lane's scripts; without the packages
    // they would point at nothing.
    const rootPackagePath = path.join(targetDir, "package.json");
    const rootPackage = readRootPackage(rootPackagePath);
    if (rootPackage.scripts) {
      delete rootPackage.scripts["api:ops"];
      delete rootPackage.scripts["mcp:app"];
      fs.writeJsonSync(rootPackagePath, rootPackage, { spaces: 2 });
    }
  }
}

/**
 * PostHog off + prune: `apps/web/src/providers.tsx` is the only importer of
 * `@gmacko/analytics/web`; it becomes a pass-through. (Sentry has no
 * equivalent here: `packages/monitoring` survives whenever apps/web does —
 * see `pruneIntegrations` — and is inert with the integration off.)
 */
function pruneWebAnalyticsFiles(targetDir: string): void {
  const providersPath = path.join(
    targetDir,
    `${WEB_APP_DIR}/src/providers.tsx`,
  );
  if (!fs.existsSync(providersPath)) return;

  fs.writeFileSync(
    providersPath,
    `/**
 * Browser-side providers. Analytics was pruned at scaffold time; add a
 * provider here when one is needed.
 */
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return children;
}
`,
  );
}

/**
 * PostHog and/or Sentry off + prune: `apps/expo/src/providers.tsx` is the one
 * importer of `@gmacko/analytics/native` and (with the error boundary) of
 * `@gmacko/monitoring/native`. Regenerate it with only the providers whose
 * packages survive, so no import dangles once the packages are removed.
 */
function pruneExpoProviders(
  targetDir: string,
  keep: { posthog: boolean; sentry: boolean },
): void {
  const providersPath = path.join(
    targetDir,
    `${MOBILE_APP_DIR}/src/providers.tsx`,
  );
  if (!fs.existsSync(providersPath)) return;

  const sentry = keep.sentry;
  const posthog = keep.posthog;
  const imports = [
    posthog
      ? 'import { PostHogNativeProvider } from "@gmacko/analytics/native";'
      : null,
    // `integrations` and `env` are only read by the Sentry/PostHog branches.
    sentry || posthog ? 'import { integrations } from "@gmacko/config";' : null,
    'import en from "@gmacko/i18n/messages/en.json";',
    'import es from "@gmacko/i18n/messages/es.json";',
    'import { I18nNativeProvider } from "@gmacko/i18n/native";',
    sentry
      ? 'import { initSentryNative } from "@gmacko/monitoring/native";'
      : null,
    'import type { ReactNode } from "react";',
    sentry
      ? 'import { useEffect, useState } from "react";'
      : 'import { useState } from "react";',
    "",
    sentry || posthog ? 'import { env } from "./config/env";' : null,
    'import { getStoredLocale } from "./utils/i18n";',
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const sentryEffect = sentry
    ? `
  useEffect(() => {
    if (integrations.sentry && env.observability.sentryDsn) {
      initSentryNative({
        dsn: env.observability.sentryDsn,
        environment: env.environment,
        debug: env.enableDebugMode,
        tracesSampleRate: env.isProduction ? 0.1 : 1.0,
      });
    }
  }, []);
`
    : "";

  const posthogWrap = posthog
    ? `
  if (integrations.posthog && env.observability.posthogKey) {
    return (
      <PostHogNativeProvider
        apiKey={env.observability.posthogKey}
        apiHost={env.observability.posthogHost}
      >
        {content}
      </PostHogNativeProvider>
    );
  }
`
    : "";

  const pruned = [
    !posthog ? "analytics" : null,
    !sentry ? "monitoring" : null,
  ].filter(Boolean);

  fs.writeFileSync(
    providersPath,
    `/**
 * App-wide providers. ${pruned.join(" and ")} ${pruned.length > 1 ? "were" : "was"} pruned at
 * scaffold time; add the provider back here when the package is restored.
 */
${imports}

interface ProvidersProps {
  children: ReactNode;
}

const resources = {
  en: { translation: en },
  es: { translation: es },
} as const;

export function Providers({ children }: ProvidersProps) {
  const [initialLocale] = useState(getStoredLocale);
${sentryEffect}
  const content = (
    <I18nNativeProvider resources={resources} initialLocale={initialLocale}>
      {children}
    </I18nNativeProvider>
  );
${posthogWrap}
  return content;
}
`,
  );
}

/**
 * Sentry off + prune: `apps/expo/src/components/error-boundary.tsx` reports
 * caught errors through `@gmacko/monitoring/native`. Strip that import and
 * the two guarded `captureExceptionNative` calls; the boundary itself (and
 * its `integrations.sentry` status line, now always false) stays.
 */
function pruneExpoErrorBoundary(targetDir: string): void {
  const boundaryPath = path.join(
    targetDir,
    `${MOBILE_APP_DIR}/src/components/error-boundary.tsx`,
  );
  if (!fs.existsSync(boundaryPath)) return;

  let content = fs.readFileSync(boundaryPath, "utf-8");
  content = content.replace(
    'import { captureExceptionNative } from "@gmacko/monitoring/native";\n',
    "",
  );
  content = content.replace(
    /\n *\/\/ Report to Sentry if enabled\n *if \(integrations\.sentry\) \{\n *captureExceptionNative\(error\);\n *\}\n/,
    "\n",
  );
  content = content.replace(
    /const handleReport = \(\) => \{\n *if \(onReport\) \{\n *onReport\(\);\n *\} else if \(integrations\.sentry && error\) \{\n[^}]*\}\n *\};/,
    "const handleReport = () => {\n    onReport?.();\n  };",
  );
  if (content.includes("captureExceptionNative")) {
    throw new Error(
      "pruneExpoErrorBoundary: apps/expo/src/components/error-boundary.tsx no longer matches the template; update the scaffolder",
    );
  }
  fs.writeFileSync(boundaryPath, content);
}

/**
 * Stripe off + prune: the webhook route keeps its path (it is part of the
 * generated route tree) but no longer verifies deliveries through
 * `@gmacko/payments`; it answers 503 until the payments package is added
 * back. Its signature test goes with the package, and so does the CloudFault
 * scenario that perturbs its delivery — the fault lane itself stays (its
 * config, runner and helpers are payment-agnostic), so the generated app has
 * a working lane to add the first scenario to.
 */
function pruneWebStripeFiles(targetDir: string): void {
  const webhookPath = path.join(
    targetDir,
    `${WEB_APP_DIR}/src/server/stripe-webhook.ts`,
  );
  if (!fs.existsSync(webhookPath)) return;

  fs.writeFileSync(
    webhookPath,
    `/**
 * \`POST /api/webhooks/stripe\`: payments were pruned at scaffold time, so the
 * route only acknowledges that no webhook is configured. Restore
 * \`packages/payments\` and its \`constructWebhookEvent\` to verify deliveries.
 */
export interface StripeWebhookOptions {
  /** \`STRIPE_WEBHOOK_SECRET\`; unset means the endpoint is not configured. */
  readonly secret: string | undefined;
  /**
   * The idempotency ledger (\`@gmacko/api\`'s \`WebhookEvents\`). Declared but
   * unused while payments are pruned, so the route below still typechecks;
   * Stripe delivers at least once, and a restored handler must dedupe on
   * \`event.id\` before it runs any side effect.
   */
  readonly events?:
    | {
        readonly claim: (event: {
          readonly id: string;
          readonly type: string;
        }) => Promise<"first" | "duplicate" | "retry">;
        readonly complete: (id: string) => Promise<void>;
      }
    | undefined;
  readonly onEvent?:
    | ((type: string, id: string) => void | Promise<void>)
    | undefined;
}

/** The one body this endpoint answers with while payments are pruned. */
type WebhookResponseBody = { readonly error: string };

const json = (status: number, body: WebhookResponseBody): Response =>
  Response.json(body, { status });

export const handleStripeWebhook = async (
  request: Request,
  _options: StripeWebhookOptions,
): Promise<Response> => {
  if (request.method !== "POST") {
    return json(405, { error: "method not allowed" });
  }
  return json(503, { error: "webhook not configured" });
};
`,
  );
  fs.removeSync(
    path.join(
      targetDir,
      `${WEB_APP_DIR}/src/server/__tests__/stripe-webhook.test.ts`,
    ),
  );
  // The Stripe scenario and the two helpers only it uses. The rest of the
  // lane is payment-agnostic and stays, including the sign-up rate-limit
  // scenario, so the generated app still has a working fault lane and a
  // worked example to copy.
  for (const file of [
    `${WEB_APP_DIR}/fault/stripe-webhook.fault.ts`,
    `${WEB_APP_DIR}/fault/helpers/ledger.ts`,
    `${WEB_APP_DIR}/fault/helpers/stripe.ts`,
  ]) {
    fs.removeSync(path.join(targetDir, file));
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

/** Skipped when copying a local template: VCS state, installs, build and dev-server output. */
const SKIPPED_TEMPLATE_DIRS = new Set([
  ".git",
  ".jj",
  "node_modules",
  ".turbo",
  ".cache",
  "dist",
  ".wrangler",
  ".tanstack",
  ".artifacts",
  ".expo",
  "coverage",
  "playwright-report",
  "test-results",
  "storybook-static",
]);

function shouldCopyTemplatePath(src: string): boolean {
  return !SKIPPED_TEMPLATE_DIRS.has(path.basename(src));
}
