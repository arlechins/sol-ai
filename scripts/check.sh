#!/usr/bin/env bash
# Full pre-flight: format, lint, build, IDL sync, all test suites, benchmark smoke.
# This is the same set of checks CI runs (minus the CI-only local-validator job).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.local/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$HOME/Library/pnpm/bin:$HOME/Library/pnpm:$PATH"

step() { printf '\n=== %s ===\n' "$1"; }

step "Rust formatting"
cargo fmt --all -- --check

# The test suite include_bytes!()s target/deploy/taop_reputation.so and the IDL,
# so build before linting/testing on a clean checkout.
step "Anchor build"
anchor build

step "IDL sync check"
"$ROOT/scripts/check-idl-sync.sh"

step "Rust clippy"
cargo clippy --workspace --all-targets

step "Rust tests"
cargo test --workspace

step "Install JS dependencies"
pnpm install --frozen-lockfile

step "Typechecks"
pnpm -r --if-present typecheck

step "Package builds"
pnpm --filter @taopp/solana build
pnpm --filter @taopp/mcp-server build

step "Package tests"
if solana cluster-version -u http://127.0.0.1:8899 >/dev/null 2>&1; then
  echo "local validator detected: integration tests will run"
else
  echo "note: no local validator on :8899; SDK integration tests will skip (run ./scripts/localnet.sh to include them)"
fi
pnpm -r --if-present test

step "Benchmark smoke run (seed 7)"
pnpm --filter @taopp/benchmark start -- --seed 7 --json-only --out "$ROOT/benchmark/results/tmp"

step "Baseline reproducibility check (seed 42)"
BASELINE="$ROOT/benchmark/results/baseline-seed42.json"
if [[ -f "$BASELINE" ]]; then
  pnpm --filter @taopp/benchmark start -- --seed 42 --json-only --out "$ROOT/benchmark/results/tmp" >/dev/null
  python3 - "$BASELINE" "$ROOT/benchmark/results/tmp" <<'EOF'
import json, pathlib, sys
baseline = json.load(open(sys.argv[1]))
runs = sorted(pathlib.Path(sys.argv[2]).glob("run-*.json"), key=lambda p: p.stat().st_mtime)
latest = json.load(open(runs[-1]))
base_scores = {r["mechanism"]: r["scores"] for r in baseline["reports"]}
new_scores = {r["mechanism"]: r["scores"] for r in latest["reports"]}
if base_scores != new_scores:
    print("baseline mismatch:", file=sys.stderr)
    for mechanism, scores in base_scores.items():
        if new_scores.get(mechanism) != scores:
            print(f"  {mechanism}: {scores} -> {new_scores.get(mechanism)}", file=sys.stderr)
    sys.exit(1)
print("baseline reproduces exactly")
EOF
else
  echo "no committed baseline; skipping"
fi

step "Example trust loop (local validator)"
if solana cluster-version -u http://127.0.0.1:8899 >/dev/null 2>&1; then
  TAOP_E2E_CLUSTER=localnet \
    TAOP_E2E_KEYPAIR="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}" \
    node "$ROOT/scripts/devnet-e2e.mjs"
else
  echo "skipping: no local validator on :8899 (run ./scripts/localnet.sh)"
fi

printf '\nAll checks passed.\n'
