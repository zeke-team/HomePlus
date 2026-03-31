#!/bin/bash
#
# HomePlus Start Script
# 
# This script starts the HomePlus server with proper configuration.
# It loads environment variables from .env file if present.
#
# Usage: ./scripts/start.sh
#
# Options:
#   --dev    Start in development mode with verbose logging
#   --help   Show this help message
#
# @author HomePlus Team
# @license MIT
#

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Change to project directory
cd "$PROJECT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
DEV_MODE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dev)
            DEV_MODE=true
            shift
            ;;
        --help|-h)
            echo "HomePlus Start Script"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --dev     Start in development mode with verbose logging"
            echo "  --help    Show this help message"
            echo ""
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Load .env file if it exists
if [ -f .env ]; then
    echo -e "${BLUE}[ENV]${NC} Loading environment from .env file..."
    
    # Read .env and export variables (simple parser)
    while IFS='=' read -r key value || [ -n "$key" ]; do
        # Skip comments and empty lines
        if [[ "$key" =~ ^[[:space:]]*# ]] || [[ -z "$key" ]]; then
            continue
        fi
        
        # Remove leading/trailing whitespace from key
        key=$(echo "$key" | xargs)
        
        # Remove quotes from value if present
        value=$(echo "$value" | sed 's/^["'"'"']//;s/["'"'"']$//' | xargs)
        
        # Export variable
        export "$key=$value"
    done < .env
    
    echo -e "${GREEN}✓${NC} Environment loaded"
else
    echo -e "${YELLOW}⚠${NC} No .env file found, using defaults"
fi

# Set development mode if requested
if [ "$DEV_MODE" = true ]; then
    export NODE_ENV=development
    export LOG_LEVEL=debug
fi

echo ""
echo "========================================"
echo "  HomePlus Server"
echo "========================================"
echo ""

# Display configuration
echo -e "${CYAN}Configuration:${NC}"
echo "  Environment: ${NODE_ENV:-development}"
echo "  Log Level:   ${LOG_LEVEL:-info}"
echo "  HTTP Port:   ${HOMEPLUS_HTTP_PORT:-18790}"
echo "  WS Port:     ${HOMEPLUS_WS_PORT:-18791}"
echo "  Gateway URL: ${OPENCLAW_GATEWAY_URL:-ws://127.0.0.1:18789}"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠${NC} node_modules not found. Running npm install..."
    npm install
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: npm install failed${NC}"
        exit 1
    fi
fi

# Check for required files
echo -e "${BLUE}[CHECK]${NC} Verifying required files..."

REQUIRED_FILES=(
    "src/server/index.js"
    "src/server/users.js"
    "src/server/openclaw-client.js"
    "src/server/session-manager.js"
    "src/shared/protocol.js"
    "src/client/index.html"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}✗${NC} Missing: $file"
        exit 1
    fi
done

echo -e "${GREEN}✓${NC} All required files present"
echo ""

# Start the server
echo -e "${GREEN}[START]${NC} Starting HomePlus server..."
echo ""

# Run the server
node src/server/index.js
