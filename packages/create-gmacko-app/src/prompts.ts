import * as p from "@clack/prompts";
import pc from "picocolors";

import type {
  CliOptions,
  IntegrationConfig,
  IntegrationPreset,
  PlatformConfig,
} from "./types.js";
import {
  CORE_INTEGRATIONS,
  DEFAULT_INTEGRATIONS,
  EVERYTHING_INTEGRATIONS,
} from "./types.js";

function toTitleCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function runPrompts(
  appName: string,
  defaults: Partial<CliOptions> = {},
): Promise<CliOptions> {
  p.intro(pc.bgCyan(pc.black(" create-gmacko-app ")));

  const displayName = await p.text({
    message: "What is your app display name?",
    placeholder: toTitleCase(appName),
    defaultValue: toTitleCase(appName),
    validate: (value) => {
      if (value.length === 0) return "Display name is required";
      if (value.length > 50)
        return "Display name must be 50 characters or less";
    },
  });

  if (p.isCancel(displayName)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const platforms = await p.multiselect({
    message: "Which platforms?",
    options: [
      { value: "web", label: "Web (Next.js)", hint: "recommended" },
      { value: "mobile", label: "Mobile (Expo)", hint: "recommended" },
      { value: "tanstackStart", label: "TanStack Start", hint: "experimental" },
    ],
    initialValues: ["web", "mobile"],
    required: true,
  });

  if (p.isCancel(platforms)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const packageScope = await p.text({
    message: "Package scope for workspace packages?",
    placeholder: "@gmacko",
    defaultValue: defaults.packageScope ?? "@gmacko",
    validate: (value) => {
      if (!value.startsWith("@")) return "Scope must start with @";
      if (value.includes(" ")) return "Scope cannot contain spaces";
    },
  });

  if (p.isCancel(packageScope)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const integrationPreset = (await p.select({
    message: "Choose an integration preset",
    options: [
      {
        value: "core",
        label: "Core only",
        hint: "No optional integrations",
      },
      {
        value: "recommended",
        label: "Recommended",
        hint: "Sentry + PostHog",
      },
      {
        value: "everything",
        label: "Everything",
        hint: "All integrations enabled",
      },
      {
        value: "custom",
        label: "Custom",
        hint: "Choose individually",
      },
    ],
    initialValue: "recommended",
  })) as IntegrationPreset;

  if (p.isCancel(integrationPreset)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  let integrations: IntegrationConfig;

  if (integrationPreset === "core") {
    integrations = CORE_INTEGRATIONS;
  } else if (integrationPreset === "recommended") {
    integrations = DEFAULT_INTEGRATIONS;
  } else if (integrationPreset === "everything") {
    integrations = EVERYTHING_INTEGRATIONS;
  } else {
    integrations = await promptCustomIntegrations();
  }

  const includeAi = await p.confirm({
    message: "Include Gmacko AI workflow system?",
    initialValue: true,
  });

  if (p.isCancel(includeAi)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const includeProvision = await p.confirm({
    message: "Include provisioning script?",
    initialValue: true,
  });

  if (p.isCancel(includeProvision)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const prune = await p.confirm({
    message: "Prune unused integrations from the repo?",
    initialValue: false,
  });

  if (p.isCancel(prune)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const install = await p.confirm({
    message: "Run pnpm install?",
    initialValue: true,
  });

  if (p.isCancel(install)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const git = await p.confirm({
    message: "Initialize a git repository?",
    initialValue: true,
  });

  if (p.isCancel(git)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  return {
    appName,
    displayName: displayName as string,
    packageScope: packageScope as string,
    platforms: {
      web: (platforms as string[]).includes("web"),
      mobile: (platforms as string[]).includes("mobile"),
      tanstackStart: (platforms as string[]).includes("tanstackStart"),
    },
    integrations,
    includeAi: includeAi as boolean,
    includeProvision: includeProvision as boolean,
    prune: prune as boolean,
    install: install as boolean,
    git: git as boolean,
  };
}

async function promptCustomIntegrations(): Promise<IntegrationConfig> {
  const selected = await p.multiselect({
    message: "Enable integrations",
    options: [
      { value: "sentry", label: "Sentry (monitoring)", hint: "recommended" },
      { value: "posthog", label: "PostHog (analytics)", hint: "recommended" },
      { value: "stripe", label: "Stripe (payments)" },
      { value: "email", label: "Email" },
      { value: "realtime", label: "Realtime" },
      { value: "storage", label: "Storage" },
    ],
    initialValues: ["sentry", "posthog"],
    required: false,
  });

  if (p.isCancel(selected)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const selectedSet = new Set(selected as string[]);

  let emailProvider: "resend" | "sendgrid" | "none" = "none";
  if (selectedSet.has("email")) {
    const provider = await p.select({
      message: "Email provider?",
      options: [
        { value: "resend", label: "Resend" },
        { value: "sendgrid", label: "SendGrid" },
      ],
      initialValue: "resend",
    });
    if (p.isCancel(provider)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }
    emailProvider = provider as "resend" | "sendgrid";
  }

  let realtimeProvider: "pusher" | "ably" | "none" = "none";
  if (selectedSet.has("realtime")) {
    const provider = await p.select({
      message: "Realtime provider?",
      options: [
        { value: "pusher", label: "Pusher" },
        { value: "ably", label: "Ably" },
      ],
      initialValue: "pusher",
    });
    if (p.isCancel(provider)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }
    realtimeProvider = provider as "pusher" | "ably";
  }

  let storageProvider: "uploadthing" | "none" = "none";
  if (selectedSet.has("storage")) {
    storageProvider = "uploadthing";
  }

  return {
    sentry: selectedSet.has("sentry"),
    posthog: selectedSet.has("posthog"),
    stripe: selectedSet.has("stripe"),
    email: { enabled: selectedSet.has("email"), provider: emailProvider },
    realtime: {
      enabled: selectedSet.has("realtime"),
      provider: realtimeProvider,
    },
    storage: { enabled: selectedSet.has("storage"), provider: storageProvider },
  };
}

export function getDefaultOptions(appName: string): CliOptions {
  return {
    appName,
    displayName: toTitleCase(appName),
    packageScope: "@gmacko",
    platforms: {
      web: true,
      mobile: true,
      tanstackStart: false,
    },
    integrations: DEFAULT_INTEGRATIONS,
    includeAi: true,
    includeProvision: true,
    prune: false,
    install: true,
    git: true,
  };
}
