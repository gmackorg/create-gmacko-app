#!/bin/bash
set -euo pipefail

HAS_DOCKER_COMPOSE=0
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

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  HAS_DOCKER_COMPOSE=1
  echo "Starting local Postgres..."
  docker compose up -d postgres
  echo ""
else
  echo "Docker Compose not available; skipping local Postgres startup."
  echo "Docker Compose was not found. Start Postgres another way, then re-run:"
  echo "  pnpm db:push"
  echo ""
fi

echo "Generating auth artifacts..."
pnpm auth:generate
echo ""

echo "Generating database artifacts..."
pnpm db:generate
echo ""

if [ "$HAS_DOCKER_COMPOSE" -eq 1 ]; then
  echo "Pushing schema to local Postgres..."
  pnpm db:push
  echo ""
else
  echo "Skipping db:push because Docker Compose was unavailable."
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

if [ "$HAS_DOCKER_COMPOSE" -eq 1 ]; then
  echo "  pnpm dev"
else
  echo "  pnpm dev  # after your Postgres instance is running"
fi
