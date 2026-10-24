#!/usr/bin/env bash
set -euo pipefail

echo "→ Installing dependencies..."
npm install --no-audit --no-fund

if [[ ! -f .env ]]; then
  echo "→ Creating .env from .env.example"
  cp .env.example .env
  echo ""
  echo "Add a model API key to .env (OPENAI_API_KEY, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY)."
  echo "Then re-run: ./test.sh"
  echo ""
  echo "Running core tests only (no API key)..."
  export ARCHIVIST_SKIP_LIVE=1
fi

echo "→ Running exhaustive test suite..."
npm test
