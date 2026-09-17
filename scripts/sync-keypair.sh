#!/usr/bin/env bash
# Copy the committed program-ID keypair into target/deploy/ where anchor build
# and solana program deploy expect it. Safe to run repeatedly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${TAOP_PROGRAM_KEYPAIR:-$ROOT/keys/taop_reputation-keypair.json}"
DST="$ROOT/target/deploy/taop_reputation-keypair.json"

if [[ ! -f "$SRC" ]]; then
  echo "error: program keypair not found at $SRC" >&2
  exit 1
fi

mkdir -p "$(dirname "$DST")"
if [[ -f "$DST" ]] && cmp -s "$SRC" "$DST"; then
  echo "program keypair already in place"
  exit 0
fi
cp "$SRC" "$DST"
echo "synced program keypair -> $DST"
