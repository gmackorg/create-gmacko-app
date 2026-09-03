#!/bin/bash
set -e

echo "==================================="
echo "  create-gmacko-app Provisioning"
echo "==================================="
echo ""
echo "This script helps provision external services for your app."
echo "It reads enabled integrations from packages/config/src/integrations.ts"
echo ""

# Function to prompt for a value
prompt_env() {
  local var_name=$1
  local description=$2
  local current_value="${!var_name}"
  
  if [ -n "$current_value" ]; then
    echo "  $var_name is already set"
    return
  fi
  
  read -p "  Enter $var_name ($description): " value
  if [ -n "$value" ]; then
    echo "$var_name=\"$value\"" >> .env
    echo "  Added $var_name to .env"
  fi
}

# Database: Cloudflare D1, one per stage. Nothing to put in .env.
echo ""
echo "=== Database (Cloudflare D1) ==="
echo "Local development uses Miniflare's D1 (pnpm db:migrate:local && pnpm db:seed)."
echo "Create the stage databases once and paste their ids into apps/web/wrangler.jsonc:"
echo "  pnpm -F @gmacko/web exec wrangler d1 create <app>-web-staging"
echo "  pnpm -F @gmacko/web exec wrangler d1 create <app>-web"
echo "  pnpm -F @gmacko/web exec wrangler d1 create <app>-web-preview"

# Always required: Auth
echo ""
echo "=== Authentication ==="
echo "Generate a secret: openssl rand -base64 32"
prompt_env "AUTH_SECRET" "32+ character secret"
echo ""
echo "Create GitHub OAuth app at https://github.com/settings/developers"
prompt_env "AUTH_GITHUB_ID" "GitHub Client ID"
prompt_env "AUTH_GITHUB_SECRET" "GitHub Client Secret"
echo ""
echo "Create Google OAuth app at https://console.cloud.google.com/apis/credentials"
prompt_env "AUTH_GOOGLE_ID" "Google Client ID"
prompt_env "AUTH_GOOGLE_SECRET" "Google Client Secret"
echo ""
echo "Apple Sign In (optional): https://developer.apple.com/account/resources/identifiers"
prompt_env "AUTH_APPLE_ID" "Apple Client ID (optional)"
prompt_env "AUTH_APPLE_SECRET" "Apple Client Secret (optional)"

# Cloudflare: deploys and remote D1 commands
echo ""
echo "=== Cloudflare (deploys) ==="
echo "  Account id and an API token with Workers + D1 edit rights: https://dash.cloudflare.com/profile/api-tokens"
prompt_env "CLOUDFLARE_ACCOUNT_ID" "Cloudflare account id"
prompt_env "CLOUDFLARE_API_TOKEN" "Cloudflare API token"

# Optional: Check integrations and prompt accordingly
echo ""
echo "=== Optional Integrations ==="
echo "Configure these based on your gmacko.integrations.json settings."
echo ""

# PostHog (if enabled)
echo "PostHog Analytics:"
echo "  Create project at https://posthog.com"
prompt_env "VITE_POSTHOG_KEY" "PostHog Project API Key"
prompt_env "VITE_POSTHOG_HOST" "PostHog Host (e.g., https://us.i.posthog.com)"

# Sentry (if enabled)
echo ""
echo "Sentry Monitoring:"
echo "  Create project at https://sentry.io"
prompt_env "SENTRY_DSN" "Sentry DSN (Worker)"
prompt_env "VITE_SENTRY_DSN" "Sentry DSN (browser)"

echo ""
echo "==================================="
echo "  Provisioning Complete!"
echo "==================================="
echo ""
echo "Your .env file has been updated."
echo "Run 'pnpm db:migrate:local && pnpm db:seed' to set up the local D1, then 'pnpm dev'."
echo "Stage secrets live in ForgeGraph: 'forge secret set KEY --stage <stage>', then 'pnpm secrets:push --stage <stage>'."
echo ""
