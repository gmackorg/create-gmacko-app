import { execSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_REPO = path.resolve(__dirname, "../../../../");

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

const CLI_PACKAGE_ROOT = path.resolve(__dirname, "..", "..");
let cliBuilt = false;

/**
 * Build the CLI (dist/index.js) that the scaffold/e2e suites spawn via runCli().
 *
 * turbo's `test` task only dependsOn `^build` (upstream workspace deps) and this
 * package has none, so nothing builds the CLI before its tests run. Without this,
 * every runCli() spawns a missing dist/index.js and exits 1 (the whole scaffold
 * suite failed this way). Runs once per vitest process; tsup is ~0.5s.
 */
export function ensureCliBuilt(): void {
  if (cliBuilt) return;
  execSync("pnpm build", { cwd: CLI_PACKAGE_ROOT, stdio: "pipe" });
  cliBuilt = true;
}

/**
 * Whether a command is on PATH. Used to keep tests robust to tools that may not
 * be installed on every runner (e.g. `jj` is absent on CI ubuntu images).
 */
export function isCommandAvailable(command: string): boolean {
  try {
    execSync(`command -v ${command}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
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
      env: {
        ...process.env,
        CI: "true",
        CREATE_GMACKO_APP_TEMPLATE_REPO: TEMPLATE_REPO,
      },
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

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

export interface RunInAppOptions {
  timeout?: number;
  env?: Record<string, string>;
}

/**
 * `execSync` with piped stdio throws an Error carrying the child's captured
 * `stdout`/`stderr` (strings here, since the call sets `encoding: "utf-8"`).
 * Both are optional, so a throw from anywhere else reads as empty output.
 */
interface ExecFailure extends Error {
  stdout?: string;
  stderr?: string;
}

function execFailure(cause: unknown): ExecFailure {
  // SAFETY: `stdout`/`stderr` are optional on ExecFailure, so this widening of
  // an Error can only ever produce `undefined` for a throw that did not come
  // from execSync — never a wrong string.
  return cause instanceof Error
    ? (cause as ExecFailure)
    : new Error(String(cause));
}

/**
 * Run a command in the generated app directory
 */
export function runInApp(
  appPath: string,
  command: string,
  options: RunInAppOptions = {},
): CommandResult {
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
  } catch (error) {
    const failure = execFailure(error);
    return {
      success: false,
      stdout: failure.stdout || "",
      stderr: failure.stderr || "",
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
  return fs.readJsonSync(path.join(appPath, relativePath));
}

/**
 * Create a mock .env for a generated app. Mirrors the keys `.env.example`
 * documents: the web lane reads these as Worker bindings (no DATABASE_URL,
 * the database is a local D1), Expo reads the EXPO_PUBLIC_* values, and the
 * operator lane reads GMACKO_API_*.
 */
export function createMockEnv(appPath: string): void {
  const envContent = `
# Mock environment for testing
STAGE="development"
APP_URL="http://localhost:3001"
AUTH_SECRET="test-secret-key-for-testing-only-32-chars"
AUTH_GITHUB_ID="test-github-client-id"
AUTH_GITHUB_SECRET="test-github-client-secret"
AUTH_GOOGLE_ID="test-google-client-id"
AUTH_GOOGLE_SECRET="test-google-client-secret"
BYPASS_MAGIC_LINK="true"
VITE_POSTHOG_HOST="https://us.i.posthog.com"
EXPO_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"
EXPO_PUBLIC_POSTHOG_KEY_DEV="phc_test_dev"
EXPO_PUBLIC_POSTHOG_KEY_STAGING="phc_test_staging"
EXPO_PUBLIC_POSTHOG_KEY_PROD="phc_test_prod"
EXPO_PUBLIC_SENTRY_DSN_DEV="https://test@example.ingest.sentry.io/123"
EXPO_PUBLIC_SENTRY_DSN_STAGING="https://test@example.ingest.sentry.io/456"
EXPO_PUBLIC_SENTRY_DSN_PROD="https://test@example.ingest.sentry.io/789"
CLOUDFLARE_ACCOUNT_ID="test-cloudflare-account"
CLOUDFLARE_API_TOKEN="test-cloudflare-token"
GMACKO_API_URL="http://localhost:3001"
GMACKO_API_KEY="test-gmacko-api-key"
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
    "packages/domain/package.json",
    "packages/api/package.json",
    "packages/api-client/package.json",
    "packages/db/package.json",
    "packages/db/migrations",
    "packages/auth/package.json",
    "packages/config/package.json",
    "packages/ui/package.json",
  ],
  withWeb: [
    "apps/web/package.json",
    "apps/web/vite.config.ts",
    "apps/web/wrangler.jsonc",
    "apps/web/src/server/worker.ts",
    "apps/web/src/server/runtime.ts",
    "apps/web/src/routes/__root.tsx",
    "apps/web/e2e",
  ],
  withStorybook: [
    "packages/ui/.storybook/main.ts",
    "packages/ui/.storybook/preview.tsx",
    "packages/ui/src/button.stories.tsx",
  ],
  withMobile: ["apps/expo/package.json", "apps/expo/app.config.ts"],
  withSentry: ["packages/monitoring/package.json"],
  withPosthog: ["packages/analytics/package.json"],
  withAi: [
    ".opencode",
    "opencode.json",
    "CLAUDE.md",
    ".claude/skills/gstack/setup",
    ".claude/skills/create-gmacko-app-workflow/SKILL.md",
    "docs/ai/INITIAL_PROPOSAL.md",
  ],
  /** Never present in a scaffold: the pre-migration stack. */
  legacy: [
    "apps/nextjs",
    "packages/legacy-api",
    "packages/legacy-db",
    "packages/legacy-auth",
    "docker-compose.yml",
    "Dockerfile",
    ".dockerignore",
  ],
} as const;
