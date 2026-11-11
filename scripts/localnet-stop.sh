#!/usr/bin/env bash
# Stop the local validator started by ./scripts/localnet.sh and remove its
# ledger (both the default ${TMPDIR}/taop-test-ledger and the legacy in-repo
# .anchor/test-ledger). Other validators are left alone.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
LEDGER="${TAOP_LEDGER_DIR:-${TMPDIR:-/tmp}/taop-test-ledger}"

stopped=0
if pgrep -f "solana-test-validator.*${LEDGER}" >/dev/null 2>&1; then
  pkill -f "solana-test-validator.*${LEDGER}"
  stopped=1
  sleep 2
fi

rm -rf "$LEDGER"
rm -rf "$ROOT/.anchor/test-ledger"
echo "validator stopped: $stopped · removed: $LEDGER and .anchor/test-ledger"
