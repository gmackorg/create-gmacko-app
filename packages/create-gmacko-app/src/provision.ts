import { exec, execSync } from "child_process";
import { promisify } from "util";
import * as p from "@clack/prompts";
import pc from "picocolors";

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
  vercel: {
    name: "Vercel CLI",
    command: "vercel",
    installHint: "npm i -g vercel",
  },
  eas: {
    name: "EAS CLI",
    command: "eas",
    installHint: "npm i -g eas-cli",
  },
  neonctl: {
    name: "Neon CLI",
    command: "neonctl",
    installHint: "npm i -g neonctl",
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
      case "vercel":
        execSync("vercel whoami", { stdio: "ignore" });
        return true;
      case "eas":
        execSync("eas whoami", { stdio: "ignore" });
        return true;
      case "neonctl":
        execSync("neonctl me", { stdio: "ignore" });
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

export async function provisionVercel(
  config: ProvisionConfig,
): Promise<boolean> {
  if (!config.platforms.web) {
    return false;
  }

  if (!isCliInstalled("vercel")) {
    p.log.warn(
      `Vercel CLI not found. Install with: ${CLI_TOOLS.vercel.installHint}`,
    );
    return false;
  }

  if (!isCliAuthenticated("vercel")) {
    p.log.warn("Please run `vercel login` first");
    return false;
  }

  const shouldSetup = await p.confirm({
    message: "Set up Vercel deployment?",
    initialValue: true,
  });

  if (p.isCancel(shouldSetup) || !shouldSetup) {
    return false;
  }

  const spinner = p.spinner();
  spinner.start("Linking to Vercel...");

  const result = await runCommand(
    "vercel link --yes",
    `${config.projectPath}/apps/nextjs`,
  );

  if (result.success) {
    spinner.stop("Vercel project linked!");

    const envSpinner = p.spinner();
    envSpinner.start("Pulling environment variables...");

    const envResult = await runCommand(
      "vercel env pull .env.local",
      `${config.projectPath}/apps/nextjs`,
    );

    if (envResult.success) {
      envSpinner.stop("Environment variables pulled!");
    } else {
      envSpinner.stop("Could not pull env vars (you can do this later)");
    }

    return true;
  } else {
    spinner.stop("Failed to link Vercel");
    p.log.error(result.output);
    return false;
  }
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

export async function provisionNeon(config: ProvisionConfig): Promise<boolean> {
  if (!isCliInstalled("neonctl")) {
    p.log.warn(
      `Neon CLI not found. Install with: ${CLI_TOOLS.neonctl.installHint}`,
    );
    return false;
  }

  if (!isCliAuthenticated("neonctl")) {
    p.log.warn("Please run `neonctl auth` first");
    return false;
  }

  const shouldSetup = await p.confirm({
    message: "Create a Neon database project?",
    initialValue: true,
  });

  if (p.isCancel(shouldSetup) || !shouldSetup) {
    return false;
  }

  const spinner = p.spinner();
  spinner.start("Creating Neon project...");

  const result = await runCommand(
    `neonctl projects create --name ${config.appName} --set-context`,
    config.projectPath,
  );

  if (!result.success) {
    spinner.stop("Failed to create Neon project");
    p.log.error(result.output);
    return false;
  }

  spinner.message("Getting connection string...");

  const connResult = await runCommand(
    "neonctl connection-string --pooled",
    config.projectPath,
  );

  if (connResult.success) {
    spinner.stop("Neon project created!");
    p.log.info("Add this to your .env file:");
    p.log.message(pc.cyan(`POSTGRES_URL="${connResult.output.trim()}"`));
    return true;
  } else {
    spinner.stop("Project created but could not get connection string");
    return true;
  }
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
        value: "neon",
        label: "Neon Database",
        hint: isCliInstalled("neonctl") ? "available" : "CLI not found",
      },
      {
        value: "vercel",
        label: "Vercel Deployment",
        hint: config.platforms.web
          ? isCliInstalled("vercel")
            ? "available"
            : "CLI not found"
          : "web not selected",
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

  if (selectedServices.includes("neon")) {
    results.neon = await provisionNeon(config);
  }

  if (selectedServices.includes("vercel")) {
    results.vercel = await provisionVercel(config);
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
