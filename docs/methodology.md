# Benchmark methodology

This document specifies how the TAOP gaming-resistance benchmark works, what it
measures, and where it is wrong. It is published so that results can be
reproduced and disputed.

## 1. Purpose

The benchmark takes an agent-reputation mechanism and outputs a resistance score
(0-100, higher is better) for each of three attack classes:

1. **Sybil farming** — many cheap identities manufacture reputation without
   performing valuable work.
2. **Slow burn then harvest** — one identity accrues trust slowly, then extracts
   value in a single action.
3. **Collusive ring** — a closed group mutually inflates its members' scores.

It is a *mechanism* benchmark, not a product benchmark: it evaluates the rules,
not the quality of an implementation.

## 2. Mechanism model

Each mechanism is modeled as a ledger with three cost primitives:

| Primitive | Value | Notes |
|---|---|---|
| Transaction fee | 5,000 lamports per signature | Base fee; priority fees excluded |
| Rent-exempt state | `(128 + bytes) * 6,333` lamports | SIMD-0437 step 1 (mainnet, September 2026); account sizes from `docs/account-layout.md` |
| Bonds | Recoverable unless slashed | Challenge bonds (0.005 SOL) and capability bonds (0.005 SOL by default) |

The built-in mechanisms are:

| Mechanism | Score rule | Bonds |
|---|---|---|
| `taop_bonded_decay` | `max(0, completions - disputes)` halved per 30 days of inactivity | Challenge bond; bonded capability |
| `naive_count` | `completions` | none |
| `completions_minus_disputes` | `max(0, completions - disputes)`, no decay | none |
| `peer_ratings` | distinct raters minus disputes (ERC-8004-style) | none |
| `stake_gated` | `min(completions - disputes, floor(stake / 0.01 SOL))` | stake fully slashable |

`taop_bonded_decay` imports `computeScore` from `@taopp/solana`, the same decay
function the on-chain program uses, and the benchmark test suite asserts parity
with on-chain behavior verified by the Rust/LiteSVM suite.

## 3. Class scores

### 3.1 Sybil farming

Simulation: `S` attacker identities each submit `K` self-attested completions.
Every completion is challenged with probability `p`; an upheld challenge
(probability `q = 0.9`) subtracts one point. An honest agent performs the same
`K` completions without challenges.

Metrics: attacker capital per effective point (`(spent + locked) / score`) and
honest capital per point.

```
efficiencyComponent = 100 * (1 - min(1, honestCostPerPoint / attackerCostPerPoint))
capitalComponent    = 100 * min(1, lockedCapitalPerPoint / 0.01 SOL)
sybilResistance     = 0.5 * efficiencyComponent + 0.5 * capitalComponent
```

Rationale: a mechanism resists Sybil farming only if fake identities pay more
per point than honest ones (efficiency) or must lock capital at risk per point
(capital intensity). If the attacker manufactures no score at all, the class
score is 100.

### 3.2 Slow burn then harvest

Simulation: one attacker attests at a fixed rate until it reaches the target
score, then performs a single high-value action worth `V`. The fraud is
discovered afterwards and every completion is disputed.

```
slashCoverage  = min(slashableCapital, lockedCapital) / V
slowBurnResistance = 100 * min(1, slashCoverage)
```

Rationale: the only defense at harvest time is capital that can be seized. A
mechanism that cannot seize at least the value being extracted loses that value
in expectation.

### 3.3 Collusive ring

Simulation: `M` accounts rate each other once per ordered pair. A mechanism that
counts peer feedback lets the ring manufacture `M-1` distinct raters per member
without any external counterparty. An honest baseline pays one transaction fee
per genuine rating.

```
collusionResistance = 100 * (1 - min(1, ringCostPerPoint / honestCostPerPoint))
```

The scenario also builds a **mixed graph** — the ring plus honest agents that
rate other honest agents organically — and runs three deliberately simple
detectors, reporting precision/recall/F1 for each and for their union:

| Detector | Signal |
|---|---|
| `reciprocity` | outgoing ratings mostly reciprocated (configurable threshold) |
| `mutual_degree` | at least `max(3, (ring-1)/2)` mutual-rating partners |
| `k_core` | core number >= `coreThreshold` (a mutual ring is a dense clique) |
| `ensemble` | union of the three |

For mechanisms that record no rating graph (self-attestation or naive counting)
the detector list is empty and detection metrics are `null` — there is nothing
to inspect. Score-level immunity and detection-evidence quality are separate
properties.

The composite score is the equal-weight mean of the three class scores.
Weights are a choice, not a result; they are stated here so they can be
challenged.

## 4. Reproduction

```bash
pnpm --filter @taopp/benchmark start            # print table, write results/
pnpm --filter @taopp/benchmark start -- --seed 7
pnpm --filter @taopp/benchmark start -- --scenario sybil --mechanism taop_bonded_decay
pnpm --filter @taopp/benchmark sensitivity      # tables used below
pnpm --filter @taopp/benchmark test             # determinism + rubric + dataset tests
```

All runs are deterministic given `--seed`. Outputs: `results/run-<timestamp>.json`
(full metrics) and `results/REPORT.md` (rendered tables).

## 5. Published results (v0.1.0, seed 42)

| Mechanism | Sybil | Slow burn | Collusion | Composite |
|---|---:|---:|---:|---:|
| `taop_bonded_decay` | 3.7 | 0.1 | 100.0 | 34.6 |
| `naive_count` | 0.0 | 0.1 | 100.0 | 33.4 |
| `completions_minus_disputes` | 3.7 | 0.1 | 100.0 | 34.6 |
| `peer_ratings` | 100.0 | 100.0 | 0.0 | 66.7 |
| `stake_gated` | 53.8 | 10.0 | 100.0 | 54.6 |

### Where TAOP scores poorly (on purpose)

- **Sybil farming (3.7/100).** Self-attested completions are indistinguishable
  from honest work; the only tax is the probability of being challenged and
  slashed. At the default 10% challenge rate the attacker still manufactures
  score at roughly the honest cost per point.
- **Slow burn (0.1/100).** The default capability bond (0.005 SOL) covers 0.1% of
  a 5 SOL harvest. Any reputation-gated contract should size its bond to the
  value it disburses, not to a fixed protocol constant.
- **Collusion (100/100).** v0.1 ignores peer ratings entirely, so a ring cannot
  inflate scores. This is immunity by omission: the mechanism also has no
  interaction grounding, which is exactly why its Sybil score is low.

### Sensitivity

Sybil resistance vs watcher challenge probability (`taop_bonded_decay`):

| Challenge probability | Disputes (of 200) | Resistance |
|---|---:|---:|
| 0.00 | 0 | 0.0 |
| 0.01 | 2 | 0.5 |
| 0.05 | 9 | 2.2 |
| 0.10 | 15 | 3.7 |
| 0.30 | 56 | 14.0 |
| 0.50 | 88 | 22.0 |

Slow-burn coverage vs capability bond (harvest = 5 SOL):

| Capability bond (SOL) | Slash coverage | Resistance |
|---|---:|---:|
| 0.005 | 0.10% | 0.1 |
| 0.05 | 1.00% | 1.0 |
| 0.5 | 10.00% | 10.0 |
| 2.5 | 50.00% | 50.0 |
| 5 | 100.00% | 100.0 |

Reproduce with `pnpm --filter @taopp/benchmark sensitivity`.

## 6. Limitations

- **Simulation, not execution.** Costs and score rules mirror the on-chain
  program, but the benchmark does not execute transactions. A future version can
  load `target/deploy/taop_reputation.so` into an in-process SVM for
  instruction-level runs; the Rust/LiteSVM suite already covers on-chain
  behavior.
- **Locked capital is counted at face value.** It is recoverable unless slashed,
  so the capital component overstates deterrent effects for mechanisms that can
  return stake. Treat it as capital-at-risk, not spend.
- **Exogenous harvest value.** `V` is a parameter; results are conditional on
  the mechanism being used to gate value it does not control.
- **Challenge and upheld probabilities are assumptions.** Real watcher behavior
  depends on incentives (bond refunds, rewards) not modeled here.
- **Detector evaluation is simple by design.** Three structural detectors
  (reciprocity, mutual degree, k-core) are baselines; they do not represent
  state-of-the-art graph fraud detection, do not model adaptive rings that
  rotate membership, and their numbers should not be quoted as an upper bound.
  The ensemble scores perfectly on the planted ring because the planted ring is
  an ideal clique; real rings are harder.
- **No priority fees, MEV, or latency.** Fee assumptions are conservative for
  cost comparisons but understate congested-mainnet attack costs.
- **Single-identity transitions are not modeled.** Reputation laundering across
  identities and capability transfers are dataset patterns, not yet scenarios.

## 7. What would raise the scores

For `taop_reputation`, the benchmark's own results point at the v2 agenda:

1. **Interaction grounding.** Attestations countersigned by an independent
   counterparty with its own bonded identity (and per-counterparty score caps)
   attack the Sybil root cause.
2. **Counterparty-diversity weighting.** Score contribution saturates after a
   small number of attestations from related accounts.
3. **Optimistic resolution with bonded watchers.** Replace the centralized
   resolver with a bonded dispute game so challenge pressure scales with
   attacker volume.
4. **Value-scaled bonds.** Make the capability bond a function of contract value
   rather than a fixed constant.
5. **Optional identity attestations.** Proof-of-personhood or verified-org
   attestations as score multipliers, not gates.

These are hypotheses this benchmark can test once implemented; the rubric
already exposes their intended effect.
