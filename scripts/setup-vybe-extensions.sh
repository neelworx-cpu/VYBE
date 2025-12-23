#!/bin/bash
# Cross-platform setup script for VYBE extensions
# This script ensures all VYBE extensions are properly set up

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Setting up VYBE extensions..."

# Check Node version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Error: Node.js version must be >= 20.11.0"
    echo "Current version: $(node --version)"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Verify VYBE contribution files exist
echo ""
echo "📦 Verifying VYBE extension files..."

VYBE_CHAT_CONTRIB="$ROOT_DIR/src/vs/workbench/contrib/vybeChat/browser/contribution/vybeChat.contribution.ts"
VYBE_SETTINGS_CONTRIB="$ROOT_DIR/src/vs/workbench/contrib/vybeSettings/browser/vybeSettings.contribution.ts"
VYBE_INDEXING_CONTRIB="$ROOT_DIR/src/vs/workbench/contrib/indexing/browser/indexing.contribution.ts"

if [ ! -f "$VYBE_CHAT_CONTRIB" ]; then
    echo "❌ VYBE Chat contribution file not found: $VYBE_CHAT_CONTRIB"
    exit 1
fi
echo "✅ VYBE Chat contribution found"

if [ ! -f "$VYBE_SETTINGS_CONTRIB" ]; then
    echo "❌ VYBE Settings contribution file not found: $VYBE_SETTINGS_CONTRIB"
    exit 1
fi
echo "✅ VYBE Settings contribution found"

if [ ! -f "$VYBE_INDEXING_CONTRIB" ]; then
    echo "❌ VYBE Indexing contribution file not found: $VYBE_INDEXING_CONTRIB"
    exit 1
fi
echo "✅ VYBE Indexing contribution found"

# Check main import
MAIN_FILE="$ROOT_DIR/src/vs/workbench/workbench.common.main.ts"
if grep -q "vybeChat.*contribution" "$MAIN_FILE" && \
   grep -q "vybeSettings.*contribution" "$MAIN_FILE" && \
   grep -q "indexing.*contribution" "$MAIN_FILE"; then
    echo "✅ All VYBE extensions imported in workbench.common.main.ts"
else
    echo "⚠️  Warning: Some VYBE extensions may not be imported in workbench.common.main.ts"
fi

echo ""
echo "✅ VYBE extensions setup complete!"
echo ""
echo "Next steps:"
echo "  1. Run: npm install"
echo "  2. Run: npm run compile"
echo "  3. Launch: ./scripts/code.sh (Mac/Linux) or .\\scripts\\code.bat (Windows)"

