# @taopp/benchmark

An open gaming-resistance benchmark for **agent-reputation mechanisms**. It runs
three deterministic attack scenarios — Sybil farming, slow-burn-then-harvest,
and collusive mutual-rating rings — and reports a 0-100 resistance score per
class plus a composite. It ships with the `taop_reputation` mechanism (Solana)
and four baselines.

- Methodology and published results: [`docs/methodology.md`](../../docs/methodology.md)
- Adversarial pattern dataset (CC BY 4.0): [`dataset/`](dataset/)

## Quick start

```bash
pnpm --filter @taopp/benchmark start                 # run all mechanisms
pnpm --filter @taopp/benchmark start -- --seed 7     # different seed
pnpm --filter @taopp/benchmark start -- --mechanism taop_bonded_decay,peer_ratings
pnpm --filter @taopp/benchmark start -- --scenario sybil,collusion
pnpm --filter @taopp/benchmark sensitivity           # tables for the methodology doc
pnpm --filter @taopp/benchmark test                  # determinism, rubric, dataset
```

Outputs are written to `results/`: a full JSON run and a rendered `REPORT.md`.

## Built-in mechanisms

| Mechanism | Description |
|---|---|
| `taop_bonded_decay` | The on-chain `taop_reputation` rules: bonded challenges, admin resolution, inactivity decay |
| `naive_count` | `score = completions`, no disputes, no decay |
| `completions_minus_disputes` | Same as TAOP without decay |
| `peer_ratings` | ERC-8004-style distinct-rater feedback |
| `stake_gated` | Score capped by locked stake |

## Results (seed 42, v0.1.0)

| Mechanism | Sybil | Slow burn | Collusion | Composite |
|---|---:|---:|---:|---:|
| `taop_bonded_decay` | 3.7 | 0.1 | 100.0 | 34.6 |
| `naive_count` | 0.0 | 0.1 | 100.0 | 33.4 |
| `completions_minus_disputes` | 3.7 | 0.1 | 100.0 | 34.6 |
| `peer_ratings` | 100.0 | 100.0 | 0.0 | 66.7 |
| `stake_gated` | 53.8 | 10.0 | 100.0 | 54.6 |

The collusion scenario plants a mutual-rating ring inside a mixed graph of
honest raters and reports precision/recall/F1 for three structural detectors
(reciprocity, mutual degree, k-core) plus their ensemble. Mechanisms that
record no rating graph correctly report no detector results.

The published TAOP results include its weak spots: self-attestation is cheap to
farm, and the default capability bond does not cover a high-value harvest.
`docs/methodology.md` analyzes both and lists the v2 agenda the rubric implies.

## Adding a mechanism

Implement the `Mechanism` interface in `src/mechanisms.ts`:

```ts
interface Mechanism {
  name: string;
  description: string;
  newState(now?: number): MechanismState;
  ensureAgent(state: MechanismState, id: number): AgentState;
  attest(state: MechanismState, agent: number, now: number): void;
  rate(state: MechanismState, from: number, to: number, now: number): void;
  challenge(state: MechanismState, completionId: number, challenger: number, now: number): void;
  resolve(state: MechanismState, completionId: number, upheld: boolean): void;
  slashCapability(state: MechanismState, agent: number): void;
  score(state: MechanismState, agent: number, now: number): number;
  slashable(state: MechanismState, agent: number): number;
  attestCost(): number;
  capitalRequiredForScore?(targetScore: number): number;
  lockCapital?(state: MechanismState, agent: number, lamports: number): void;
}
```

Then add the class to `allMechanisms()`. Scenarios are independent of mechanism
internals, so new mechanisms need no scenario changes.

## Status

The harness simulates mechanism rules with on-chain cost constants and imports
the same decay function as the on-chain program. Everything is deterministic
given a seed. See the limitations section of the methodology before quoting
numbers.

## License

Benchmark code: MIT. Dataset: CC BY 4.0.
