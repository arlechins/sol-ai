#!/usr/bin/env bash
# Fail if the committed IDL/type files drift from a fresh `anchor build` output.
# Run `anchor build` first.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail=0
compare() {
  local generated="$1"
  local committed="$2"
  if [[ ! -f "$generated" ]]; then
    echo "error: missing generated file: $generated (run ./scripts/check.sh which builds first)" >&2
    exit 1
  fi
  if ! cmp -s "$generated" "$committed"; then
    echo "drift detected: $committed" >&2
    diff -u "$committed" "$generated" | head -40 >&2 || true
    fail=1
  fi
}

compare "target/idl/taop_reputation.json" "programs/taop_reputation/idls/taop_reputation.json"
compare "target/idl/taop_reputation.json" "packages/solana/src/idl/taop_reputation.json"
compare "target/types/taop_reputation.ts" "packages/solana/src/idl/taop_reputation.ts"

if [[ "$fail" -ne 0 ]]; then
  echo "IDL sync check failed. Run ./scripts/sync-idl.sh and commit the result." >&2
  exit 1
fi

echo "IDL sync check: OK"
