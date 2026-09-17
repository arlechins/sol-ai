# TAOP reputation on Solana

[![CI](https://github.com/arlechins/sol-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/arlechins/sol-ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Dataset: CC BY 4.0](https://img.shields.io/badge/Dataset-CC%20BY%204.0-lightgrey.svg)](benchmark/dataset/LICENSE-CC-BY-4.0)

Open infrastructure for **verifying other agents**: self-attested completions,
native-SOL bonded challenges, inactivity-decayed reputation, and a bonded
capability registry — implemented as a single Anchor program, with a TypeScript
SDK, an MCP server, and an adversarial evaluation harness.

This repository is the Solana rebuild of the TAOP agent credit bureau
(previously on Base). It is grant-scoped to three milestones and built to be
independently verified from a clean checkout.

## Milestone status

| Milestone | Deliverable | Status | Evidence |
|---|---|---|---|
| M1 | `taop_reputation` Anchor program: `attest_completion`, `challenge_completion` (native SOL bond), `resolve_challenge`, `get_score` with inactivity decay, bonded `register_capability`, `certify`, `slash` + Rust test suite | **Deployed on devnet** (program + config); mainnet gated on funding | 71 Rust tests (`cargo test --workspace`), IDL at `target/idl/taop_reputation.json`, [program source](programs/taop_reputation/src/lib.rs) |
| M2 | `@taopp/solana` TypeScript SDK (`attest()`, `challenge()`, `getScore()`, `discover()`) and Solana support in `@taopp/mcp-server`, plus a runnable example agent | Shipped | SDK + 14 tests (local-validator integration suite), MCP tools with dual-chain adapters, example in [`examples/solana-agent`](examples/solana-agent) |
| M3 | Open gaming-resistance benchmark with three attack classes, CC-BY dataset, architecture docs, account-layout reference, tutorial | Shipped | [`benchmark/`](benchmark), [`benchmark/dataset/`](benchmark/dataset), [`docs/methodology.md`](docs/methodology.md), [`docs/tutorial.md`](docs/tutorial.md) |

Program ID (fixed across clusters): `8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE`

- Program (devnet): https://explorer.solana.com/address/8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE?cluster=devnet
- Config PDA (devnet): `B1JgvqXoGor9oGaoGUGa4cYhHn4xNLdYXVEBaCxcydVu` (challenge bond 0.005 SOL, 30-day decay)
- Deployment metadata template: [`deployments.solana.example.json`](deployments.solana.example.json) (`deployments.solana.json` is written by `pnpm deploy:init`)
- Verified full loop on devnet: [attest](https://explorer.solana.com/tx/cS1rf1vMDRQppuwSb1civFhmyzqnUwtD49CT5qynNNZs5AZvUSEnknd6WfkdjGXdn8QgffEG7dpcy2gyfHq9VFd?cluster=devnet) → [challenge](https://explorer.solana.com/tx/5HCaz3oNUZQ2ytkhvMZwTmQkTTTbEoAHDgdpjmp5Bmixa1atLNMQgoNLXkgLVTtqP1MY6UtVQuEJzJ4bY1dZmbBS?cluster=devnet) → [resolve](https://explorer.solana.com/tx/p34x3tdMLPDPCz32g1UJXYihTGjBRDefnGgqw3n8Tj7MqwNvdEkJVkxQbBN8MpkNixZ6TfJyQMkuYKzvrV7Hbvd?cluster=devnet)

## Repository layout

```
programs/taop_reputation/   Anchor program (Rust)
test-suite/                 Rust integration suite (LiteSVM, in-process)
idls/                       Generated IDL for declare_program!/tests
packages/solana/            @taopp/solana — TypeScript SDK
packages/mcp-server/        @taopp/mcp-server — MCP tools for any agent runtime
examples/solana-agent/      Runnable two-agent trust loop (SDK + MCP modes)
benchmark/                  Gaming-resistance harness + CC-BY adversarial dataset
docs/                       Architecture, account layout, tutorial, methodology
scripts/                    IDL sync, keypair sync, localnet, devnet bootstrap
keys/                       Program-ID keypair (committed; not an authority)
```

## Quick start

```bash
# Toolchain: Rust stable, Solana CLI 4.2.x, Anchor 1.1.2, Node 20+, pnpm 9
anchor build && ./scripts/sync-idl.sh     # compile + sync IDL for tests/SDK
cargo test --workspace                    # 71 Rust tests (in-process LiteSVM)

./scripts/localnet.sh                     # validator + program deploy
pnpm install
pnpm --filter @taopp/solana test          # 14 SDK tests incl. local-validator E2E
pnpm --filter @taopp/mcp-server test      # MCP stdio smoke tests
pnpm --filter @taopp/benchmark test       # benchmark determinism + dataset checks
CERTIFIER_KEYPAIR=~/.config/solana/id.json \
  pnpm --filter @taopp/example-solana-agent start -- --cluster localnet
```

Deploy to devnet and publish the config:

```bash
solana airdrop 2 --url https://api.devnet.solana.com   # once per wallet
anchor deploy --provider.cluster devnet
SOLANA_RPC_URL=https://api.devnet.solana.com pnpm deploy:init -- --cluster devnet
```

Full walkthrough: [`docs/tutorial.md`](docs/tutorial.md).

## What the program does

- **Reputation.** Agents attest completed tasks. Anyone can challenge a
  completion by escrowing a native SOL bond. The admin or certifier resolves:
  upheld challenges subtract from the agent's score and refund the bond;
  rejected challenges forfeit the bond to the treasury.
- **Score.** `score = max(0, completions - disputes)`, halved for every 30 days
  of inactivity (configurable), capped at 63 halvings. The on-chain `get_score`
  instruction returns the decayed score; the SDK computes the identical value
  locally and verifies it on-chain.
- **Capabilities.** Agents register capabilities with a slashable SOL bond,
  discoverable by type. The certifier can certify or slash them; creators can
  withdraw the remaining bond and close the record.
- **Bonds without tokens.** All value is native SOL held in system-owned vault
  PDAs and moved only through `system_program::transfer` (never direct lamport
  mutation). No protocol token, by design.

Details: [`docs/architecture.md`](docs/architecture.md) ·
[`docs/account-layout.md`](docs/account-layout.md).

## SDK

```ts
import { Connection, PublicKey } from "@solana/web3.js";
import { TaopSolanaClient } from "@taopp/solana";

const client = new TaopSolanaClient({
  connection: new Connection("https://api.devnet.solana.com", "confirmed"),
  wallet: agentKeypair,
});

const { completion } = await client.attest({ taskType: "summarization", resultUri: "ipfs://..." });
const score = await client.getScore(agentKeypair.publicKey);       // local, decayed
const onChain = await client.getScoreOnChain(agentKeypair.publicKey); // simulation
const ranked = await client.discover({ capabilityType: "LoRA", minScore: 1 });
```

Package README: [`packages/solana/README.md`](packages/solana/README.md).

## MCP server

`@taopp/mcp-server` exposes the reputation surface as MCP tools so any
MCP-compatible agent can vet another agent mid-run:
`get_agent_score`, `discover_capabilities`, `attest_completion`,
`challenge_completion`, `register_capability`, `resolve_challenge`, and more.
Chain selection is one env var (`TAOP_CHAIN=solana|base`); the same tools also
work against the previous Base deployment. See
[`packages/mcp-server/README.md`](packages/mcp-server/README.md).

## Evaluation harness

```bash
pnpm --filter @taopp/benchmark start
```

Published results for this implementation (seed 42) — including where it is
weak:

| Mechanism | Sybil | Slow burn | Collusion | Composite |
|---|---:|---:|---:|---:|
| `taop_bonded_decay` | 3.7 | 0.1 | 100.0 | 34.6 |
| `naive_count` | 0.0 | 0.1 | 100.0 | 33.4 |
| `peer_ratings` | 100.0 | 100.0 | 0.0 | 66.7 |
| `stake_gated` | 53.8 | 10.0 | 100.0 | 54.6 |

TAOP v0.1 is structurally immune to mutual-rating rings because it ignores peer
ratings, but that is exactly why Sybil farming is cheap and why underbonded
capabilities are harvestable. The methodology documents the rubric, the
sensitivity tables, and the v2 agenda the results imply:
[`docs/methodology.md`](docs/methodology.md).

## Trust model and limitations

- Challenge resolution is centralized (admin/certifier) in v0.1. This is the
  documented trust boundary; optimistic resolution is future work.
- One challenge per completion; no on-chain timeout.
- No protocol token, no validator set, no fees.
- Mainnet deployment requires an operator-funded program account (~2.5 SOL of
  rent at ~369 KB) and is intentionally gated on funding.

## License

MIT (code). The adversarial pattern dataset is CC BY 4.0.
