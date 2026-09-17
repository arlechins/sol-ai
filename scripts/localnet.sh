#!/usr/bin/env bash
# Start a local validator, deploy the program, and leave the validator running.
# Usage: ./scripts/localnet.sh [--reset]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.local/bin:$PATH"

LEDGER="$ROOT/.anchor/test-ledger"
WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"
RPC="http://127.0.0.1:8899"

if [[ ! -f "$WALLET" ]]; then
  mkdir -p "$(dirname "$WALLET")"
  solana-keygen new --no-bip39-passphrase -s -o "$WALLET" >/dev/null
fi

if pgrep -f "solana-test-validator" >/dev/null; then
  echo "validator already running"
else
  rm -rf "$LEDGER"
  mkdir -p "$LEDGER"
  nohup solana-test-validator \
    --ledger "$LEDGER" \
    --reset \
    --quiet \
    --clone-feature-set \
    --url https://api.devnet.solana.com \
    >"$LEDGER/validator.log" 2>&1 &
  echo "waiting for validator..."
  for _ in $(seq 1 30); do
    if solana cluster-version -u "$RPC" >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi

solana config set -u "$RPC" >/dev/null 2>&1 || true
solana airdrop 500 -u "$RPC" "$(solana-keygen pubkey "$WALLET")" >/dev/null 2>&1 || true

if [[ ! -f "$ROOT/target/deploy/taop_reputation.so" ]]; then
  echo "error: run 'anchor build' first" >&2
  exit 1
fi
solana program deploy \
  --url "$RPC" \
  --keypair "$WALLET" \
  --program-id "$ROOT/target/deploy/taop_reputation-keypair.json" \
  "$ROOT/target/deploy/taop_reputation.so" >/dev/null
echo "program deployed: $(solana-keygen pubkey "$ROOT/target/deploy/taop_reputation-keypair.json")"
echo "rpc: $RPC"
