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

# Always required: Database
echo ""
echo "=== Database (Neon) ==="
echo "Create a Neon project at https://neon.tech"
prompt_env "DATABASE_URL" "postgresql://...neon.tech/..."

# Always required: Auth
echo ""
echo "=== Authentication ==="
echo "Generate a secret: openssl rand -base64 32"
prompt_env "AUTH_SECRET" "32+ character secret"
echo ""
echo "Create Discord OAuth app at https://discord.com/developers/applications"
prompt_env "AUTH_DISCORD_ID" "Discord Client ID"
prompt_env "AUTH_DISCORD_SECRET" "Discord Client Secret"

# Optional: Check integrations and prompt accordingly
echo ""
echo "=== Optional Integrations ==="
echo "Configure these based on your gmacko.integrations.json settings."
echo ""

# PostHog (if enabled)
echo "PostHog Analytics:"
echo "  Create project at https://posthog.com"
prompt_env "NEXT_PUBLIC_POSTHOG_KEY" "PostHog Project API Key"
prompt_env "NEXT_PUBLIC_POSTHOG_HOST" "PostHog Host (e.g., https://us.i.posthog.com)"

# Sentry (if enabled)
echo ""
echo "Sentry Monitoring:"
echo "  Create project at https://sentry.io"
prompt_env "NEXT_PUBLIC_SENTRY_DSN" "Sentry DSN"

echo ""
echo "==================================="
echo "  Provisioning Complete!"
echo "==================================="
echo ""
echo "Your .env file has been updated."
echo "Run 'pnpm db:push' to initialize the database schema."
echo ""
