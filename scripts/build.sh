#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
npm test
npm run audit:nps
npm run audit:dev
npm run build
