#!/bin/bash
set -euo pipefail

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
  echo "Starting local Postgres..."
  docker compose up -d postgres
  echo ""
else
  echo "Docker Compose not available; skipping local Postgres startup."
  echo ""
fi

echo "Generating auth artifacts..."
pnpm auth:generate
echo ""

echo "Generating database artifacts..."
pnpm db:generate
echo ""

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "Pushing schema to local Postgres..."
  pnpm db:push
  echo ""
else
  echo "Skipping db:push because Docker Compose was unavailable."
  echo ""
fi

echo "Running fast validation..."
pnpm check:fast
echo ""

echo "==================================="
echo "  Bootstrap Complete"
echo "==================================="
echo ""
echo "Recommended next commands:"
echo "  pnpm fg:doctor"
echo "  pnpm dev"
