# Solana Foundation grant application — paste-ready package

This document contains ready-to-paste answers for the Solana Foundation funding
application, plus supporting detail for the due-diligence call. Replace the
`<...>` placeholders (applicant identity, contact, dates) before submitting.

- **Project:** TAOP reputation on Solana (`sol-ai`)
- **Repository:** https://github.com/arlechins/sol-ai (public, MIT + CC BY 4.0 dataset)
- **Program ID (devnet):** `8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE`
- **Request:** $12,000 across three milestones (M1 $5,000 · M2 $4,000 · M3 $3,000)
- **Token:** none planned; the primitive remains a public good

---

## 1. Short description (one paragraph, for forms)

TAOP is open infrastructure for **verifying other autonomous agents**. It
provides a Solana Anchor program where agents self-attest completed work, anyone
can challenge an attestation with a native-SOL bond, and reputation decays with
inactivity; a bonded capability registry lets agents certify and slash the
capabilities they offer. Around the program we ship a TypeScript SDK, an MCP
server so any agent runtime can vet another agent mid-run, a runnable two-agent
example, and an open gaming-resistance benchmark with a CC-BY adversarial
dataset. The program and config are live on devnet today.

### One-line description

> Bonded, decayed agent reputation on Solana: attest, challenge, verify —
> with an open benchmark that measures how gameable the mechanism is.

### Elevator pitch (for the call)

Agent marketplaces are forming faster than trust tooling. Buyers cannot tell
whether an agent's reputation is grounded in real work or manufactured by
farming. TAOP puts the smallest useful primitive on-chain: self-attested
completions with bonded challenges and inactivity decay, plus bonded
capabilities. No token, no validator set, no platform in the middle. Then we do
what most reputation projects do not: we publish an adversarial benchmark that
scores the mechanism itself across Sybil farming, slow-burn harvesting, and
collusive rings — including where our own design scores poorly.

---

## 2. Public good

- **Open source, permissive:** program, SDK, MCP server, example, and benchmark
  are MIT; the adversarial pattern dataset is CC BY 4.0.
- **Reusable primitive, not a product:** any team can integrate reputation reads
  through the SDK or MCP tools without permission or a token.
- **Measurement as a public good:** the gaming-resistance benchmark and dataset
  can evaluate *any* agent-reputation mechanism, including competitors. Published
  baseline results and sensitivity tables (see `docs/methodology.md`) make the
  claims falsifiable, and the dataset catalogues 34 documented adversarial
  patterns with conservative confidence labels.
- **No token, no fees:** bond economics use native SOL; there is no protocol
  token and no fee switch.

## 3. Why this belongs on Solana

- **Bonded micro-transactions:** the mechanism's value comes from many small
  attest and challenge transactions. Solana's fees make bonded challenges
  (0.005 SOL) and attestations economically viable; on a high-fee chain the
  challenge half of the loop is unusable for small work items.
- **Native SOL bonds without a token:** escrow and slashing need a native asset.
  Vaults are system-owned PDAs moved only via `system_program::transfer` /
  `invoke_signed` — no wrapped assets, no token program, no custom custody.
- **Agent-native composability:** the MCP server exposes the reputation surface
  as standard tools, so Solana reputation is readable by agent runtimes as a
  first-class capability rather than a bespoke API.
- **Cheap verifiability:** the evaluation harness runs the real `.so` in-process
  (LiteSVM), so benchmarks and tests reproduce without a validator.
- **Ecosystem fit:** accountability for autonomous agents is becoming a
  procurement requirement; a neutral, open Solana primitive can be the
  cross-ecosystem reference implementation.

## 4. Evidence of execution (already public)

Everything below is verifiable from the repository and devnet today.

| Area | Evidence |
|---|---|
| Program on devnet | Program `8soD4Yte…15MnE`, config PDA `B1JgvqXo…cydVu`; full loop executed on-chain: [attest](https://explorer.solana.com/tx/cS1rf1vMDRQppuwSb1civFhmyzqnUwtD49CT5qynNNZs5AZvUSEnknd6WfkdjGXdn8QgffEG7dpcy2gyfHq9VFd?cluster=devnet) → [challenge](https://explorer.solana.com/tx/5HCaz3oNUZQ2ytkhvMZwTmQkTTTbEoAHDgdpjmp5Bmixa1atLNMQgoNLXkgLVTtqP1MY6UtVQuEJzJ4bY1dZmbBS?cluster=devnet) → [resolve](https://explorer.solana.com/tx/p34x3tdMLPDPCz32g1UJXYihTGjBRDefnGgqw3n8Tj7MqwNvdEkJVkxQbBN8MpkNixZ6TfJyQMkuYKzvrV7Hbvd?cluster=devnet) |
| Program tests | 100 Rust tests including a dedicated attack suite (donations, substituted accounts, unauthorized privileged operations, re-init attempts) |
| SDK | `@taopp/solana` — `attest()`, `challenge()`, `getScore()`, `discover()`; 21 tests, including a live-validator end-to-end suite and typed program errors |
| MCP server | `@taopp/mcp-server` 0.2 — 9 reputation tools, dual-chain adapters (Solana + previous Base deployment), stdio smoke tests |
| Example agent | `examples/solana-agent` — two agents and a certifier run the full loop in SDK and MCP modes, with a `--reclaim` mode for demo bonds |
| Benchmark | 5 mechanisms × 3 attack classes, deterministic; published baseline and sensitivity tables; `pnpm bench` reproduces |
| Dataset | 34 CC BY 4.0 adversarial patterns with sources and honest confidence labels |
| Docs | Architecture, account-layout reference, tutorial, methodology, grant-verification guide |
| CI | Builds, lints, tests, deploys to a local validator, audits dependencies, and runs CodeQL/Scorecard plus a weekly reproducible-build check |

## 5. Milestones

The milestones below match the submitted plan. The "already in repo" column is
execution evidence; the funded work is the remaining hardening, verification,
and adoption needed to make each milestone independently verifiable at the
stated bar.

### Milestone 1 — Solana reputation program · $5,000

| Field | Content |
|---|---|
| Deliverables | `taop_reputation` Anchor program: `attest_completion`, `challenge_completion` (bonded via native SOL transfer), `resolve_challenge`, `get_score` with inactivity decay, bonded `register_capability`, `certify`, `slash`; full Rust test suite; deployed to devnet and Solana mainnet; published program ID |
| Already in repo | All instructions implemented; 100 Rust tests; devnet deployment with a verified loop; reproducible build verified hash-for-hash against devnet; security hardening (vault donation sweep, substituted-account and re-init tests) |
| Funded remaining work | Mainnet deployment (program rent ~2.4 SOL + operator fees), external code review of bond custody paths, operator runbooks (multisig upgrade authority), post-deploy verification on both clusters, and independent third-party reproduction of the published build hash |
| Verification | Program ID on an explorer; tests in the public repo; verifiable build attestation |
| Amount | $5,000 |

### Milestone 2 — Agent-facing SDK and MCP adapter · $4,000

| Field | Content |
|---|---|
| Deliverables | `@taopp/solana` published to npm (`attest()`, `challenge()`, `getScore()`, `discover()`); Solana support in `@taopp/mcp-server` (`get_agent_score`, `discover_capabilities`, `attest_completion`, `challenge_completion`); a runnable example agent; example runs against mainnet |
| Already in repo | SDK, MCP server 0.2, example agent; 21 SDK tests + 4 MCP tests; packaging validated with `publint` and `arethetypeswrong`; example verified on devnet |
| Funded remaining work | npm releases under the `@taopp` scope, mainnet run of the example (small real-SOL amounts), integration guide for two external agent frameworks, MCP registry submission, adoption fixes from first external users |
| Verification | Packages resolve on npm; example runs against mainnet; changelog and release notes |
| Amount | $4,000 |

### Milestone 3 — Evaluation harness, dataset, and documentation · $3,000

| Field | Content |
|---|---|
| Deliverables | Open benchmark that scores an agent-reputation mechanism across three attack classes (Sybil farming, slow-burn harvest, collusive rings); public CC BY dataset of documented adversarial patterns; architecture docs, account-layout reference, and a step-by-step integration tutorial; reproducible in one command with published results including poor scores |
| Already in repo | Benchmark with 5 mechanisms, 3 scenarios, deterministic seeds, published baseline and sensitivity tables; 34-pattern dataset with schema + license; architecture/account-layout/tutorial/methodology docs |
| Funded remaining work | On-chain adapter so the benchmark executes the real program bytecode in-process and parity-tests simulation vs on-chain; independent reproduction by two external reviewers (small bounties); methodology peer notes; dataset expansion to 60+ patterns with a public contributions process |
| Verification | Public repo, published dataset, published benchmark results, published tutorial; reproduction reports from external reviewers |
| Amount | $3,000 |

## 6. Budget and use of funds

| Item | Amount |
|---|---:|
| Milestone 1 — program hardening, mainnet deployment, verifiable build, review | $5,000 |
| Milestone 2 — npm releases, mainnet example validation, integrations | $4,000 |
| Milestone 3 — on-chain benchmark adapter, external reproduction, dataset expansion | $3,000 |
| **Total** | **$12,000** |

Principal cost is engineering time for a solo maintainer. Direct third-party
costs are small and disclosed: mainnet program rent (~2.4 SOL, recoverable if
the program is ever closed), transaction fees for the mainnet example run, and
two small external-reproduction bounties in Milestone 3.

## 7. Sustainability beyond the grant

- No token is planned. The primitive is a public good and remains maintained as
  one.
- The mechanism's maintenance cost is low: one Anchor program, one SDK, one MCP
  server, and a benchmark that runs in-process.
- If the mechanism finds real users, **cross-chain reputation reads** (a Solana
  reputation verifiable by agents elsewhere) are the natural next step, funded
  separately. The MCP server already demonstrates the dual-chain pattern
  against the earlier Base deployment.

## 8. Honest limitations (disclosed up front)

- **Resolution is centralized in v0.1:** one admin and one certifier resolve
  challenges and slash capabilities. This is the documented trust boundary;
  optimistic resolution with bonded watchers is the v2 agenda.
- **The benchmark simulates mechanism rules**, with costs and decay matching the
  on-chain implementation; the on-chain adapter is explicitly part of
  Milestone 3. Methodology limitations are published.
- **Our own benchmark scores are low where it counts:** Sybil resistance is 3.7
  and slow-burn resistance 0.1 under the published rubric. We publish this and
  the v2 agenda it implies rather than tune the rubric.
- **One challenge per completion** and no on-chain timeout in v0.1.
- **Mainnet is scripted but not yet executed:** it is gated on the funding
  requested here.

## 9. Links checklist

- Repository: https://github.com/arlechins/sol-ai
- Program (devnet): https://explorer.solana.com/address/8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE?cluster=devnet
- Tutorial: `docs/tutorial.md`
- Grant verification guide: `docs/grant-verification.md`
- Methodology + results: `docs/methodology.md`, `benchmark/results/baseline-seed42.json`
- Dataset: `benchmark/dataset/patterns.json` (CC BY 4.0)
- Example run transcript: see README and `examples/solana-agent/README.md`

## 10. Applicant

- Name/entity: `<applicant name or entity>`
- Contact: `<email / telegram>`
- Location: `<jurisdiction>`
- Prior work: `<one line; this repository is the primary execution evidence>`
- Availability: `<hours/week or full-time>`
