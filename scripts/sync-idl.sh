#!/usr/bin/env bash
# Sync the generated IDL and TypeScript types into the workspaces that need them:
#   - idls/                          -> `declare_program!` in the Rust test suite
#   - packages/solana/src/idl/       -> @taopp/solana (published client)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IDL="$ROOT/target/idl/taop_reputation.json"
TYPES="$ROOT/target/types/taop_reputation.ts"

if [[ ! -f "$IDL" || ! -f "$TYPES" ]]; then
  echo "error: run 'anchor build' first (missing $IDL or $TYPES)" >&2
  exit 1
fi

RUST_DIR="$ROOT/idls"
SDK_DIR="$ROOT/packages/solana/src/idl"

mkdir -p "$RUST_DIR" "$SDK_DIR"
cp "$IDL" "$RUST_DIR/taop_reputation.json"
cp "$IDL" "$SDK_DIR/taop_reputation.json"
cp "$TYPES" "$SDK_DIR/taop_reputation.ts"

echo "synced IDL -> $RUST_DIR and $SDK_DIR"
