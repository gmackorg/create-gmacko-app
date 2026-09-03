#!/bin/bash
# =============================================================================
# Mobile Development Script
# =============================================================================
# Starts the full mobile development environment with:
# 1. The web app (apps/web: TanStack Start + the Effect HTTP API on workerd)
# 2. ngrok tunnel for API (so mobile device can reach local API)
# 3. Expo with tunnel mode
#
# Prerequisites:
# - ngrok: brew install ngrok
# - ngrok account: https://dashboard.ngrok.com (free tier works)
# - jq: brew install jq
#
# Usage:
#   ./scripts/dev-mobile.sh                    # Uses random ngrok URL
#   ./scripts/dev-mobile.sh --domain myapp     # Uses myapp.ngrok.app (requires paid ngrok)
#   ./scripts/dev-mobile.sh --expo-go          # Use Expo Go instead of dev client
#   ./scripts/dev-mobile.sh --dev-client       # Build and use development client
#
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${BLUE}i${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }
step() { echo -e "${CYAN}→${NC} $1"; }

# Get script directory and move to repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Parse arguments
NGROK_DOMAIN=""
USE_EXPO_GO=false
BUILD_DEV_CLIENT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --domain)
            NGROK_DOMAIN="$2"
            shift 2
            ;;
        --expo-go)
            USE_EXPO_GO=true
            shift
            ;;
        --dev-client)
            BUILD_DEV_CLIENT=true
            shift
            ;;
        --help|-h)
            echo ""
            echo "Mobile Development Script"
            echo ""
            echo "Usage: ./scripts/dev-mobile.sh [options]"
            echo ""
            echo "Options:"
            echo "  --domain NAME     Use a static ngrok domain (NAME.ngrok.app)"
            echo "  --expo-go         Use Expo Go (limited native modules)"
            echo "  --dev-client      Build development client first"
            echo "  --help, -h        Show this help"
            echo ""
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Temp files for logs
WEB_LOG="/tmp/gmacko-web.log"
WEB_PORT="${WEB_PORT:-3001}"
NGROK_LOG="/tmp/gmacko-ngrok.log"

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              Mobile Development Environment                     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# Prerequisites Check
# =============================================================================

# Check for ngrok
if ! command -v ngrok &> /dev/null; then
    error "ngrok is not installed. Install with: brew install ngrok"
fi

# Check for jq
if ! command -v jq &> /dev/null; then
    error "jq is not installed. Install with: brew install jq"
fi

# Check ngrok auth
if ! ngrok config check &> /dev/null 2>&1; then
    warn "ngrok may not be authenticated"
    info "Get your auth token at: https://dashboard.ngrok.com/get-started/your-authtoken"
    info "Then run: ngrok authtoken YOUR_TOKEN"
    echo ""
fi

# =============================================================================
# Cleanup Handler
# =============================================================================

WEB_PID=""
NGROK_PID=""

cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down...${NC}"
    
    [ -n "$WEB_PID" ] && kill $WEB_PID 2>/dev/null || true
    [ -n "$NGROK_PID" ] && kill $NGROK_PID 2>/dev/null || true
    
    # Kill any orphaned processes
    pkill -f "vite dev" 2>/dev/null || true
    
    rm -f "$WEB_LOG" "$NGROK_LOG"
    
    echo -e "${GREEN}Goodbye!${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# =============================================================================
# Build Development Client (if requested)
# =============================================================================

if [[ "$BUILD_DEV_CLIENT" == true ]]; then
    step "Building development client..."
    info "This will build a custom Expo dev client with your native modules"
    echo ""
    
    read -p "Build for which platform? (ios/android/both) " PLATFORM
    
    cd apps/expo
    case $PLATFORM in
        ios)
            eas build --profile development --platform ios
            ;;
        android)
            eas build --profile development --platform android
            ;;
        both)
            eas build --profile development --platform all
            ;;
        *)
            warn "Skipping dev client build"
            ;;
    esac
    cd "$REPO_ROOT"
    echo ""
fi

# =============================================================================
# Step 1: Start the web app (vite dev on workerd, local D1)
# =============================================================================

step "Starting the web app on port ${WEB_PORT}..."
> "$WEB_LOG"

PORT="$WEB_PORT" pnpm dev:app > "$WEB_LOG" 2>&1 &
WEB_PID=$!

# Wait for the Worker to answer its liveness probe
WEB_READY=""
for i in {1..60}; do
    if curl -sf "http://localhost:${WEB_PORT}/api/health/live" >/dev/null 2>&1; then
        WEB_READY=1
        break
    fi
    sleep 1
done

if [ -z "$WEB_READY" ]; then
    error "The web app failed to start. Check logs: $WEB_LOG"
fi

success "Web app running on port ${WEB_PORT}"

# =============================================================================
# Step 2: Start ngrok Tunnel
# =============================================================================

step "Starting ngrok tunnel..."

if [ -n "$NGROK_DOMAIN" ]; then
    # Static domain (requires ngrok paid plan)
    NGROK_URL="https://${NGROK_DOMAIN}.ngrok.app"
    ngrok http "$WEB_PORT" --url="$NGROK_URL" --log=stdout > "$NGROK_LOG" 2>&1 &
else
    # Random URL (free tier)
    ngrok http "$WEB_PORT" --log=stdout --log-format=json > "$NGROK_LOG" 2>&1 &
fi
NGROK_PID=$!

# Wait for tunnel to be ready
API_URL=""
for i in {1..30}; do
    if [ -n "$NGROK_DOMAIN" ]; then
        # Check static domain
        if curl -s --head "https://${NGROK_DOMAIN}.ngrok.app" >/dev/null 2>&1; then
            API_URL="https://${NGROK_DOMAIN}.ngrok.app"
            break
        fi
    else
        # Parse random URL from ngrok API
        API_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | jq -r '.tunnels[0].public_url // empty' 2>/dev/null)
        if [ -n "$API_URL" ]; then
            break
        fi
    fi
    sleep 1
done

if [ -z "$API_URL" ]; then
    error "ngrok tunnel failed to start. Check logs: $NGROK_LOG"
fi

success "API tunnel: ${API_URL}"

# =============================================================================
# Step 3: Start Expo
# =============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}Development environment ready!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${BLUE}Web App:${NC}      http://localhost:${WEB_PORT}"
echo -e "${BLUE}API Tunnel:${NC}   ${API_URL}"
echo -e "${BLUE}API:${NC}          ${API_URL}/api"
echo -e "${BLUE}Auth:${NC}         ${API_URL}/api/auth"
echo ""

step "Starting Expo..."
echo -e "EXPO_PUBLIC_API_URL=${API_URL}"
echo ""

if [[ "$USE_EXPO_GO" == true ]]; then
    info "Using Expo Go - some native modules may not work"
    echo ""
fi

echo -e "${YELLOW}Scan the QR code with your phone camera (iOS) or Expo Go app (Android)${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"
echo ""

# Run Expo
cd apps/expo
if [[ "$USE_EXPO_GO" == true ]]; then
    EXPO_PUBLIC_API_URL="$API_URL" npx expo start --tunnel --go
else
    EXPO_PUBLIC_API_URL="$API_URL" npx expo start --tunnel
fi
