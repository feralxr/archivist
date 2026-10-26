#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "==> install"
npm install --no-audit --no-fund
echo "==> typecheck"
npm run typecheck
echo "==> core tests"
npm run test:core
echo "==> doctor"
npx tsx src/cli/index.ts doctor || true
echo "==> prompt profiles"
npx tsx src/cli/index.ts prompt:list || true
echo "Done. Optional: npm test (live), npm run eval, npm publish"
