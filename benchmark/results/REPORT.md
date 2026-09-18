# TAOP gaming-resistance benchmark — results

Generated: 2026-09-18T06:55:14.484Z
Seed: 42 · Node: v24.14.1

## Composite resistance scores (0-100, higher is better)

| Mechanism | Sybil farming | Slow-burn harvest | Collusive ring | Composite |
|---|---:|---:|---:|---:|
| `taop_bonded_decay` | 3.7 | 0.1 | 100.0 | **34.6** |
| `naive_count` | 0.0 | 0.1 | 100.0 | **33.4** |
| `completions_minus_disputes` | 3.7 | 0.1 | 100.0 | **34.6** |
| `peer_ratings` | 100.0 | 100.0 | 0.0 | **66.7** |
| `stake_gated` | 53.8 | 10.0 | 100.0 | **54.6** |

## Configuration

- Sybil: 20 identities × 10 attestations, challenge probability 0.1, upheld probability 0.9
- Slow burn: target score 50, harvest 5 SOL, 2 attestations/day
- Collusion: ring of 10, 1 ratings per pair, 30 honest agents x 2 ratings, reciprocity threshold 0.8, k-core threshold 4
- Economics: 0.005 SOL challenge bond, 0.005 SOL capability bond, 30-day decay

## taop_bonded_decay

taop_reputation v0.1: self-attested completions, native-SOL challenge bonds, admin-resolved disputes, score = max(0, completions - disputes) with inactivity decay.

Scores — Sybil farming: **3.7**, slow-burn harvest: **0.1**, collusive ring: **100.0**

### Sybil farming

- Attacker: 20 identities × 10 attestations = 200 completions
- Effective score: 185 · spend: 0.587055820 SOL · locked: 0.000000000 SOL · cost per point: 0.003173275 SOL
- Locked capital per point: 0.000000000 SOL · honest cost per point: 0.002935279 SOL · efficiency ratio: 0.93x
- Challenges: 16 · upheld: 15
- Attacker commits 0.003173275 SOL per effective reputation point (0.000000000 SOL of it locked capital) versus 0.002935279 SOL for honest work (efficiency 0.93x). 15/16 challenges were upheld. Self-attested work is indistinguishable from honest work at this challenge rate.

### Slow burn then harvest

- Target score: 50 · harvest value: 5.000000000 SOL
- Reachable: true in 25 days · spent: 0.136712151 SOL
- Slashable capital: 0.005000000 SOL · coverage: 0.1% · score after slash: 0
- Reached score 50 in 25 days for 0.136712151 SOL. Bonded capital (0.005000000 SOL) covers 0.1% of the 5.000000000 SOL harvest. Underbonded capabilities are the attack surface; raise the bond or gate the contract on more than score.

### Collusive ring

- Ring of 10 × 1 ratings per pair
- Manufactured score per member: 0 · ring spend: 0.000450000 SOL · cost per point: 0.000450000 SOL
- Detector ensemble precision/recall: n/a (mechanism records no rating graph)
- Peer ratings do not contribute to the score, so the ring manufactures nothing and there is no recorded rating graph to inspect. This is immunity by omission, not detection.

Weak spots (published deliberately):

- Sybil farming is cheap (self-attestation has no verifier)
- Bonded capital does not cover a high-value harvest

## naive_count

Baseline: score = completions, no bonds, no disputes, no decay.

Scores — Sybil farming: **0.0**, slow-burn harvest: **0.1**, collusive ring: **100.0**

### Sybil farming

- Attacker: 20 identities × 10 attestations = 200 completions
- Effective score: 200 · spend: 0.587055820 SOL · locked: 0.000000000 SOL · cost per point: 0.002935279 SOL
- Locked capital per point: 0.000000000 SOL · honest cost per point: 0.002935279 SOL · efficiency ratio: 1.00x
- Challenges: 16 · upheld: 15
- Attacker commits 0.002935279 SOL per effective reputation point (0.000000000 SOL of it locked capital) versus 0.002935279 SOL for honest work (efficiency 1.00x). 15/16 challenges were upheld. Self-attested work is indistinguishable from honest work at this challenge rate.

### Slow burn then harvest

- Target score: 50 · harvest value: 5.000000000 SOL
- Reachable: true in 25 days · spent: 0.136712151 SOL
- Slashable capital: 0.005000000 SOL · coverage: 0.1% · score after slash: 50
- Reached score 50 in 25 days for 0.136712151 SOL. Bonded capital (0.005000000 SOL) covers 0.1% of the 5.000000000 SOL harvest. Underbonded capabilities are the attack surface; raise the bond or gate the contract on more than score.

### Collusive ring

- Ring of 10 × 1 ratings per pair
- Manufactured score per member: 0 · ring spend: 0.000450000 SOL · cost per point: 0.000450000 SOL
- Detector ensemble precision/recall: n/a (mechanism records no rating graph)
- Peer ratings do not contribute to the score, so the ring manufactures nothing and there is no recorded rating graph to inspect. This is immunity by omission, not detection.

Weak spots (published deliberately):

- Sybil farming is cheap (self-attestation has no verifier)
- Bonded capital does not cover a high-value harvest

## completions_minus_disputes

Baseline: score = max(0, completions - disputes), no inactivity decay.

Scores — Sybil farming: **3.7**, slow-burn harvest: **0.1**, collusive ring: **100.0**

### Sybil farming

- Attacker: 20 identities × 10 attestations = 200 completions
- Effective score: 185 · spend: 0.587055820 SOL · locked: 0.000000000 SOL · cost per point: 0.003173275 SOL
- Locked capital per point: 0.000000000 SOL · honest cost per point: 0.002935279 SOL · efficiency ratio: 0.93x
- Challenges: 16 · upheld: 15
- Attacker commits 0.003173275 SOL per effective reputation point (0.000000000 SOL of it locked capital) versus 0.002935279 SOL for honest work (efficiency 0.93x). 15/16 challenges were upheld. Self-attested work is indistinguishable from honest work at this challenge rate.

### Slow burn then harvest

- Target score: 50 · harvest value: 5.000000000 SOL
- Reachable: true in 25 days · spent: 0.136712151 SOL
- Slashable capital: 0.005000000 SOL · coverage: 0.1% · score after slash: 0
- Reached score 50 in 25 days for 0.136712151 SOL. Bonded capital (0.005000000 SOL) covers 0.1% of the 5.000000000 SOL harvest. Underbonded capabilities are the attack surface; raise the bond or gate the contract on more than score.

### Collusive ring

- Ring of 10 × 1 ratings per pair
- Manufactured score per member: 0 · ring spend: 0.000450000 SOL · cost per point: 0.000450000 SOL
- Detector ensemble precision/recall: n/a (mechanism records no rating graph)
- Peer ratings do not contribute to the score, so the ring manufactures nothing and there is no recorded rating graph to inspect. This is immunity by omission, not detection.

Weak spots (published deliberately):

- Sybil farming is cheap (self-attestation has no verifier)
- Bonded capital does not cover a high-value harvest

## peer_ratings

Baseline: score = distinct agents that rated you minus disputes (ERC-8004-style feedback).

Scores — Sybil farming: **100.0**, slow-burn harvest: **100.0**, collusive ring: **0.0**

### Sybil farming

- Attacker: 20 identities × 10 attestations = 200 completions
- Effective score: 0 · spend: 0.587055820 SOL · locked: 0.000000000 SOL · cost per point: 0.587055820 SOL
- Locked capital per point: Infinity SOL · honest cost per point: 0.029352791 SOL · efficiency ratio: 0.00x
- Challenges: 16 · upheld: 15
- No effective score could be manufactured for this configuration.

### Slow burn then harvest

- Target score: 50 · harvest value: 5.000000000 SOL
- Reachable: false · spent: 0.968708441 SOL
- Slashable capital: 0.005000000 SOL · coverage: 0.1% · score after slash: 0
- Unreachable: decay prevents score 50 at 2 attestations/day.

### Collusive ring

- Ring of 10 × 1 ratings per pair
- Manufactured score per member: 9 · ring spend: 0.000450000 SOL · cost per point: 0.000005000 SOL
- Detector ensemble precision/recall: 1.00 / 1.00

| Detector | Flagged | Precision | Recall | F1 |
|---|---:|---:|---:|---:|
| reciprocity | 10 | 1.00 | 1.00 | 1.00 |
| mutual_degree | 10 | 1.00 | 1.00 | 1.00 |
| k_core | 10 | 1.00 | 1.00 | 1.00 |
| ensemble | 10 | 1.00 | 1.00 | 1.00 |
- A ring of 10 accounts manufactures 9 points per member at 0.000005000 SOL per point, versus 0.000005000 SOL for a genuine rating. Best detector: reciprocity (precision 1.00, recall 1.00, F1 1.00) over a mixed graph of 40 accounts.

Weak spots (published deliberately):

- Fabricated peer ratings are accepted at face value

## stake_gated

Baseline: score = min(completions - disputes, floor(stake / 0.01 SOL)), stake is fully slashable.

Scores — Sybil farming: **53.8**, slow-burn harvest: **10.0**, collusive ring: **100.0**

### Sybil farming

- Attacker: 20 identities × 10 attestations = 200 completions
- Effective score: 185 · spend: 0.587155820 SOL · locked: 2.000000000 SOL · cost per point: 0.013984626 SOL
- Locked capital per point: 0.010810811 SOL · honest cost per point: 0.012935779 SOL · efficiency ratio: 0.93x
- Challenges: 16 · upheld: 15
- Attacker commits 0.013984626 SOL per effective reputation point (2.000000000 SOL of it locked capital) versus 0.012935779 SOL for honest work (efficiency 0.93x). 15/16 challenges were upheld. Self-attested work is indistinguishable from honest work at this challenge rate.

### Slow burn then harvest

- Target score: 50 · harvest value: 5.000000000 SOL
- Reachable: true in 25 days · spent: 0.136712151 SOL
- Slashable capital: 0.500000000 SOL · coverage: 10.0% · score after slash: 0
- Reached score 50 in 25 days for 0.136712151 SOL. Bonded capital (0.500000000 SOL) covers 10.0% of the 5.000000000 SOL harvest. Underbonded capabilities are the attack surface; raise the bond or gate the contract on more than score.

### Collusive ring

- Ring of 10 × 1 ratings per pair
- Manufactured score per member: 0 · ring spend: 0.000450000 SOL · cost per point: 0.000450000 SOL
- Detector ensemble precision/recall: n/a (mechanism records no rating graph)
- Peer ratings do not contribute to the score, so the ring manufactures nothing and there is no recorded rating graph to inspect. This is immunity by omission, not detection.

Weak spots (published deliberately):

- Bonded capital does not cover a high-value harvest

## Reproducing

```bash
pnpm --filter @taopp/benchmark start
# targeted: pnpm --filter @taopp/benchmark start -- --scenario sybil --mechanism taop_bonded_decay
# or: pnpm bench -- --seed 42 --out benchmark/results
```

Methodology: `docs/methodology.md`. Dataset: `benchmark/dataset/` (CC-BY-4.0).
