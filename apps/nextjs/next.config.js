import { withSentryConfig } from "@sentry/nextjs";
import { createJiti } from "jiti";

import { integrations } from "@gmacko/config";

const jiti = createJiti(import.meta.url);

await jiti.import("./src/env");

/** @type {import("next").NextConfig} */
const config = {
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,

  transpilePackages: [
    "@gmacko/api",
    "@gmacko/auth",
    "@gmacko/config",
    "@gmacko/db",
    "@gmacko/monitoring",
    "@gmacko/ui",
    "@gmacko/validators",
  ],

  typescript: { ignoreBuildErrors: true },
};

const sentryConfig = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
};

export default integrations.sentry
  ? withSentryConfig(config, sentryConfig)
  : config;
