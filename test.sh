#!/usr/bin/env bash
set -euo pipefail

echo "→ Installing dependencies..."
npm install --no-audit --no-fund

if [[ ! -f .env ]]; then
  echo "→ Creating .env from .env.example"
  cp .env.example .env
  echo ""
  echo "Add your OpenRouter key to .env:"
  echo "  OPENROUTER_API_KEY=sk-or-..."
  echo "Then re-run: ./test.sh"
  echo ""
  echo "Running core tests only (no API key)..."
  export ARCHIVIST_SKIP_LIVE=1
fi

echo "→ Running exhaustive test suite..."
npm test
