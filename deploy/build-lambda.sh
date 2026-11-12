#!/usr/bin/env bash
# Builds deploy/lambda.zip: the Next.js standalone server plus static files, ready for AWS Lambda.
# Usage (from the repository root, e.g. in AWS CloudShell): bash deploy/build-lambda.sh
# Needs Node.js 20.9+, npm and zip.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deploy/lambda.zip"
PKG="$(mktemp -d)"
trap 'rm -rf "$PKG"' EXIT
cd "$ROOT"

[ -d node_modules ] || npm ci --no-audit --no-fund
NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1 npm run build

cp -a .next/standalone/. "$PKG/"
cp -a .next/static "$PKG/.next/static"
cp -a public "$PKG/public"
cp deploy/run.sh "$PKG/run.sh"
chmod 755 "$PKG/run.sh"
# Lambda's file system is read-only except /tmp, so the Next.js cache lives there.
rm -rf "$PKG/.next/cache"
ln -s /tmp/cache "$PKG/.next/cache"
# The app does not use image optimisation; dropping sharp keeps the package small.
rm -rf "$PKG/node_modules/sharp" "$PKG/node_modules/@img"
# Never ship local settings or keys.
find "$PKG" -name '.env*' -type f -delete

rm -f "$OUT"
(cd "$PKG" && zip -qry "$OUT" .)
echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
