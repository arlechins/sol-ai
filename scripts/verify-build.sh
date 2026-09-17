#!/usr/bin/env bash
# Reproducible-build check: build the program inside the pinned Anchor Docker
# image and compare the resulting executable hash with the program deployed on
# a cluster.
#
# Usage: ./scripts/verify-build.sh [cluster] [program-id]
#
# Requires: Docker, Anchor 1.1.2, Solana CLI, solana-verify on PATH
# (https://github.com/Ellipsis-Labs/solana-verifiable-build).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CLUSTER="${1:-devnet}"
PROGRAM_ID="${2:-8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE}"

case "$CLUSTER" in
  localnet | localhost) URL="http://127.0.0.1:8899" ;;
  devnet) URL="https://api.devnet.solana.com" ;;
  testnet) URL="https://api.testnet.solana.com" ;;
  mainnet | mainnet-beta) URL="https://api.mainnet-beta.solana.com" ;;
  *)
    echo "unknown cluster: $CLUSTER" >&2
    exit 1
    ;;
esac

if ! command -v solana-verify >/dev/null 2>&1; then
  echo "error: solana-verify not found on PATH." >&2
  echo "Install a release from https://github.com/Ellipsis-Labs/solana-verifiable-build/releases" >&2
  exit 1
fi

"$ROOT/scripts/sync-keypair.sh" >/dev/null

# The pinned Anchor image is amd64-only; on Apple Silicon run it under
# emulation so the rebuild can proceed.
if [[ "$(uname -m)" == "arm64" && "$(uname -s)" == "Darwin" ]]; then
  export DOCKER_DEFAULT_PLATFORM="${DOCKER_DEFAULT_PLATFORM:-linux/amd64}"
fi

echo "Building verifiably (image pinned by Anchor.toml anchor_version)..."
anchor build --verifiable

# `anchor build --verifiable` writes the reproducible artifact to
# target/verifiable/, separate from the local platform-tools build.
ARTIFACT="$ROOT/target/verifiable/taop_reputation.so"
if [[ ! -f "$ARTIFACT" ]]; then
  echo "error: verifiable artifact not found at $ARTIFACT" >&2
  exit 1
fi

LOCAL_HASH="$(solana-verify get-executable-hash "$ARTIFACT")"
CHAIN_HASH="$(solana-verify get-program-hash -u "$URL" "$PROGRAM_ID")"

echo
echo "local executable hash : $LOCAL_HASH"
echo "on-chain program hash : $CHAIN_HASH"
echo

if [[ "$LOCAL_HASH" != "$CHAIN_HASH" ]]; then
  echo "MISMATCH: the deployed $CLUSTER program does not match this source tree." >&2
  exit 1
fi

echo "VERIFIED: $CLUSTER program $PROGRAM_ID is the reproducible build of this commit."
