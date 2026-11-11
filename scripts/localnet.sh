#!/usr/bin/env bash
# Start a local validator, deploy the program, and leave the validator running.
# Usage: ./scripts/localnet.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.local/bin:$PATH"

LEDGER="${TAOP_LEDGER_DIR:-${TMPDIR:-/tmp}/taop-test-ledger}"
WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"
RPC_PORT="${TAOP_RPC_PORT:-8899}"
RPC="http://127.0.0.1:${RPC_PORT}"
# Default gossip/TPU ports (8000+) are commonly taken by other local services;
# move the validator's range and keep it configurable.
GOSSIP_PORT="${TAOP_GOSSIP_PORT:-18000}"
DYNAMIC_RANGE="${GOSSIP_PORT}-$((GOSSIP_PORT + 100))"
FAUCET_PORT="${TAOP_FAUCET_PORT:-19900}"
PROGRAM_ID="8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE"

"$ROOT/scripts/sync-keypair.sh" >/dev/null
KEYPAIR="$ROOT/target/deploy/taop_reputation-keypair.json"

if [[ ! -f "$WALLET" ]]; then
  mkdir -p "$(dirname "$WALLET")"
  solana-keygen new --no-bip39-passphrase -s -o "$WALLET" >/dev/null
fi

if pgrep -f "solana-test-validator" >/dev/null; then
  echo "validator already running"
else
  rm -rf "$LEDGER"
  mkdir -p "$LEDGER"
  # RUST_LOG=error keeps the validator's own log at 0 bytes; without it the
  # metrics datapoints grow the log by hundreds of MB.
  RUST_LOG=error nohup solana-test-validator \
    --ledger "$LEDGER" \
    --reset \
    --quiet \
    --clone-feature-set \
    --url https://api.devnet.solana.com \
    --rpc-port "$RPC_PORT" \
    --gossip-port "$GOSSIP_PORT" \
    --dynamic-port-range "$DYNAMIC_RANGE" \
    --faucet-port "$FAUCET_PORT" \
    >/dev/null 2>&1 &
  echo "waiting for validator..."
  ready=0
  for _ in $(seq 1 60); do
    if solana cluster-version -u "$RPC" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "$ready" != "1" ]]; then
    echo "error: validator did not become ready on $RPC; last log lines:" >&2
    tail -20 "$LEDGER/validator.log" >&2 2>/dev/null || true
    exit 1
  fi
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
  --program-id "$KEYPAIR" \
  "$ROOT/target/deploy/taop_reputation.so" >/dev/null

ACTUAL_ID="$(solana-keygen pubkey "$KEYPAIR")"
if [[ "$ACTUAL_ID" != "$PROGRAM_ID" ]]; then
  echo "error: deployed under $ACTUAL_ID but the repo expects $PROGRAM_ID" >&2
  exit 1
fi
if ! solana program show "$PROGRAM_ID" --url "$RPC" >/dev/null 2>&1; then
  echo "error: program account $PROGRAM_ID not found after deploy" >&2
  exit 1
fi
echo "program deployed: $PROGRAM_ID"
echo "rpc: $RPC"
