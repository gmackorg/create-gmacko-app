#!/usr/bin/env node
/**
 * Pre-build observability gate.
 *
 * A store build (preview / production) must not ship with crash reporting or
 * analytics silently disabled, or with its API pointed at the scaffold
 * placeholder host. This is the build-time companion to the runtime boot guard
 * in `src/config/env-validation.ts` (which throws at app launch in
 * preview/production) — it fails fast *before* an EAS build is kicked off, so a
 * developer running `pnpm build:prod` with a half-configured env finds out in
 * seconds instead of after a 20-minute cloud build.
 *
 * Keep PLACEHOLDER_API_HOSTS in sync with `src/config/env-validation.ts`.
 *
 * Behaviour:
 *   - development / non-store variants → skipped.
 *   - Any observability/API var present → validate all of them (a partial
 *     config is itself the bug this catches); hard-fail on missing/placeholder.
 *   - No vars visible at all AND running in CI → assume they are provided by
 *     EAS secrets during the cloud build; warn and pass (the runtime boot guard
 *     is the backstop). Outside CI this is a hard failure — configure the env
 *     or re-run with SKIP_OBSERVABILITY_CHECK=1.
 */
import process from "node:process";

// Keep in sync with PLACEHOLDER_API_HOSTS in src/config/env-validation.ts.
const PLACEHOLDER_API_HOSTS = ["api.yourapp.com", "staging-api.yourapp.com"];

const variant =
  process.argv[2] ??
  process.env.APP_VARIANT ??
  process.env.APP_ENV ??
  "production";
const target = variant === "staging" ? "preview" : variant;

if (target !== "preview" && target !== "production") {
  console.log(
    `Observability gate: skipped for non-store variant "${variant}".`,
  );
  process.exit(0);
}

if (process.env.SKIP_OBSERVABILITY_CHECK === "1") {
  console.warn(
    "Observability gate: SKIPPED via SKIP_OBSERVABILITY_CHECK=1 (values assumed provided by EAS secrets).",
  );
  process.exit(0);
}

const isProd = target === "production";
const inCI = process.env.CI === "true" || process.env.CI === "1";

const pick = (prodKey, stagingKey, baseKey) =>
  (isProd ? process.env[prodKey] : process.env[stagingKey]) ??
  process.env[baseKey];

const apiUrl = isProd
  ? process.env.EXPO_PUBLIC_PRODUCTION_API_URL
  : process.env.EXPO_PUBLIC_STAGING_API_URL;
const sentryDsn = pick(
  "EXPO_PUBLIC_SENTRY_DSN_PROD",
  "EXPO_PUBLIC_SENTRY_DSN_STAGING",
  "EXPO_PUBLIC_SENTRY_DSN",
);
const posthogKey = pick(
  "EXPO_PUBLIC_POSTHOG_KEY_PROD",
  "EXPO_PUBLIC_POSTHOG_KEY_STAGING",
  "EXPO_PUBLIC_POSTHOG_KEY",
);

const nothingConfigured = !apiUrl && !sentryDsn && !posthogKey;

if (nothingConfigured) {
  if (inCI) {
    console.warn(
      `Observability gate: no EXPO_PUBLIC_* observability vars visible for the ${target} build. ` +
        "Assuming they are supplied by EAS secrets during the cloud build; the runtime boot guard is the backstop.",
    );
    process.exit(0);
  }
  console.error(
    `Observability gate FAILED for the ${target} build: no observability env is configured.\n` +
      "  - Set EXPO_PUBLIC_" +
      (isProd ? "PRODUCTION" : "STAGING") +
      "_API_URL, EXPO_PUBLIC_SENTRY_DSN*, and EXPO_PUBLIC_POSTHOG_KEY*.\n" +
      "  - Or, if these are provided by EAS secrets, re-run with SKIP_OBSERVABILITY_CHECK=1.",
  );
  process.exit(1);
}

const errors = [];

if (!apiUrl) {
  errors.push(
    `API URL is not set (${
      isProd ? "EXPO_PUBLIC_PRODUCTION_API_URL" : "EXPO_PUBLIC_STAGING_API_URL"
    }).`,
  );
} else {
  let host;
  try {
    const u = new URL(apiUrl);
    host = u.hostname;
    if (u.protocol !== "https:") {
      errors.push(`API URL must use HTTPS: ${apiUrl}`);
    }
  } catch {
    errors.push(`API URL is not a valid URL: ${apiUrl}`);
  }
  // Exact array membership on the already-parsed hostname (not a URL substring).
  // gmacko-standards-disable-next-line exact-host-check
  if (host && PLACEHOLDER_API_HOSTS.includes(host)) {
    errors.push(
      `API URL still points at the scaffold placeholder host: ${host}`,
    );
  }
}

if (!sentryDsn) {
  errors.push("Sentry DSN is not set (crash reporting would be disabled).");
}
if (!posthogKey) {
  errors.push("PostHog key is not set (analytics would be disabled).");
}

if (errors.length > 0) {
  console.error(`Observability gate FAILED for the ${target} build:`);
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  console.error(
    "\nSet the missing EXPO_PUBLIC_* values, or (if they are provided by EAS secrets) re-run with SKIP_OBSERVABILITY_CHECK=1.",
  );
  process.exit(1);
}

console.log(`Observability gate passed for the ${target} build.`);
