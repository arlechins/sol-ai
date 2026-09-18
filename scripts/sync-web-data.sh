#!/usr/bin/env bash
# Sync published evidence into apps/web so the site cannot drift from the
# repository's committed benchmark results and devnet deployment metadata.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="$root/apps/web/src/data"

mkdir -p "$dest"

deployment="$root/deployments.solana.json"
if [[ ! -f "$deployment" ]]; then
  deployment="$root/deployments.solana.example.json"
  echo "note: deployments.solana.json missing; falling back to example"
fi

cp "$deployment" "$dest/deployment.json"
cp "$root/benchmark/results/baseline-seed42.json" "$dest/benchmark.json"
cp "$root/benchmark/dataset/patterns.json" "$dest/dataset.json"

program_id="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['programId'])" "$dest/deployment.json")"
patterns="$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))['patterns']))" "$dest/dataset.json")"
echo "synced: deployment ($program_id), benchmark baseline, dataset ($patterns patterns)"
