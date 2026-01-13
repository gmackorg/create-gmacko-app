import { execSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ScaffoldOptions {
  appName?: string;
  flags?: string[];
  cwd?: string;
  timeout?: number;
}

export interface ScaffoldResult {
  appName: string;
  appPath: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function getCliPath(): string {
  return path.join(__dirname, "../../dist/index.js");
}

/**
 * Generate a unique app name for testing
 */
export function generateAppName(prefix = "test-app"): string {
  const suffix = randomBytes(4).toString("hex");
  return `${prefix}-${suffix}`;
}

/**
 * Get a temp directory for test output
 */
export function getTempDir(): string {
  const tempBase = process.env.RUNNER_TEMP || "/tmp";
  return path.join(tempBase, "create-gmacko-app-tests");
}

/**
 * Ensure temp directory exists
 */
export function ensureTempDir(): string {
  const tempDir = getTempDir();
  fs.ensureDirSync(tempDir);
  return tempDir;
}

/**
 * Clean up a test app directory
 */
export function cleanupApp(appPath: string): void {
  if (fs.existsSync(appPath)) {
    fs.removeSync(appPath);
  }
}

/**
 * Run the CLI with given options
 */
export async function runCli(
  options: ScaffoldOptions = {},
): Promise<ScaffoldResult> {
  const appName = options.appName || generateAppName();
  const cwd = options.cwd || ensureTempDir();
  const appPath = path.join(cwd, appName);
  const cliPath = getCliPath();
  const timeout = options.timeout || 300000; // 5 minutes default

  const args = [cliPath, appName, ...(options.flags || [])];

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const child = spawn("node", args, {
      cwd,
      env: { ...process.env, CI: "true" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`CLI timed out after ${timeout}ms`));
    }, timeout);

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        appName,
        appPath,
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });

    // Answer prompts with defaults by piping 'n' for provisioning question
    child.stdin?.write("n\n");
    child.stdin?.end();
  });
}

/**
 * Run a command in the generated app directory
 */
export function runInApp(
  appPath: string,
  command: string,
  options: { timeout?: number; env?: Record<string, string> } = {},
): { success: boolean; stdout: string; stderr: string } {
  const timeout = options.timeout || 600000; // 10 minutes default

  try {
    const stdout = execSync(command, {
      cwd: appPath,
      timeout,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CI: "true", ...options.env },
      encoding: "utf-8",
    });

    return { success: true, stdout: stdout || "", stderr: "" };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string };
    return {
      success: false,
      stdout: execError.stdout || "",
      stderr: execError.stderr || "",
    };
  }
}

/**
 * Check if a file exists in the generated app
 */
export function fileExists(appPath: string, relativePath: string): boolean {
  return fs.existsSync(path.join(appPath, relativePath));
}

/**
 * Read a file from the generated app
 */
export function readFile(appPath: string, relativePath: string): string {
  return fs.readFileSync(path.join(appPath, relativePath), "utf-8");
}

/**
 * Read JSON from the generated app
 */
export function readJson<T = unknown>(
  appPath: string,
  relativePath: string,
): T {
  return fs.readJsonSync(path.join(appPath, relativePath)) as T;
}

/**
 * Check package.json structure
 */
export function validatePackageJson(
  appPath: string,
  checks: {
    name?: string;
    hasScript?: string;
    hasDependency?: string;
    hasDevDependency?: string;
  },
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    const pkg = readJson<{
      name?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }>(appPath, "package.json");

    if (checks.name && pkg.name !== checks.name) {
      errors.push(`Expected name "${checks.name}", got "${pkg.name}"`);
    }

    if (checks.hasScript && !pkg.scripts?.[checks.hasScript]) {
      errors.push(`Missing script "${checks.hasScript}"`);
    }

    if (checks.hasDependency && !pkg.dependencies?.[checks.hasDependency]) {
      errors.push(`Missing dependency "${checks.hasDependency}"`);
    }

    if (
      checks.hasDevDependency &&
      !pkg.devDependencies?.[checks.hasDevDependency]
    ) {
      errors.push(`Missing devDependency "${checks.hasDevDependency}"`);
    }
  } catch (err) {
    errors.push(`Failed to read package.json: ${err}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a mock .env file for testing
 */
export function createMockEnv(appPath: string): void {
  const envContent = `
# Mock environment for testing
DATABASE_URL="postgresql://test:test@localhost:5432/test"
AUTH_SECRET="test-secret-key-for-testing-only"
AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
`;

  fs.writeFileSync(path.join(appPath, ".env"), envContent.trim());
}

/**
 * Expected file structure for different configurations
 */
export const EXPECTED_FILES = {
  core: [
    "package.json",
    "pnpm-workspace.yaml",
    "turbo.json",
    ".env.example",
    "packages/api/package.json",
    "packages/db/package.json",
    "packages/auth/package.json",
    "packages/config/package.json",
    "packages/ui/package.json",
  ],
  withWeb: ["apps/nextjs/package.json", "apps/nextjs/next.config.js"],
  withMobile: ["apps/expo/package.json", "apps/expo/app.config.ts"],
  withTanstackStart: ["apps/tanstack-start/package.json"],
  withSentry: ["packages/monitoring/package.json"],
  withPosthog: ["packages/analytics/package.json"],
  withAi: [".opencode", "opencode.json"],
} as const;
