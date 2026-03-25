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

const CLI_TOOLS: Record<string, CliTool> = {
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
  docker: {
    name: "Docker",
    command: "docker",
    installHint: "Install Docker Desktop or docker engine",
  },
};

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

async function runCommand(
  command: string,
  cwd: string,
): Promise<{ success: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd });
    return { success: true, output: stdout || stderr };
  } catch (error) {
    const err = error as { message: string };
    return { success: false, output: err.message };
  }
}

export async function provisionGitRepo(
  config: ProvisionConfig,
): Promise<boolean> {
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

export async function provisionForgeGraph(
  config: ProvisionConfig,
): Promise<boolean> {
  if (!config.platforms.web) {
    return false;
  }

  const shouldSetup = await p.confirm({
    message: "Show ForgeGraph deployment steps?",
    initialValue: true,
  });

  if (p.isCancel(shouldSetup) || !shouldSetup) {
    return false;
  }

  const forgeGraphPath = path.resolve(config.projectPath, "../ForgeGraph");
  const hasLocalReference = existsSync(forgeGraphPath);

  p.log.info("ForgeGraph deployment guidance:");
  p.log.message(
    pc.cyan(
      `1. Keep this repo flake-based and deploy it from ForgeGraph on your Hetzner VPS.`,
    ),
  );
  p.log.message(
    pc.cyan(
      `2. Run Postgres alongside the app first and export DATABASE_URL in the deployment environment.`,
    ),
  );
  p.log.message(
    pc.cyan(
      `3. Use flake.nix as the Nix entry point for build and runtime definitions.`,
    ),
  );
  if (hasLocalReference) {
    p.log.message(
      pc.cyan(
        `4. Use the local ForgeGraph repo at ${forgeGraphPath} and deploy with forge.`,
      ),
    );
    p.log.message(
      pc.cyan(
        `   Example flow: forge login --server <forgegraph-url> --token <token>`,
      ),
    );
    p.log.message(
      pc.cyan(
        `   Then: forge app create ${config.appName} --flake-ref . && forge stage add production --node <node-id> && forge deploy create production --wait`,
      ),
    );
  }

  return true;
}

export async function provisionEAS(config: ProvisionConfig): Promise<boolean> {
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

export async function provisionPostgres(
  config: ProvisionConfig,
): Promise<boolean> {
  if (!isCliInstalled("docker")) {
    p.log.warn(
      `Docker not found. Install with: ${CLI_TOOLS.docker.installHint}`,
    );
    return false;
  }

  try {
    execSync("docker compose version", {
      cwd: config.projectPath,
      stdio: "ignore",
    });
  } catch {
    p.log.warn(
      "Docker Compose is required to start the local Postgres service",
    );
    return false;
  }

  const shouldSetup = await p.confirm({
    message: "Start the local Postgres service?",
    initialValue: true,
  });

  if (p.isCancel(shouldSetup) || !shouldSetup) {
    return false;
  }

  const spinner = p.spinner();
  spinner.start("Starting Postgres...");

  const result = await runCommand(
    "docker compose up -d postgres",
    config.projectPath,
  );

  if (!result.success) {
    spinner.stop("Failed to start Postgres");
    p.log.error(result.output);
    return false;
  }

  spinner.stop("Postgres started!");
  p.log.info("Use this connection string in your .env file:");
  p.log.message(
    pc.cyan(
      `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gmacko_dev"`,
    ),
  );

  return true;
}

export async function runProvisioning(config: ProvisionConfig): Promise<void> {
  p.intro(pc.bgMagenta(pc.white(" Provisioning Services ")));

  const services = await p.multiselect({
    message: "Which services would you like to set up?",
    options: [
      {
        value: "git",
        label: "Git Repository (GitHub/Gitea)",
        hint:
          isCliInstalled("gh") || isCliInstalled("tea")
            ? "available"
            : "CLI not found",
      },
      {
        value: "postgres",
        label: "Postgres Setup",
        hint: isCliInstalled("docker") ? "available" : "Docker not found",
      },
      {
        value: "forgegraph",
        label: "ForgeGraph Deployment",
        hint: config.platforms.web ? "recommended" : "web not selected",
      },
      {
        value: "eas",
        label: "EAS Build (Expo)",
        hint: config.platforms.mobile
          ? isCliInstalled("eas")
            ? "available"
            : "CLI not found"
          : "mobile not selected",
      },
    ],
    required: false,
  });

  if (p.isCancel(services) || (services as string[]).length === 0) {
    p.outro("Provisioning skipped");
    return;
  }

  const selectedServices = services as string[];
  const results: Record<string, boolean> = {};

  if (selectedServices.includes("git")) {
    results.git = await provisionGitRepo(config);
  }

  if (selectedServices.includes("postgres")) {
    results.postgres = await provisionPostgres(config);
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
