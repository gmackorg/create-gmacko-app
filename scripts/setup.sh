#!/bin/bash
set -e

echo "==================================="
echo "  create-gmacko-app Setup"
echo "==================================="
echo ""

# Check Node.js version
REQUIRED_NODE_VERSION="24"
CURRENT_NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)

if [ "$CURRENT_NODE_VERSION" -lt "$REQUIRED_NODE_VERSION" ]; then
  echo "Error: Node.js $REQUIRED_NODE_VERSION+ is required (found: $(node -v))"
  exit 1
fi

echo "Node.js version: $(node -v)"
echo "pnpm version: $(pnpm -v)"
echo ""

# Run doctor checks before installing dependencies
echo "Running doctor checks..."
pnpm doctor
echo ""

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Copy .env.example to .env if not exists
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo ""
  echo "IMPORTANT: Update .env with your credentials before running the app."
  echo ""
fi

# Build packages
echo "Building packages..."
pnpm build

echo ""
echo "==================================="
echo "  Setup Complete!"
echo "==================================="
echo ""
echo "Next steps:"
echo "  1. Run 'pnpm bootstrap:local' for the guided local bootstrap path"
echo "  2. The repo installs @forgegraph/cli locally, so 'pnpm forge:*' should work after setup."
echo "     If you also want the published CLI outside this repo, run:"
echo "     pnpm dlx @forgegraph/cli@latest --help"
echo "  3. Run 'pnpm forge:doctor' once forge is available"
echo "  4. Run 'pnpm dev' to start development servers"
echo ""
