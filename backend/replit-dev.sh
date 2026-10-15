#!/usr/bin/env bash
set -euo pipefail

export NODE_ENV=development
export PORT="${PORT:-8080}"
export JWT_SECRET="${JWT_SECRET:-${SESSION_SECRET:-}}"

if [[ -z "$JWT_SECRET" ]]; then
  echo "Set JWT_SECRET or SESSION_SECRET in Replit Secrets to start the API." >&2
  exit 1
fi

# Keep the Replit test environment isolated from live payment, SMS, and KYC providers.
export PAYMENT_PROVIDER_MODE=mock
export SMS_PROVIDER_MODE=mock
export KYC_PROVIDER_MODE=mock
export DEPOSITS_ENABLED=false

echo "Starting NovaPlay development API (mock providers; deposits disabled)."
exec npm run dev
