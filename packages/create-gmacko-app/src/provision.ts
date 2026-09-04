import * as p from "@clack/prompts";
import { exec, execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import pc from "picocolors";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface ProvisionConfig {
  projectPath: string;
  appName: string;
  platforms: {
    web: boolean;
    mobile: boolean;
  };
}

interface CliTool {
  name: string;
  command: string;
  installHint: string;
}

const CLI_TOOLS = {
  gh: {
    name: "GitHub CLI",
    command: "gh",
    installHint: "brew install gh",
  },
  tea: {
    name: "Gitea CLI (tea)",
    command: "tea",
    installHint: "brew install tea",
  },
  eas: {
    name: "EAS CLI",
    command: "eas",
    installHint: "npm i -g eas-cli",
  },
} satisfies Record<string, CliTool>;

function isCliInstalled(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isCliAuthenticated(command: string): boolean {
  try {
    switch (command) {
      case "gh":
        execSync("gh auth status", { stdio: "ignore" });
        return true;
      case "eas":
        execSync("eas whoami", { stdio: "ignore" });
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * A failed `exec` rejects with an Error whose message already carries the
 * command line and the child's exit status.
 */
function commandFailureMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function runCommand(
  command: string,
  cwd: string,
): Promise<{ success: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd });
    return { success: true, output: stdout || stderr };
  } catch (error) {
    return { success: false, output: commandFailureMessage(error) };
  }
}

async function provisionGitRepo(config: ProvisionConfig): Promise<boolean> {
  const hasGh = isCliInstalled("gh");
  const hasTea = isCliInstalled("tea");

  if (!hasGh && !hasTea) {
    p.log.warn(
      "No Git hosting CLI found. Install GitHub CLI (gh) or Gitea CLI (tea)",
    );
    return false;
  }

  const options: { value: string; label: string }[] = [];
  if (hasGh) options.push({ value: "gh", label: "GitHub" });
  if (hasTea) options.push({ value: "tea", label: "Gitea" });
  options.push({ value: "skip", label: "Skip" });

  const provider = await p.select({
    message: "Where would you like to host your repository?",
    options,
  });

  if (p.isCancel(provider) || provider === "skip") {
    return false;
  }

  const visibility = await p.select({
    message: "Repository visibility?",
    options: [
      { value: "private", label: "Private" },
      { value: "public", label: "Public" },
    ],
    initialValue: "private",
  });

  if (p.isCancel(visibility)) {
    return false;
  }

  const spinner = p.spinner();
  spinner.start("Creating repository...");

  let result: { success: boolean; output: string };

  if (provider === "gh") {
    if (!isCliAuthenticated("gh")) {
      spinner.stop("Not authenticated");
      p.log.warn("Please run `gh auth login` first");
      return false;
    }
    result = await runCommand(
      `gh repo create ${config.appName} --${visibility} --source=. --remote=origin --push`,
      config.projectPath,
    );
  } else {
    result = await runCommand(
      `tea repo create --name ${config.appName} --${visibility === "private" ? "private" : "public"}`,
      config.projectPath,
    );
  }

  if (result.success) {
    spinner.stop("Repository created!");
    return true;
  } else {
    spinner.stop("Failed to create repository");
    p.log.error(result.output);
    return false;
  }
}

/**
 * Deployment guidance for the web lane: one Cloudflare Worker and one D1 per
 * stage, orchestrated by ForgeGraph (docs/DEPLOYMENT.md in the generated app).
 */
async function provisionForgeGraph(config: ProvisionConfig): Promise<boolean> {
  if (!config.platforms.web) {
    return false;
  }

  const shouldSetup = await p.confirm({
    message: "Show ForgeGraph + Cloudflare deployment steps?",
    initialValue: true,
  });

  if (p.isCancel(shouldSetup) || !shouldSetup) {
    return false;
  }

  const forgeGraphPath = path.resolve(config.projectPath, "../ForgeGraph");
  const hasLocalReference = existsSync(forgeGraphPath);
  const worker = workerName(config.appName);

  p.log.info("Deployment guidance (Cloudflare Workers + D1 via ForgeGraph):");
  p.log.message(
    pc.cyan(
      `1. Create the stage databases once and paste their ids into apps/web/wrangler.jsonc:\n   pnpm -F @gmacko/web exec wrangler d1 create ${worker}-staging\n   pnpm -F @gmacko/web exec wrangler d1 create ${worker}\n   pnpm -F @gmacko/web exec wrangler d1 create ${worker}-preview`,
    ),
  );
  p.log.message(
    pc.cyan(
      `2. Put the stage secrets in ForgeGraph (forge secret set KEY --stage staging), then push them: pnpm secrets:push --stage staging`,
    ),
  );
  p.log.message(
    pc.cyan(
      `3. Deploy: pnpm deploy:staging (applies the pending D1 migrations, then wrangler deploy); ForgeGraph runs the same script from .forgegraph.yaml.`,
    ),
  );
  if (hasLocalReference) {
    p.log.message(
      pc.cyan(
        `4. Use the local ForgeGraph repo at ${forgeGraphPath} and register the app with forge.`,
      ),
    );
    p.log.message(
      pc.cyan(
        `   Example flow: forge login --server <forgegraph-url> --token <token>`,
      ),
    );
    p.log.message(
      pc.cyan(
        `   Then: pnpm forge:apply && forge deploy create staging --wait`,
      ),
    );
  }

  return true;
}

async function provisionEAS(config: ProvisionConfig): Promise<boolean> {
  if (!config.platforms.mobile) {
    return false;
  }

  if (!isCliInstalled("eas")) {
    p.log.warn(`EAS CLI not found. Install with: ${CLI_TOOLS.eas.installHint}`);
    return false;
  }

  if (!isCliAuthenticated("eas")) {
    p.log.warn("Please run `eas login` first");
    return false;
  }

  const shouldSetup = await p.confirm({
    message: "Set up EAS Build for mobile?",
    initialValue: true,
  });

  if (p.isCancel(shouldSetup) || !shouldSetup) {
    return false;
  }

  const spinner = p.spinner();
  spinner.start("Configuring EAS...");

  const initResult = await runCommand(
    "eas init --non-interactive",
    `${config.projectPath}/apps/expo`,
  );

  if (!initResult.success) {
    spinner.stop("EAS init failed");
    p.log.error(initResult.output);
    return false;
  }

  const configResult = await runCommand(
    "eas build:configure --platform all",
    `${config.projectPath}/apps/expo`,
  );

  if (configResult.success) {
    spinner.stop("EAS configured!");
    p.log.info("Run `eas build` in apps/expo when ready to build");
    return true;
  } else {
    spinner.stop("EAS configure failed");
    p.log.error(configResult.output);
    return false;
  }
}

/**
 * The local D1: apply the checked-in migrations and seed the defaults. No
 * service to start; Miniflare keeps the database in apps/web/.wrangler/state.
 */
async function provisionLocalDatabase(
  config: ProvisionConfig,
): Promise<boolean> {
  if (!config.platforms.web) {
    return false;
  }

  const shouldSetup = await p.confirm({
    message: "Set up the local D1 database (migrate + seed)?",
    initialValue: true,
  });

  if (p.isCancel(shouldSetup) || !shouldSetup) {
    return false;
  }

  const spinner = p.spinner();
  spinner.start("Applying D1 migrations to the local database...");

  const migrate = await runCommand(
    "pnpm -F @gmacko/db migrate:local",
    config.projectPath,
  );
  if (!migrate.success) {
    spinner.stop("Failed to migrate the local D1");
    p.log.error(migrate.output);
    return false;
  }

  const seed = await runCommand("pnpm db:seed", config.projectPath);
  if (!seed.success) {
    spinner.stop("Migrated, but the seed failed");
    p.log.error(seed.output);
    return false;
  }

  spinner.stop("Local D1 ready");
  p.log.info(
    "The web app reads the repo-root .env (no DATABASE_URL); `pnpm dev` starts emulate and the app.",
  );

  return true;
}

/** Worker and D1 base name for an app (wrangler names are lowercase, digits and dashes). */
export function workerName(appName: string): string {
  return `${appName.replace(/^@[^/]+\//, "").replace(/[^a-z0-9-]/g, "-")}-web`;
}

/** The provisioning steps the picker offers, in prompt order. */
export type ProvisionService = "git" | "database" | "forgegraph" | "eas";

export interface ProvisionServiceOption {
  value: ProvisionService;
  label: string;
  hint: string;
}

/**
 * Builds the service picker's options. `isInstalled` is the PATH probe seam:
 * it only decides a hint, so tests pass a fixed probe instead of shelling out.
 */
export function provisionServiceOptions(
  config: ProvisionConfig,
  isInstalled: (command: string) => boolean = isCliInstalled,
): ProvisionServiceOption[] {
  return [
    {
      value: "git",
      label: "Git Repository (GitHub/Gitea)",
      hint:
        isInstalled("gh") || isInstalled("tea") ? "available" : "CLI not found",
    },
    {
      value: "database",
      label: "Local D1 database (migrate + seed)",
      hint: config.platforms.web ? "recommended" : "web not selected",
    },
    {
      value: "forgegraph",
      label: "ForgeGraph + Cloudflare deployment",
      hint: config.platforms.web ? "recommended" : "web not selected",
    },
    {
      value: "eas",
      label: "EAS Build (Expo)",
      hint: config.platforms.mobile
        ? isInstalled("eas")
          ? "available"
          : "CLI not found"
        : "mobile not selected",
    },
  ];
}

export async function runProvisioning(config: ProvisionConfig): Promise<void> {
  p.intro(pc.bgMagenta(pc.white(" Provisioning Services ")));

  const selectedServices = await p.multiselect<ProvisionService>({
    message: "Which services would you like to set up?",
    options: provisionServiceOptions(config),
    required: false,
  });

  if (p.isCancel(selectedServices) || selectedServices.length === 0) {
    p.outro("Provisioning skipped");
    return;
  }

  const results: Record<string, boolean> = {};

  if (selectedServices.includes("git")) {
    results.git = await provisionGitRepo(config);
  }

  if (selectedServices.includes("database")) {
    results.database = await provisionLocalDatabase(config);
  }

  if (selectedServices.includes("forgegraph")) {
    results.forgegraph = await provisionForgeGraph(config);
  }

  if (selectedServices.includes("eas")) {
    results.eas = await provisionEAS(config);
  }

  p.outro("Provisioning complete!");

  const successful = Object.entries(results)
    .filter(([, success]) => success)
    .map(([name]) => name);
  const failed = Object.entries(results)
    .filter(([, success]) => !success)
    .map(([name]) => name);

  if (successful.length > 0) {
    p.log.success(`Set up: ${successful.join(", ")}`);
  }
  if (failed.length > 0) {
    p.log.warn(`Skipped/failed: ${failed.join(", ")}`);
  }
}
