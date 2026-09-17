# Grant verification guide

This document maps each grant milestone to the exact commands and artifacts a
reviewer can use to verify it. Everything runs from a clean checkout.

**Program ID:** `8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE` (fixed across
clusters; derived from `target/deploy/taop_reputation-keypair.json` and declared
in `programs/taop_reputation/src/lib.rs`).

## One-command pre-flight

```bash
./scripts/check.sh
```

Expected: formatting, clippy, program build, IDL-sync check, the Rust suite, all
package typechecks/builds/tests, and a benchmark smoke run all pass.

---

## Milestone 1 — Solana reputation program

**Deliverable:** Anchor program `taop_reputation` with `attest_completion`,
`challenge_completion` (bonded via native SOL transfer), `resolve_challenge`,
`get_score` with inactivity decay, plus bonded `register_capability`, `certify`,
and `slash`; full Rust test suite; deployed to devnet and mainnet with a
published program ID. The program also gates config initialization on
the upgrade authority, caps the decay period, and supports two-step admin
rotation.

### Verify the instruction set

```bash
python3 - <<'EOF'
import json
idl = json.load(open('target/idl/taop_reputation.json'))
print([i['name'] for i in idl['instructions']])
EOF
```

Expected:

```
['accept_admin', 'attest_completion', 'certify_capability', 'challenge_completion',
 'get_score', 'initialize_config', 'register_agent', 'register_capability',
 'resolve_challenge', 'set_certifier', 'slash_capability', 'transfer_admin',
 'update_config', 'withdraw_capability_bond']
```

Source: `programs/taop_reputation/src/instructions/`
(`reputation.rs`, `capability.rs`, `config.rs`, `agent.rs`).

### Verify the bond mechanism is a native SOL transfer

`programs/taop_reputation/src/instructions/reputation.rs` — `challenge_completion`
calls `anchor_lang::system_program::transfer` from the challenger into the
system-owned `challenge_vault` PDA; `resolve_challenge` transfers out with
`invoke_signed`. Same pattern for capability bonds in `capability.rs`.

### Verify the test suite

```bash
anchor build              # produces target/deploy/taop_reputation.so
./scripts/sync-idl.sh     # required by the Rust tests
cargo test --workspace
```

Expected: 75 passing tests.

| File | Tests | Covers |
|---|---:|---|
| `test-suite/tests/config.rs` | 10 | init/update/auth/pause |
| `test-suite/tests/reputation.rs` | 20 | attest, challenge, resolve, score decay |
| `test-suite/tests/capability.rs` | 11 | register, certify, slash, withdraw, index cap |
| `test-suite/tests/invariants.rs` | 3 | lamport conservation, vault lifecycle |
| `test-suite/tests/security.rs` | 9 | donations, account substitution, unauthorized ops, re-init |
| `test-suite/tests/hardening.rs` | 11 | CU budgets, randomized accounting invariants, URI/authority boundaries, treasury funding, upgrade-authority init guard, two-step admin transfer, decay cap |
| `src/state.rs` (unit) | 11 | decay boundaries, 63-halving cap, and 5 property-based invariants |
| generated (`declare_program!`) | 1 | program ID stability |

### Verify devnet / mainnet deployment

```bash
anchor deploy --provider.cluster devnet
SOLANA_RPC_URL=https://api.devnet.solana.com pnpm deploy:init -- --cluster devnet
```

Then confirm:

```bash
solana program show 8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE \
  --url https://api.devnet.solana.com
solana account "$(python3 -c "import json; print(json.load(open('deployments.solana.json'))['config'])")" \
  --url https://api.devnet.solana.com
```

Explorer:
https://explorer.solana.com/address/8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE?cluster=devnet

Mainnet uses the same commands with `--provider.cluster mainnet-beta` and a
funded operator key (~2.4 SOL of program rent for the 372 KB binary, plus fees).
The deploy, config bootstrap, and cost checks are scripted in `scripts/`.

### Devnet deployment evidence (live)

| Item | Value |
|---|---|
| Program | `8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE` |
| Program account | [explorer](https://explorer.solana.com/address/8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE?cluster=devnet) · 371,720 bytes · deploy signature `4EbuKLweGVJ6GF9Uh37wdfc5Zuvfs1j8Uxr8zCZ3RbksCqzMDbQ8R4tGsof2fWH66aTBifcYYfSaY7VA2ACU3Va6` |
| Config PDA | `B1JgvqXoGor9oGaoGUGa4cYhHn4xNLdYXVEBaCxcydVu` (138 bytes; bond 0.005 SOL, 30-day decay) — init signature `3QxXKDhUMgDJs7adaBrYZrPNScfdYsD1aVYZxbbd3aPEbCCn1euXgbee51xnynaop9j7EDhhdnhgj6f51Y1RSxAM` |
| Authority / certifier / treasury | `bxFpYgz8F4rbwLWTGbjuPtY4tmUZVQwMLSLSkG9TFq2` |
| Full loop run on devnet | [attest](https://explorer.solana.com/tx/cS1rf1vMDRQppuwSb1civFhmyzqnUwtD49CT5qynNNZs5AZvUSEnknd6WfkdjGXdn8QgffEG7dpcy2gyfHq9VFd?cluster=devnet) → [challenge](https://explorer.solana.com/tx/5HCaz3oNUZQ2ytkhvMZwTmQkTTTbEoAHDgdpjmp5Bmixa1atLNMQgoNLXkgLVTtqP1MY6UtVQuEJzJ4bY1dZmbBS?cluster=devnet) → [resolve upheld](https://explorer.solana.com/tx/p34x3tdMLPDPCz32g1UJXYihTGjBRDefnGgqw3n8Tj7MqwNvdEkJVkxQbBN8MpkNixZ6TfJyQMkuYKzvrV7Hbvd?cluster=devnet); the agent's score moved 1 → 0 and the capability bond was withdrawn afterwards |
| v0.1.1 upgrade | `security: harden authority guards, treasury funding, and test coverage` upgraded in place: signature `5XwCkWxCaoUYWMYjVLHwBVC6HkSBpdqAehxWbvhnwPN1A4fviZ8CAcoFzrpWjh7RarwaJeoQUQpUaV1xFouGEaQq`; program grew to 381,960 bytes, config preserved |
| Post-upgrade loop (v0.1.1) | [attest](https://explorer.solana.com/tx/erAdouHbcm33g8fBQzu346yAJMsGEAmETppZySF2cAab5hSWJBntKm6noq8gXxV1NXHfWmRfnQDN6yTUw7wg6mV?cluster=devnet) → [challenge](https://explorer.solana.com/tx/5eikUieSik6Hm6wag9NjfFwma6yKi8pPtsU5BJZWeFW53RvdTpDgikemAH9csGytvVNcD6BKk7wgZZ4HQSfPyrGY?cluster=devnet) → [resolve upheld](https://explorer.solana.com/tx/5AL2XkYWxzbw7uLexFqHNvkePKZSL2hxZi2DicK1GZoZBJyKSeTLfyYsCkavrnbZDA2FpvwcJWBXwENouC3X2CBx?cluster=devnet); local and on-chain `get_score` agree |

Deployment cost (devnet): 1.911 SOL total — 1.889 SOL program rent (locked,
recoverable if the program is closed), 0.0014 SOL config rent, ~0.021 SOL
deploy and transaction fees. The temporary deploy buffer is refunded.

**Status note:** devnet deployment is complete and the SDK/example loop was
verified against it. Mainnet is scripted but gated on funding. The on-chain IDL
publish (optional, ~0.21 SOL of rent) is intentionally skipped; the IDL ships in
the repository and embedded in `@taopp/solana`.

---

## Milestone 2 — Agent-facing SDK and MCP adapter

**Deliverable:** `@taopp/solana` npm package with `attest()`, `challenge()`,
`getScore()`, `discover()`; Solana support in `@taopp/mcp-server`
(`get_agent_score`, `discover_capabilities`, `attest_completion`,
`challenge_completion`); a runnable example agent.

### Verify the SDK

```bash
pnpm install
pnpm --filter @taopp/solana build && pnpm --filter @taopp/solana test
```

Expected: build succeeds; **18 tests pass** (10 unit + 8 integration against a
local validator).

Integration coverage: register/attest, local vs on-chain score parity, challenge
bonding, upheld resolution and score drop, capability register/certify/discover/
slash/withdraw. Source: `packages/solana/test/integration.test.ts`.

Publish command (operator credentials required):

```bash
pnpm --filter @taopp/solana publish --access public
```

Public API: `packages/solana/src/client.ts` (`attest`, `challenge`, `getScore`,
`getScoreOnChain`, `discover`, `registerCapability`, `certifyCapability`,
`slashCapability`, `withdrawCapabilityBond`, `resolveChallenge`,
`initializeConfig`, `updateConfig`, `setCertifier`, `loadDeployment`).

### Verify the MCP server

```bash
pnpm --filter @taopp/mcp-server build && pnpm --filter @taopp/mcp-server test
```

Expected: **3 tests pass**; `listTools` returns the reputation toolset; writes
without a signer return a typed error.

Tool list (same names for both chains): `get_deployment_info`,
`get_agent_score`, `discover_capabilities`, `get_capability`, `get_completion`,
`attest_completion`, `challenge_completion`, `register_capability`,
`resolve_challenge`. Chain selection: `TAOP_CHAIN=solana|base`.

Publish command:

```bash
pnpm --filter @taopp/mcp-server publish --access public
```

### Verify the example agent

```bash
./scripts/localnet.sh
CERTIFIER_KEYPAIR=~/.config/solana/id.json \
  pnpm --filter @taopp/example-solana-agent start -- --cluster localnet
```

Expected output: capability registered and certified, completion attested,
Agent B discovers and vets Agent A, challenges with a bond, the certifier
resolves it, and the score drops (`1 -> 0`). Explorer links are printed.

MCP transport mode:

```bash
SOLANA_KEYPAIR=~/.config/solana/id.json SOLANA_RPC_URL=http://127.0.0.1:8899 \
  pnpm --filter @taopp/example-solana-agent start -- --via-mcp --cluster localnet
```

On mainnet the example runs attestations and challenges with real (tiny) SOL
amounts; see `examples/solana-agent/README.md` for the cost note and the
operator resolution command.

---

## Milestone 3 — Evaluation harness, dataset, and documentation

**Deliverable:** open benchmark producing a gaming-resistance score across
Sybil farming, slow-burn harvest, and collusive rings; public CC-BY dataset;
architecture docs, account-layout reference, and a step-by-step tutorial;
reproducible in one command with published results including weaknesses.

### Verify the benchmark

```bash
pnpm --filter @taopp/benchmark start
```

Expected: five mechanisms scored against three attack classes and a rendered
`benchmark/results/REPORT.md`. Deterministic for a given `--seed`.

Committed baseline (`results/baseline-seed42.json`, seed 42):

| Mechanism | Sybil | Slow burn | Collusion | Composite |
|---|---:|---:|---:|---:|
| `taop_bonded_decay` | 3.7 | 0.1 | 100.0 | 34.6 |
| `naive_count` | 0.0 | 0.1 | 100.0 | 33.4 |
| `completions_minus_disputes` | 3.7 | 0.1 | 100.0 | 34.6 |
| `peer_ratings` | 100.0 | 100.0 | 0.0 | 66.7 |
| `stake_gated` | 53.8 | 10.0 | 100.0 | 54.6 |

Sensitivity tables and the rubric: `docs/methodology.md`. Weak spots (Sybil
farming, underbonded harvest) are documented in the same file, section 5.

### Verify the dataset

```bash
python3 - <<'EOF'
import json
from collections import Counter
d = json.load(open('benchmark/dataset/patterns.json'))
print(d['license'], len(d['patterns']), Counter(p['attackClass'] for p in d['patterns']))
EOF
```

Expected: `CC-BY-4.0 34 Counter({'sybil_farming': 12, 'collusive_ring': 12, 'slow_burn_harvest': 10})`.

`pnpm --filter @taopp/benchmark test` validates schema shape, ID uniqueness, and
class balance.

### Verify the documentation

- `docs/architecture.md` — mechanism, account model, custody, trust boundaries.
- `docs/account-layout.md` — per-field sizes, PDA seeds, instruction matrix.
- `docs/tutorial.md` — clean-checkout walkthrough to devnet and explorer checks.
- `docs/methodology.md` — rubric, reproduction, results, limitations.

---

## Continuous integration

`.github/workflows/ci.yml` runs two jobs on every push and pull request:

1. **Program** — fmt, clippy, `anchor build`, IDL-sync check, `cargo test`
   (LiteSVM), dependency audit.
2. **Packages** — installs the toolchain, builds, starts a local validator,
   deploys the program, and runs SDK/MCP/benchmark typechecks and tests
   including the live integration suite.
