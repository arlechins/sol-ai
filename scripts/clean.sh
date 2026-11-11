#!/usr/bin/env bash
# Project-only disk hygiene. Removes build artifacts and localnet data but never
# node_modules or global caches (pnpm/npm/cargo stores are out of scope).
#
#   ./scripts/clean.sh                 # dists, coverage, benchmark tmp, wrangler
#   ./scripts/clean.sh --build         # + target/debug, target/release, SBF cache, fuzz
#   ./scripts/clean.sh --localnet      # stop validator + remove ledgers
#   ./scripts/clean.sh --all           # --build + --localnet
#
# The verifiable artifact (target/verifiable), target/deploy, target/idl, and
# target/types are always kept.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE="${1:---safe}"

report() {
  printf '  %-24s %s\n' "$1" "$(du -sh "$ROOT" 2>/dev/null | awk '{print $1}')"
}

size_of() {
  if [[ -e "$1" ]]; then du -sh "$1" 2>/dev/null | awk '{print $1}'; else echo "-"; fi
}

echo "Before: repo $(size_of "$ROOT") · target $(size_of target) · ledger $(size_of "${TMPDIR:-/tmp}/taop-test-ledger") · legacy ledger $(size_of .anchor/test-ledger) · fuzz $(size_of fuzz/target)"

clean_safe() {
  rm -rf apps/web/dist apps/web/coverage apps/web/.wrangler
  rm -rf packages/*/dist packages/*/coverage coverage
  rm -rf benchmark/results/tmp
  echo "cleaned: dists, coverage, benchmark tmp, wrangler"
}

clean_build() {
  # Rebuildable host artifacts; keep the program .so/IDL and the verifiable build.
  rm -rf target/debug target/release target/sbpf-solana-solana target/tmp
  rm -rf fuzz/target
  echo "cleaned: target/debug, target/release, SBF cache, fuzz/target"
}

clean_localnet() {
  "$ROOT/scripts/localnet-stop.sh"
}

case "$MODE" in
  --safe) clean_safe ;;
  --build) clean_safe; clean_build ;;
  --localnet) clean_localnet ;;
  --all) clean_safe; clean_build; clean_localnet ;;
  *)
    echo "usage: $0 [--safe|--build|--localnet|--all]" >&2
    exit 2
    ;;
esac

echo "After:  repo $(size_of "$ROOT") · target $(size_of target) · ledger $(size_of "${TMPDIR:-/tmp}/taop-test-ledger") · legacy ledger $(size_of .anchor/test-ledger) · fuzz $(size_of fuzz/target)"
