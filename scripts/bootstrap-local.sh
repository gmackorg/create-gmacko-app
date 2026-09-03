#!/bin/bash
set -euo pipefail

HAS_PORTLESS=0
HAS_PLACEHOLDER_FORGEGRAPH=0

echo "==================================="
echo "  create-gmacko-app Local Bootstrap"
echo "==================================="
echo ""

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  pnpm install
  echo ""
fi

echo "Running doctor checks..."
pnpm doctor
echo ""

if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "Update .env with your real local values before leaving bootstrap."
  echo ""
fi

# Check for portless
if command -v portless >/dev/null 2>&1; then
  HAS_PORTLESS=1
  echo "portless detected."
else
  echo "portless not found. Install with: npm i -g portless"
  echo "portless gives your app a stable HTTPS URL: https://gmacko.localhost"
  echo ""
fi

# Generate emulate config if missing
if [ ! -f emulate.config.yaml ]; then
  echo "Generating emulate.config.yaml..."
  npx @gmacko/emulate init --slug gmacko
  echo ""
fi

echo "Start emulate services with 'pnpm dev:emulate' (or together with the app: 'pnpm dev')."
echo ""

echo "Generating auth artifacts..."
pnpm auth:generate
echo ""

echo "Generating database artifacts..."
pnpm db:generate
echo ""

# The D1 steps need apps/web's wrangler config; a mobile-only scaffold
# (--no-web) has none and talks to a separately hosted API.
if [ -f apps/web/wrangler.jsonc ]; then
  echo "Applying D1 migrations to the local database..."
  pnpm db:migrate:local
  pnpm db:seed
  echo ""
else
  echo "Skipping D1 migrate/seed — apps/web/wrangler.jsonc not present (no web app)."
  echo ""
fi

if [ -f .forgegraph.yaml ] && grep -q "forge.example.com\|change-me.preview.example.com\|change-me.example.com" .forgegraph.yaml; then
  HAS_PLACEHOLDER_FORGEGRAPH=1
fi

echo "Running fast validation..."
pnpm check:fast
echo ""

echo "==================================="
echo "  Bootstrap Complete"
echo "==================================="
echo ""
echo "Dev environment:"
if [ "$HAS_PORTLESS" -eq 1 ]; then
  echo "  App:      https://gmacko.localhost (via portless)"
else
  echo "  App:      http://localhost:3001 (install portless for HTTPS)"
fi
echo "  Emulate:  pnpm dev:emulate (GitHub/Google/Apple OAuth, Stripe, Resend)"
echo "  All:      pnpm dev (emulate + apps/web together)"
echo ""
echo "Recommended next commands:"
if [ "$HAS_PLACEHOLDER_FORGEGRAPH" -eq 1 ]; then
  echo "ForgeGraph placeholders are still present in .forgegraph.yaml."
  echo "Update the server and domains, then run:"
  echo "  pnpm forge:doctor"
  echo "  pnpm dlx @forgegraph/cli@latest --help  # optional global/published CLI"
  echo "  pnpm forge:diff"
  echo "  pnpm forge:apply"
else
  echo "  pnpm forge:doctor"
  echo "  pnpm dlx @forgegraph/cli@latest --help  # optional global/published CLI"
fi
echo "  pnpm dev"
