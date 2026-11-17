#!/usr/bin/env bash
# Build and deploy to Cloudflare WITHOUT local secrets in the bundle.
# OpenNext embeds .env files into the worker; local secrets live in .env.development.local,
# so that file is moved aside for the deploy build and restored afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."
hidden=""
if [[ -f .env.development.local ]]; then mv .env.development.local .env.development.local.deploy-hidden; hidden=1; fi
restore() { [[ -n "$hidden" ]] && mv .env.development.local.deploy-hidden .env.development.local; }
trap restore EXIT
CF_BUILD=1 npx opennextjs-cloudflare build
node -e '
  const s = require("fs").readFileSync(".open-next/cloudflare/next-env.mjs", "utf8");
  if (/ADMIN_PASSWORD|SESSION_SECRET|CRON_SECRET|TOKEN_ENCRYPTION_KEY|GOOGLE_CLIENT_SECRET/.test(s)) {
    console.error("Refusing to deploy: local secrets found in the bundle"); process.exit(1);
  }
  console.log("Bundle check: no local secrets ✓");'
npx opennextjs-cloudflare deploy
