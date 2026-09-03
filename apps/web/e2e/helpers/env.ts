/**
 * Everything the browser suite and its server agree on: the port the app
 * runs on, where its local D1 lives, and the fixed development-only
 * credentials the Worker is started with. Nothing here is real: the auth
 * secret is a placeholder for a throwaway local database.
 */
import { resolve } from "node:path";

/** apps/web, the Vite root and wrangler config directory. */
export const APP_DIR = resolve(import.meta.dirname, "../..");
export const REPO_DIR = resolve(APP_DIR, "../..");

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3111);
export const BASE_URL = `http://localhost:${E2E_PORT}`;

/** The emulated GitHub the OAuth journey signs in through. */
export const EMULATE_PORT = Number(process.env.E2E_EMULATE_PORT ?? 4310);
export const EMULATE_URL = `http://localhost:${EMULATE_PORT}`;

/**
 * Local D1 for the suite, apart from the developer's `.wrangler/state`:
 * the Vite plugin persists here (`E2E_STATE_DIR` in vite.config.ts) and the
 * helpers pass it to `wrangler d1` as `--persist-to`.
 */
export const STATE_DIR = resolve(APP_DIR, ".wrangler/e2e");

export const AUTH_SECRET_PLACEHOLDER =
  "e2e-placeholder-secret-for-the-local-browser-suite-only-0123456789";

/** The seeded emulate GitHub user (emulate.config.yaml). */
export const GITHUB_USER = {
  login: "dev-user",
  name: "Dev User",
  // gmacko-standards-disable-next-line no-committed-credentials -- emulate.config.yaml seed for the local emulator, not a credential
  email: "dev@gmacko.localhost",
};

/**
 * The only host variables the suite's Worker process inherits. Everything
 * else in the developer's shell (tokens, the real OTLP endpoint, Sentry,
 * Stripe secrets, a PORTLESS_URL) stays out of the Worker's bindings.
 */
const INHERITED_HOST_ENV = ["PATH", "HOME", "NODE_OPTIONS", "CI", "TMPDIR"];

/**
 * The Worker's bindings for the suite: an allowlisted slice of the host
 * environment plus the suite's own fixed values; nothing else crosses over.
 */
export const serverEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const key of INHERITED_HOST_ENV) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return {
    ...env,
    // TODO: `CLOUDFLARE_INCLUDE_PROCESS_ENV` survives only here. Wrangler
    // and the Cloudflare Vite plugin read `.env` from the config directory
    // (apps/web) and nowhere else, and the suite must not write to, or
    // depend on, the developer's `apps/web/.env`; copying this process's
    // (allowlisted) environment into the Worker is the one way to hand it
    // the bindings below. Drop it once the plugin accepts bindings directly.
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
    E2E_STATE_DIR: STATE_DIR,
    STAGE: "development",
    APP_URL: BASE_URL,
    AUTH_SECRET: AUTH_SECRET_PLACEHOLDER,
    BYPASS_MAGIC_LINK: "true",
    AUTH_GITHUB_ID: "dev-github-client",
    // gmacko-standards-disable-next-line no-committed-credentials -- emulate.config.yaml seed for the local emulator, not a credential
    AUTH_GITHUB_SECRET: "dev-github-secret",
    AUTH_GITHUB_URL: EMULATE_URL,
    AUTH_GITHUB_API_URL: EMULATE_URL,
    AUTH_GOOGLE_ID: "dev-google-client",
    // gmacko-standards-disable-next-line no-committed-credentials -- emulate.config.yaml seed for the local emulator, not a credential
    AUTH_GOOGLE_SECRET: "dev-google-secret",
  };
};
