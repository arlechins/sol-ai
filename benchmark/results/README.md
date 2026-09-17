# Benchmark results

- `baseline-seed42.json` — the committed baseline used in `docs/methodology.md`
  and the root README. Deterministic: reproduce with
  `pnpm --filter @taopp/benchmark start -- --seed 42`.
- `REPORT.md` — rendered tables from the latest run.
- `run-<timestamp>.json` — raw output of every run, including per-scenario
  metrics and configuration.

The baseline is a snapshot, not a leaderboard: scores move when scenario
parameters (challenge probability, harvest value, ring size) or cost constants
change. Update the docs whenever the baseline is regenerated.
