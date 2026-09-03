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

echo "Start emulate services with 'pnpm dev:emulate' or 'pnpm dev:all'."
echo ""

# Wait briefly for emulate Postgres if it's running
if command -v pg_isready >/dev/null 2>&1; then
  echo "Checking for Postgres on localhost:5432..."
  if pg_isready -h localhost -p 5432 -q 2>/dev/null; then
    echo "Postgres is ready."
  else
    echo "Postgres not detected on localhost:5432."
    echo "Start it with: pnpm dev:emulate"
    echo "Or use Docker: docker compose up -d postgres"
    echo ""
  fi
fi

echo "Generating auth artifacts..."
pnpm auth:generate
echo ""

echo "Generating database artifacts..."
pnpm db:generate
echo ""

# The D1 steps need apps/web's wrangler config; the scaffolder prunes apps/web
# unless --tanstack-start was chosen (until Phase 8 makes it the only app).
if [ -f apps/web/wrangler.jsonc ]; then
  echo "Applying D1 migrations to the local database..."
  pnpm db:migrate:local
  pnpm db:seed
  echo ""
else
  echo "Skipping D1 migrate/seed — apps/web/wrangler.jsonc not present (no TanStack Start app)."
  echo ""
fi

# The legacy Next.js app (apps/nextjs) still runs on Postgres until Phase 8.
if command -v pg_isready >/dev/null 2>&1 && pg_isready -h localhost -p 5432 -q 2>/dev/null; then
  echo "Pushing the legacy schema to local Postgres..."
  pnpm db:legacy:push
  echo ""
else
  echo "Skipping db:legacy:push — Postgres not available."
  echo "Start emulate or Docker, then run: pnpm db:legacy:push"
  echo ""
fi

if [ -f .forgegraph.yaml ] && grep -q "forge.example.com\|change-me-staging-node\|change-me-production-node\|change-me.preview.example.com\|change-me.example.com" .forgegraph.yaml; then
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
  echo "  App:      http://localhost:3000 (install portless for HTTPS)"
fi
echo "  Emulate:  pnpm dev:emulate (Postgres, Redis, OAuth, Stripe, Resend)"
echo "  All:      pnpm dev:all (emulate + app together)"
echo ""
echo "Recommended next commands:"
if [ "$HAS_PLACEHOLDER_FORGEGRAPH" -eq 1 ]; then
  echo "ForgeGraph placeholders are still present in .forgegraph.yaml."
  echo "Update server, domains, and node IDs, then run:"
  echo "  pnpm forge:doctor"
  echo "  pnpm dlx @forgegraph/cli@latest --help  # optional global/published CLI"
  echo "  pnpm forge:diff"
  echo "  pnpm forge:apply"
else
  echo "  pnpm forge:doctor"
  echo "  pnpm dlx @forgegraph/cli@latest --help  # optional global/published CLI"
fi
echo "  pnpm dev:all"
