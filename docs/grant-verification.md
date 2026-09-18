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
['accept_admin', 'attest_completion', 'cancel_challenge', 'certify_capability',
 'challenge_completion', 'get_score', 'initialize_config', 'register_agent',
 'register_capability', 'resolve_challenge', 'set_certifier', 'slash_capability',
 'transfer_admin', 'update_config', 'withdraw_capability_bond']
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

Expected: 101 passing tests.

| File | Tests | Covers |
|---|---:|---|
| `test-suite/tests/config.rs` | 10 | init/update/auth/pause |
| `test-suite/tests/reputation.rs` | 20 | attest, challenge, resolve, score decay |
| `test-suite/tests/capability.rs` | 11 | register, certify, slash, withdraw, index cap |
| `test-suite/tests/invariants.rs` | 3 | lamport conservation, vault lifecycle |
| `test-suite/tests/layout.rs` | 4 | account sizes, account/event discriminators, discovery offset |
| `test-suite/tests/roundtrip.rs` | 6 | Borsh round-trips and `INIT_SPACE` bounds for every account |
| `test-suite/tests/security.rs` | 9 | donations, account substitution, unauthorized ops, re-init |
| `test-suite/tests/hardening.rs` | 19 | CU budgets, randomized accounting invariants, URI/authority boundaries, treasury funding, upgrade-authority init guard, two-step admin transfer, decay cap, index pruning, challenge timeout |
| `test-suite/tests/compute.rs` | 1 | compute-unit snapshot for 12 instructions (regression budget) |
| `src/state.rs` (unit) | 11 | decay boundaries, 63-halving cap, and 5 property-based invariants |
| `src/programdata.rs` (unit) | 7 | ProgramData metadata parser (examples + proptest) |

### Verify test strength and supply-chain checks

Beyond pass/fail counts, the repository publishes evidence that the suite
actually detects faults and that the pipeline cannot regress silently:

```bash
# Mutation spot-check: 11 seeded program faults; every one must be caught.
python3 scripts/mutation-spotcheck.py
# Expected: "11 caught · 0 survived"; also runs weekly (.github/workflows/mutation.yml).

# Compute-unit snapshot: fails when an instruction costs more than the budget.
cargo test -p taop-reputation-tests --test compute
# Refresh deliberately after reviewing a cost change:
UPDATE_CU_SNAPSHOT=1 cargo test -p taop-reputation-tests --test compute

# Coverage ratchet for the TypeScript surfaces (baseline can only go up).
pnpm coverage
# Expected: every metric at or above coverage-baseline.json
# (SDK ~79% lines, web ~57% lines under vitest 4's stricter counting).

# Full-history secret scan, pinned and checksum-verified in CI.
# See the `secrets-history` job in .github/workflows/ci.yml.
```

### Verify the deployed bytecode matches the reproducible build

```bash
pnpm healthcheck
```

Expected: `"buildHashMatches": true`, the expected hash
(`4fc831ed…` on devnet), `"upgradeAuthority": "bxFp…"`, and an empty
`"problems"` array. The scheduled workflow
(`.github/workflows/healthcheck.yml`, every 6 hours) runs the same check, so an
undocumented upgrade or a config change fails loudly.

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

### Verify the reproducible build

```bash
./scripts/verify-build.sh devnet
```

The script rebuilds the program inside the Docker image pinned by
`Anchor.toml` (`quay.io/ottersec/anchor:v1.1.2`), then compares the executable
hash with the deployed program using `solana-verify`. A weekly GitHub Actions
run (`.github/workflows/verifiable-build.yml`, also dispatchable) does the same
on `ubuntu-latest`, so the check is reproducible by anyone.

Current status: **verified**. The devnet program was replaced with the
reproducible artifact (deploy signature
`W6ubhd3q9iVcjgvUnMZT3eAEMthBM1WJxh65dkT6GhfpZMq4zMCQq98vZYnnnye2fg7wNh7sQdXqr71bb8jfoAN`)
and its executable hash matches the rebuild exactly:

| Artifact | solana-verify executable hash |
|---|---|
| Docker reproducible build (`target/verifiable/`) | `4fc831ed93f4c8b84c76b83803abad0490bf59fefedcf5a2cb782b2faf39c01e` |
| Devnet program (on-chain) | `4fc831ed93f4c8b84c76b83803abad0490bf59fefedcf5a2cb782b2faf39c01e` |

Note: the local platform-tools build (`target/deploy/`) produces a different
ELF than the pinned Docker toolchain (different SHA-256), so only the Docker
artifact is treated as the canonical reproducible build and is what is
deployed. `scripts/verify-build.sh` compares the Docker artifact.

### Devnet deployment evidence (live)

| Item | Value |
|---|---|
| Program | `8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE` |
| Program account | [explorer](https://explorer.solana.com/address/8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE?cluster=devnet) · 371,720 bytes · deploy signature `4EbuKLweGVJ6GF9Uh37wdfc5Zuvfs1j8Uxr8zCZ3RbksCqzMDbQ8R4tGsof2fWH66aTBifcYYfSaY7VA2ACU3Va6` |
| Config PDA | `B1JgvqXoGor9oGaoGUGa4cYhHn4xNLdYXVEBaCxcydVu` (138 bytes; bond 0.005 SOL, 30-day decay) — init signature `3QxXKDhUMgDJs7adaBrYZrPNScfdYsD1aVYZxbbd3aPEbCCn1euXgbee51xnynaop9j7EDhhdnhgj6f51Y1RSxAM` |
| Authority / certifier / treasury | `bxFpYgz8F4rbwLWTGbjuPtY4tmUZVQwMLSLSkG9TFq2` |
| Full loop run on devnet | [attest](https://explorer.solana.com/tx/cS1rf1vMDRQppuwSb1civFhmyzqnUwtD49CT5qynNNZs5AZvUSEnknd6WfkdjGXdn8QgffEG7dpcy2gyfHq9VFd?cluster=devnet) → [challenge](https://explorer.solana.com/tx/5HCaz3oNUZQ2ytkhvMZwTmQkTTTbEoAHDgdpjmp5Bmixa1atLNMQgoNLXkgLVTtqP1MY6UtVQuEJzJ4bY1dZmbBS?cluster=devnet) → [resolve upheld](https://explorer.solana.com/tx/p34x3tdMLPDPCz32g1UJXYihTGjBRDefnGgqw3n8Tj7MqwNvdEkJVkxQbBN8MpkNixZ6TfJyQMkuYKzvrV7Hbvd?cluster=devnet); the agent's score moved 1 → 0 and the capability bond was withdrawn afterwards |

| Repeatable E2E (2026-09-18) | `node scripts/devnet-e2e.mjs` ran the loop with throwaway agents: [attest](https://explorer.solana.com/tx/2WSQKKjrgm4BqgM7ag2PuGTpGRhUHFEY1bpeyg9pro2nHy1RkaYRUcE4gYpqpv6cCEpdb58XvkSWqGi9iayruntw?cluster=devnet) → [challenge](https://explorer.solana.com/tx/4gbYna9m9kdiTKndB2JfToQE4wuxMu9E6Rz2M9jsJWTLsbDbx3uW7Yr7j2uRkE9hyRn1RTWjMesWXWjXu71Nw8Hn?cluster=devnet) → [resolve upheld](https://explorer.solana.com/tx/21nT8yk3qvieGbmkLVyX8Jjkqo7HptowiBWsT8sbfti8d7QNw7w3htZFHfx6wQTZCqFGn11hJib7Jp9T87dVAC9C?cluster=devnet); capability bond reclaimed and agent balances swept afterwards (net cost ~0.006 test SOL) || v0.1.2 upgrade | `security: gate init on upgrade authority, add two-step admin transfer, cap decay` upgraded in place: signature `uaeSPVgXdhb7Ts18u9F3Bo9NaWVULJVevc3CW3RsyEdxQm69qqnbdU74RDG192rBaxX1Vrws6ccf3ZNLFJ4iWyA` (programdata keeps its maximum size after the first upgrade; rent is refundable on close) |
| v0.1.3 upgrade | `security: bound challenge liveness and prune the capability index`: signature `923rVdpM3B7MCarDQXCzknnMVQxQE5KHnDXrAmuuJZN8tSYaVhJw1RLe8DWfz1zNoU7qQ1ocZgsEXAH3CNiGqsj` |
| Index pruning (v0.1.3) | A capability was registered and withdrawn on devnet; the type index dropped from 3 to 2 entries and no longer contains it (checked with `program.account.capabilityIndex.fetch`). Pre-upgrade stale pointers from earlier runs remain, as expected |
| Two-step admin handover (v0.1.2) | [propose](https://explorer.solana.com/tx/61Dn5C1H5Pimx8ZRSNsJzaZnbF42E4zdTNYuSnNJKz9SN3WdJ4S179XEKNFNyWUX5nEKBWSLcX9DPrkxPrGKLN72?cluster=devnet) → [accept](https://explorer.solana.com/tx/AtqAAozBPjWrKcth2Hw8K7zeoArGdhgHgptV2xHrVEisoxth7NXbHNjwMQqRLfBMNJmLUJbXjkMQgjhQg5NDcvh?cluster=devnet) → [propose back](https://explorer.solana.com/tx/2jaUaRZ2ep3HkJY9JrEgzEyb54muAEfnwcrE3N8wJL31nuaaizL4Ry3rY2VvPMttfeMoeMWX6mqvmXv3fDCbLCLv?cluster=devnet) → [accept back](https://explorer.solana.com/tx/4QnetGnNUxJ28oUGTHZzvNSnqtaibqswdimycTSHsko4i2N4CaNBFhnbV1yRsiWTm3bUiBhhzoDihQLXzMLHW1AL?cluster=devnet); the admin key ended where it started |
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

Expected: build succeeds; **21 tests pass** (10 unit + 11 integration against a
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

Expected: **4 tests pass**; `listTools` returns the reputation toolset; writes
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

Repeatable live E2E against a funded cluster (funds two throwaway agents,
runs the loop, reclaims the capability bond):

```bash
TAOP_E2E_CLUSTER=devnet TAOP_E2E_KEYPAIR=~/.config/solana/id.json \
  node scripts/devnet-e2e.mjs
```

`.github/workflows/devnet-e2e.yml` (manual dispatch) runs the same script when
the `TAOP_E2E_KEYPAIR` secret is present, and skips with a warning otherwise.

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

| Workflow | Trigger | What it proves |
|---|---|---|
| `ci.yml` | push / PR | Program: fmt, clippy, `anchor build`, IDL-drift check, `cargo test` (101 tests incl. the CU snapshot), `cargo-audit`, `cargo-deny`. Packages: typecheck, build, local validator + SDK integration, package tests, and the coverage ratchet. Plus `dependency-review` (PRs) and `secrets-history` (gitleaks over the full git history). |
| `mutation.yml` | weekly | 11 seeded program faults; every one must be caught by the suite. |
| `fuzz.yml` | weekly | cargo-fuzz targets for score, ProgramData parsing, and account decoding. |
| `healthcheck.yml` | every 6h | Devnet config plus on-chain executable hash against the pinned reproducible build. |
| `verifiable-build.yml` | weekly | Rebuilds in the pinned Docker toolchain and compares the hash with devnet. |
| `web.yml` | push / PR | Website typecheck, tests (incl. axe + header checks), build, bundle budget; deploys to Cloudflare Pages on `main`. |
| `codeql.yml` / `scorecard.yml` | scheduled | SAST and OpenSSF Scorecard. |
| `release.yml` | tag | Builds, tests, and publishes packages with npm provenance plus a CycloneDX SBOM. |
