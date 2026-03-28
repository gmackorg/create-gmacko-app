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
HAS_ENV=0

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
  HAS_ENV=1
else
  warn ".env is missing; copy .env.example to .env before starting app services"
fi

if [ -f "$ROOT_DIR/.forgegraph.yaml" ]; then
  ok ".forgegraph.yaml present"
  if grep -q "forge.example.com\|change-me-staging-node\|change-me-production-node\|change-me.preview.example.com\|change-me.example.com" "$ROOT_DIR/.forgegraph.yaml"; then
    warn ".forgegraph.yaml still has placeholder ForgeGraph values; update server, domains, and stage node IDs before deploying"
  fi
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

if command -v forge >/dev/null 2>&1; then
  ok "ForgeGraph CLI available"
else
  warn "ForgeGraph CLI (forge) not installed; install @forgegraph/cli or use forge from ../ForgeGraph for deploy workflows"
fi

echo ""
echo "Checking configured env groups..."

check_env_group() {
  local label="$1"
  shift

  if [ "$HAS_ENV" -eq 0 ]; then
    warn "$label: .env is missing"
    return
  fi

  local missing=()
  local key
  for key in "$@"; do
    if ! grep -Eq "^${key}=" "$ROOT_DIR/.env"; then
      missing+=("$key")
    fi
  done

  if [ "${#missing[@]}" -eq 0 ]; then
    ok "$label"
  else
    warn "$label missing: ${missing[*]}"
  fi
}

check_env_group "Core app env values" "DATABASE_URL" "AUTH_SECRET"

if [ -f "$ROOT_DIR/.forgegraph.yaml" ]; then
  check_env_group "ForgeGraph deploy values" "DATABASE_URL" "AUTH_SECRET"
fi

echo ""
echo "Checking shared platform primitives..."
ok "Feature flags: local scaffolding with room for PostHog migration later"
ok "Background jobs: local queue hooks scaffolded for email, billing, and metering work"
ok "Rate limits: auth, contact, signup, API keys, and operator API guards are scaffolded"
ok "Compliance export hooks: data export and deletion hooks are scaffolded"

if [ -f "$ROOT_DIR/packages/config/src/integrations.ts" ] && grep -q 'provider: "resend"' "$ROOT_DIR/packages/config/src/integrations.ts"; then
  check_env_group "Resend email env values" "RESEND_API_KEY"
fi

if [ -f "$ROOT_DIR/apps/nextjs/wrangler.jsonc" ]; then
  ok "Cloudflare Workers lane detected"

  if command -v wrangler >/dev/null 2>&1; then
    ok "Wrangler CLI available"
  else
    warn "Wrangler CLI not installed; vinext deploy workflows will be unavailable"
  fi

  check_env_group \
    "Cloudflare Workers env values" \
    "CLOUDFLARE_ACCOUNT_ID" \
    "CLOUDFLARE_API_TOKEN"
fi

if [ -d "$ROOT_DIR/packages/operator-core" ] || [ -d "$ROOT_DIR/packages/trpc-cli" ] || grep -q '"gmacko-app"' "$ROOT_DIR/.mcp.json" 2>/dev/null; then
  ok "Operator API lane detected"
  check_env_group \
    "Operator API env values" \
    "GMACKO_API_URL" \
    "GMACKO_API_KEY"
fi

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "Doctor found $FAILURES blocking issue(s) and $WARNINGS warning(s)."
  exit 1
fi

echo "Doctor passed with $WARNINGS warning(s)."
