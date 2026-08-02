// Pure environment-validation logic, deliberately free of `expo-constants` /
// react-native imports so it is unit-testable without the RN runtime. `env.ts`
// resolves the config (reading Constants) and re-exports these; the app entry
// calls validateEnvironment(env) at boot via `validate-boot`.

export type AppEnvironment = "development" | "preview" | "production";

export interface ObservabilityConfig {
  sentryDsn?: string;
  posthogKey?: string;
  posthogHost: string;
}

export interface EnvironmentConfig {
  apiUrl: string;
  environment: AppEnvironment;
  isDevelopment: boolean;
  isPreview: boolean;
  isProduction: boolean;
  enableDebugMode: boolean;
  observability: ObservabilityConfig;
}

// Hosts the scaffold ships with. A preview/production build still pointing at
// one of these was never configured — fail rather than silently talk to a
// placeholder.
export const PLACEHOLDER_API_HOSTS = [
  "api.yourapp.com",
  "staging-api.yourapp.com",
];

/**
 * Collect configuration problems that must not reach a preview/production
 * build. Returns [] in development (which is intentionally lenient).
 */
export function collectEnvironmentErrors(config: EnvironmentConfig): string[] {
  const errors: string[] = [];
  if (config.environment === "development") return errors;

  let hostname: string | null = null;
  try {
    hostname = new URL(config.apiUrl).hostname;
  } catch {
    errors.push(`API_URL is not a valid URL: "${config.apiUrl}"`);
  }
  if (!config.apiUrl.startsWith("https://")) {
    errors.push(`API_URL must use HTTPS in ${config.environment} builds`);
  }
  if (hostname && PLACEHOLDER_API_HOSTS.includes(hostname)) {
    const varName = config.isProduction
      ? "EXPO_PUBLIC_PRODUCTION_API_URL"
      : "EXPO_PUBLIC_STAGING_API_URL";
    errors.push(
      `API_URL still points at the scaffold placeholder ${hostname}. Set ${varName} (or extra.API_URL).`,
    );
  }
  // Telemetry is required in shipped builds so crashes/usage are actually
  // captured — a build with no Sentry/PostHog is effectively unmonitored.
  if (!config.observability.sentryDsn) {
    errors.push(
      `Sentry DSN is required for ${config.environment} builds (set EXPO_PUBLIC_SENTRY_DSN).`,
    );
  }
  if (!config.observability.posthogKey) {
    errors.push(
      `PostHog key is required for ${config.environment} builds (set EXPO_PUBLIC_POSTHOG_KEY).`,
    );
  }
  return errors;
}

/**
 * Validate the resolved environment. Throws in preview/production so a
 * misconfigured build fails fast at boot instead of shipping silently; warns in
 * development. Call this from the app entry BEFORE the router loads.
 */
export function validateEnvironment(config: EnvironmentConfig): void {
  const errors = collectEnvironmentErrors(config);
  if (errors.length === 0) return;
  const message = `Environment misconfigured for the ${config.environment} build:\n${errors
    .map((error) => `  - ${error}`)
    .join("\n")}`;
  if (config.isProduction || config.isPreview) {
    throw new Error(message);
  }
  console.warn(`[env] ${message}`);
}
