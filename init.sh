#!/bin/bash
set -e

echo "🚀 Initializing Pace Development Environment..."

# Check for Bun
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install Bun: https://bun.sh/"
    exit 1
fi

echo "📦 Installing dependencies..."
bun install

echo "🏗️  Building project..."
bun run build

echo "✅ Environment ready!"
echo "Run 'bun test' to verify the installation."
