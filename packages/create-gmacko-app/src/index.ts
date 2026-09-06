import { createRequire } from "node:module";
import { Command } from "commander";
import pc from "picocolors";
import validateNpmPackageName from "validate-npm-package-name";
import { getDefaultOptions, runPrompts } from "./prompts.js";
import { scaffold } from "./scaffold.js";
import type { CliOptions, IntegrationConfig } from "./types.js";

// dist/index.js sits one level below package.json; the CLI reports the version
// changesets publish rather than a hand-maintained string.
// SAFETY: `../package.json` resolves to this package's own manifest, which is
// checked into the repo and republished by changesets; npm rejects a package
// whose manifest has no `version`, so the field is always a string here.
const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

/**
 * The commander flags this CLI reads. Commander parses each declared option
 * into this camelCase shape; options that only take effect through another
 * flag (`--storage-provider`, which the `--integrations` list drives) are
 * deliberately absent because nothing here consumes them.
 */
interface CliFlags {
  yes?: boolean;
  y?: boolean;
  prune?: boolean;
  install?: boolean;
  git?: boolean;
  ai?: boolean;
  provision?: boolean;
  web?: boolean;
  mobile?: boolean;
  saasCollaboration?: boolean;
  saasBilling?: boolean;
  saasMetering?: boolean;
  saasSupport?: boolean;
  saasLaunch?: boolean;
  saasReferrals?: boolean;
  saasOperatorApis?: boolean;
  saasBootstrap?: boolean;
  operatorLane?: boolean;
  integrations?: string;
  emailProvider?: string;
  forgegraph?: boolean;
  packageScope?: string;
  forgegraphServer?: string;
  forgegraphPreviewDomain?: string;
  forgegraphProductionDomain?: string;
}

const program = new Command();

program
  .name("create-gmacko-app")
  .description(
    "Create a new Gmacko app: TanStack Start + Effect on Cloudflare Workers with D1, Expo, and agent-native DX defaults",
  )
  .version(version)
  .argument("<app-name>", "Name of the app to create")
  .option("--yes, -y", "Accept all defaults without prompting")
  .option("--prune", "Remove unused integration packages")
  .option("--no-install", "Skip pnpm install")
  .option("--no-git", "Skip repository init (jj/git)")
  .option("--no-ai", "Exclude AI workflow system")
  .option("--no-provision", "Exclude provisioning script")
  .option(
    "--web",
    "Include the web app: TanStack Start + Effect on Cloudflare Workers with D1 (default: true)",
  )
  .option("--no-web", "Exclude the web app (mobile-only scaffold)")
  .option("--mobile", "Include Expo mobile app (default: true)")
  .option("--no-mobile", "Exclude Expo mobile app")
  .option("--saas-collaboration", "Add collaboration layers to the SaaS app")
  .option("--saas-billing", "Add billing and plans to the SaaS app")
  .option("--saas-metering", "Add metering and usage rollups to the SaaS app")
  .option("--saas-support", "Add support surfaces to the SaaS app")
  .option("--saas-launch", "Add launch controls to the SaaS app")
  .option("--saas-referrals", "Add referral growth tools to the SaaS app")
  .option(
    "--saas-operator-apis",
    "Add operator APIs (CLI + MCP wrappers) to the SaaS app",
  )
  .option(
    "--saas-bootstrap",
    "Add optional Claude SaaS bootstrap skills and post-setup playbook",
  )
  .option(
    "--operator-lane",
    "Add the optional operator lane: CLI + MCP wrappers over the app's HTTP API (admin-scoped API keys)",
  )
  .option(
    "--integrations <list>",
    "Comma-separated list of integrations (sentry,posthog,stripe,revenuecat,notifications,email,realtime,storage)",
  )
  .option("--email-provider <provider>", "Email provider (resend, sendgrid)")
  .option(
    "--forgegraph",
    "Enable ForgeGraph integrations (health, logging, OTEL)",
  )
  .option("--storage-provider <provider>", "Storage provider (r2)")
  .option("--package-scope <scope>", "Package scope (default: @gmacko)")
  .option(
    "--forgegraph-server <url>",
    "ForgeGraph server URL to write into .forgegraph.yaml",
  )
  .option(
    "--forgegraph-preview-domain <domain>",
    "ForgeGraph preview domain placeholder to write into .forgegraph.yaml",
  )
  .option(
    "--forgegraph-production-domain <domain>",
    "ForgeGraph production domain placeholder to write into .forgegraph.yaml",
  )
  .action(async (appName: string, opts: CliFlags) => {
    const validation = validateNpmPackageName(appName);
    if (!validation.validForNewPackages) {
      console.error(pc.red(`Invalid package name: ${appName}`));
      if (validation.errors) {
        validation.errors.forEach((err) => console.error(pc.red(`  - ${err}`)));
      }
      process.exit(1);
    }

    let options: CliOptions;

    if (opts.yes || opts.y) {
      options = getDefaultOptions(appName);
      options.prune = opts.prune === true;
      options.install = opts.install !== false;
      options.git = opts.git !== false;
      options.includeAi = opts.ai !== false;
      options.includeProvision = opts.provision !== false;

      if (opts.web !== undefined) options.platforms.web = opts.web === true;
      if (opts.mobile !== undefined)
        options.platforms.mobile = opts.mobile === true;
      applySaasCapabilityFlags(options, opts);
      applyOperatorLaneFlags(options, opts);
      options.saasBootstrap = opts.saasBootstrap === true;
      applyForgeGraphFlags(options, opts);
      if (opts.packageScope) options.packageScope = opts.packageScope;
      if (opts.forgegraph !== undefined) {
        options.integrations.forgegraph = opts.forgegraph === true;
      }
      if (opts.integrations !== undefined) {
        options.integrations = parseIntegrations(
          opts.integrations,
          opts.emailProvider,
          opts.forgegraph === true,
        );
      }
    } else {
      options = await runPrompts(appName, {
        packageScope: opts.packageScope,
      });
      if (opts.prune !== undefined) options.prune = opts.prune === true;
      if (opts.install !== undefined) options.install = opts.install !== false;
      if (opts.git !== undefined) options.git = opts.git !== false;
      applySaasCapabilityFlags(options, opts);
      applyOperatorLaneFlags(options, opts);
      if (opts.saasBootstrap !== undefined) {
        options.saasBootstrap = opts.saasBootstrap === true;
      }
      if (opts.forgegraph !== undefined) {
        options.integrations.forgegraph = opts.forgegraph === true;
      }
      applyForgeGraphFlags(options, opts);
    }

    if (!options.platforms.web && !options.platforms.mobile) {
      console.error(
        pc.red(
          "Nothing to scaffold: pass at most one of --no-web / --no-mobile.",
        ),
      );
      process.exit(1);
    }

    await scaffold(options);
  });

/**
 * `--email-provider` is free text on the command line; anything other than the
 * one alternative provider falls back to the default the prompts use.
 */
function emailProviderFrom(value: string | undefined): "resend" | "sendgrid" {
  return value === "sendgrid" ? "sendgrid" : "resend";
}

function parseIntegrations(
  list: string,
  emailProvider?: string,
  forgegraph?: boolean,
): IntegrationConfig {
  const items = list.split(",").map((s) => s.trim().toLowerCase());
  const set = new Set(items);

  return {
    sentry: set.has("sentry"),
    posthog: set.has("posthog"),
    forgegraph: forgegraph ?? set.has("forgegraph"),
    stripe: set.has("stripe"),
    revenuecat: set.has("revenuecat"),
    notifications: set.has("notifications"),
    email: {
      enabled: set.has("email"),
      provider: set.has("email") ? emailProviderFrom(emailProvider) : "none",
    },
    realtime: {
      enabled: set.has("realtime"),
      provider: set.has("realtime") ? "redis" : "none",
    },
    storage: {
      enabled: set.has("storage"),
      provider: set.has("storage") ? "r2" : "none",
    },
  };
}

function applySaasCapabilityFlags(options: CliOptions, opts: CliFlags): void {
  if (opts.saasCollaboration !== undefined) {
    options.saasCollaboration = opts.saasCollaboration === true;
  }
  if (opts.saasBilling !== undefined) {
    options.saasBilling = opts.saasBilling === true;
  }
  if (opts.saasMetering !== undefined) {
    options.saasMetering = opts.saasMetering === true;
  }
  if (opts.saasSupport !== undefined) {
    options.saasSupport = opts.saasSupport === true;
  }
  if (opts.saasLaunch !== undefined) {
    options.saasLaunch = opts.saasLaunch === true;
  }
  if (opts.saasReferrals !== undefined) {
    options.saasReferrals = opts.saasReferrals === true;
  }
  if (opts.saasOperatorApis !== undefined) {
    options.saasOperatorApis = opts.saasOperatorApis === true;
  }
}

function applyOperatorLaneFlags(options: CliOptions, opts: CliFlags): void {
  if (opts.saasOperatorApis !== undefined) {
    const requested = opts.saasOperatorApis === true;
    options.saasOperatorApis = requested;
    if (requested) {
      options.operatorLane = true;
    }
  }

  if (opts.operatorLane !== undefined) {
    options.operatorLane = opts.operatorLane === true;
  }
}

function applyForgeGraphFlags(options: CliOptions, opts: CliFlags): void {
  if (opts.forgegraphServer) {
    options.forgegraphServer = opts.forgegraphServer;
  }
  if (opts.forgegraphPreviewDomain) {
    options.forgegraphPreviewDomain = opts.forgegraphPreviewDomain;
  }
  if (opts.forgegraphProductionDomain) {
    options.forgegraphProductionDomain = opts.forgegraphProductionDomain;
  }
}

program.parse();
