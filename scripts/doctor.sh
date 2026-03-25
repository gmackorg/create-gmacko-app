#!/bin/bash
set -euo pipefail

echo "==================================="
echo "  create-gmacko-app Doctor"
echo "==================================="
echo ""
echo "Checking local development prerequisites..."

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_JSON="$ROOT_DIR/package.json"
NVMRC_FILE="$ROOT_DIR/.nvmrc"

FAILURES=0
WARNINGS=0

ok() {
  echo "  [ok] $1"
}

warn() {
  echo "  [warn] $1"
  WARNINGS=$((WARNINGS + 1))
}

fail() {
  echo "  [fail] $1"
  FAILURES=$((FAILURES + 1))
}

if command -v node >/dev/null 2>&1; then
  CURRENT_NODE_VERSION="$(node -v)"
  CURRENT_NODE_MAJOR="$(echo "$CURRENT_NODE_VERSION" | cut -d'v' -f2 | cut -d'.' -f1)"
  REQUIRED_NODE_MAJOR="$(cut -d'.' -f1 "$NVMRC_FILE")"

  if [ "$CURRENT_NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]; then
    fail "Node.js $REQUIRED_NODE_MAJOR+ is required (found: $CURRENT_NODE_VERSION)"
  else
    ok "Node.js $CURRENT_NODE_VERSION"
  fi
else
  fail "Node.js is not installed"
fi

if command -v pnpm >/dev/null 2>&1; then
  CURRENT_PNPM_VERSION="$(pnpm -v)"
  CURRENT_PNPM_MAJOR="$(echo "$CURRENT_PNPM_VERSION" | cut -d'.' -f1)"
  REQUIRED_PNPM_MAJOR="$(
    node -e 'const pkg=require(process.argv[1]); console.log(pkg.packageManager.split("@")[1].split(".")[0]);' \
      "$PACKAGE_JSON"
  )"

  if [ "$CURRENT_PNPM_MAJOR" -lt "$REQUIRED_PNPM_MAJOR" ]; then
    fail "pnpm $REQUIRED_PNPM_MAJOR+ is required (found: $CURRENT_PNPM_VERSION)"
  else
    ok "pnpm $CURRENT_PNPM_VERSION"
  fi
else
  fail "pnpm is not installed"
fi

if [ -f "$ROOT_DIR/.env" ]; then
  ok ".env present"
else
  warn ".env is missing; copy .env.example to .env before starting app services"
fi

if [ -f "$ROOT_DIR/.forgegraph.yaml" ]; then
  ok ".forgegraph.yaml present"
else
  warn ".forgegraph.yaml is missing; ForgeGraph deployment metadata has not been configured"
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "Docker Compose available"
else
  warn "Docker Compose not available; local Postgres bootstrap will be unavailable"
fi

if command -v jj >/dev/null 2>&1; then
  ok "jj available"
else
  warn "jj not installed; Git compatibility still works, but the repo defaults are jj-first"
fi

if command -v fg >/dev/null 2>&1; then
  ok "ForgeGraph CLI available"
else
  warn "ForgeGraph CLI (fg) not installed; install/use fg from ../ForgeGraph for deploy workflows"
fi

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "Doctor found $FAILURES blocking issue(s) and $WARNINGS warning(s)."
  exit 1
fi

echo "Doctor passed with $WARNINGS warning(s)."
