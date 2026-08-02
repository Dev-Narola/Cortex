#!/usr/bin/env bash
#
# Regenerate the TypeScript API client from the running backend.
#
# Usage:
#   ./scripts/gen-api-client.sh                       # uses localhost:8000
#   NEXT_PUBLIC_API_URL=https://api.example.com ./scripts/gen-api-client.sh
#
# Fails loudly if the backend is not reachable so CI does not
# silently commit a half-generated client.

set -euo pipefail

API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8000}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# This script lives at <repo_root>/scripts/ and the frontend
# monorepo lives at <repo_root>/frontend/.
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[gen-api-client] backend: $API_URL"
echo "[gen-api-client] verifying /openapi.json is reachable ..."

HTTP_CODE=$(curl -s -o /tmp/cortex-openapi.json -w "%{http_code}" \
  -L "$API_URL/openapi.json" || echo "000")

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "[gen-api-client] failed: backend returned HTTP $HTTP_CODE at $API_URL/openapi.json" >&2
  echo "[gen-api-client] is the backend running? Try 'make backend' in another shell." >&2
  exit 1
fi

echo "[gen-api-client] generating TypeScript client ..."
cd "$ROOT_DIR/frontend"
pnpm --filter @cortex/api-client generate

echo "[gen-api-client] done. Generated client is at frontend/packages/api-client/src/types.ts"
