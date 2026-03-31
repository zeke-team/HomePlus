#!/bin/bash
#
# HomePlus Installation Script
# 
# This script installs dependencies and sets up the HomePlus application.
# Run this script before starting the server for the first time.
#
# Usage: ./scripts/install.sh
#
# @author HomePlus Team
# @license MIT
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Change to project directory
cd "$PROJECT_DIR"

echo "========================================"
echo "  HomePlus Installation Script"
echo "========================================"
echo ""

# Check Node.js version
echo -e "${BLUE}[1/5]${NC} Checking Node.js version..."

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js 18 or higher from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Error: Node.js 18 or higher is required${NC}"
    echo "Current version: $(node -v)"
    echo "Please update Node.js from https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js version: $(node -v)"

# Check npm version
echo -e "${BLUE}[2/5]${NC} Checking npm version..."

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} npm version: $(npm -v)"

# Create necessary directories
echo -e "${BLUE}[3/5]${NC} Creating directories..."

mkdir -p data
echo -e "${GREEN}✓${NC} Created data directory"

# Copy .env.example to .env if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}→${NC} Creating .env from .env.example..."
    cp .env.example .env
    echo -e "${GREEN}✓${NC} Created .env file"
    echo -e "${YELLOW}⚠${NC} Please review and update .env with your settings"
else
    echo -e "${GREEN}✓${NC} .env file already exists"
fi

# Install npm dependencies
echo -e "${BLUE}[4/5]${NC} Installing npm dependencies..."

npm install

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Dependencies installed successfully"
else
    echo -e "${RED}Error: Failed to install dependencies${NC}"
    exit 1
fi

# Verify installation
echo -e "${BLUE}[5/5]${NC} Verifying installation..."

REQUIRED_FILES=(
    "src/server/index.js"
    "src/server/users.js"
    "src/server/openclaw-client.js"
    "src/server/session-manager.js"
    "src/shared/protocol.js"
    "src/client/index.html"
    "package.json"
)

ALL_FILES_EXIST=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}✗${NC} Missing file: $file"
        ALL_FILES_EXIST=false
    fi
done

if [ "$ALL_FILES_EXIST" = true ]; then
    echo -e "${GREEN}✓${NC} All required files present"
else
    echo -e "${RED}Error: Some required files are missing${NC}"
    exit 1
fi

echo ""
echo "========================================"
echo -e "${GREEN}  Installation Complete!${NC}"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Review and update .env configuration"
echo "  2. Start the server: ./scripts/start.sh"
echo ""
echo "For more information, see README.md"
echo ""
