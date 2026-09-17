# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-09-17

Security hardening release. The program is redeployed to devnet under the same
program ID.

### Security

- **Zero-authority guards.** `initialize_config` and `set_certifier` reject the
  default (all-zero) pubkey with a typed `InvalidAuthority` error, preventing an
  admin from bricking resolution or payouts by accident.
- **Treasury funded at init.** `initialize_config` transfers the rent-exempt
  minimum from the admin to the treasury, so the first micro-payout cannot fail
  while creating the treasury account. Found by the new CU/invariant tests.
- **Property-based score tests.** Five proptest invariants: score never exceeds
  net completions, monotonic in completions, non-increasing over time, no decay
  within one period, and zero after enough inactivity.
- **Compute-unit budgets.** Every instruction asserts a CU ceiling (~3x the
  observed usage) to catch accidental complexity regressions.
- **Randomized accounting invariants.** A deterministic 60-operation sequence
  (attest, challenge, resolve, register, slash) verifies vault balances,
  treasury inflows, and per-agent counters against mirrored ground truth.
- **Boundary tests.** Exact 200/201-byte URI limits, 1-lamport slashes, and a
  pinned test for stale capability-index pointers after withdrawal.
- **Threat model.** `docs/threat-model.md` documents assets, trust boundaries,
  per-instruction attack surface, residual risks, and the test that covers each
  mitigation.

### Added

- `docs/threat-model.md`.
- Dependabot configuration for Cargo, npm, and GitHub Actions.
- Dependency review workflow for pull requests.
- `pnpm audit --audit-level high` in CI with documented, suppressed advisories
  (see `SECURITY.md`).

### Changed

- Third-party GitHub Actions pinned to full commit SHAs.
- Story counts: 71 Rust tests total (60 integration + 11 unit/property).

### Infrastructure

- `main` branch protection: required CI checks, no force pushes, no branch
  deletion, linear history.
- Secret scanning with push protection, Dependabot alerts, automated security
  fixes, and private vulnerability reporting enabled.

## [0.1.0] - 2026-09-17

Initial Solana rebuild of the TAOP agent credit bureau.

### Added — program (`taop_reputation`)

- `initialize_config`, `update_config`, `set_certifier` with a configurable
  challenge bond and inactivity decay period.
- `register_agent`, `attest_completion`, `challenge_completion` (native SOL
  bond into a system-owned vault PDA), `resolve_challenge` (admin/certifier),
  `get_score` (return-data view with decay).
- Bonded capability registry: `register_capability`, `certify_capability`,
  `slash_capability`, `withdraw_capability_bond`, plus a per-type capability
  index for discovery.
- 59 Rust tests across config, reputation, capability, invariant, and security
  suites (LiteSVM, in-process).

### Added — packages

- `@taopp/solana`: `attest()`, `challenge()`, `getScore()` (local + on-chain
  verified), `discover()`, the full admin/capability surface, PDA derivation,
  and a decay function shared with the on-chain implementation.
- `@taopp/mcp-server` 0.2: dual-chain adapters so the same tools
  (`get_agent_score`, `discover_capabilities`, `attest_completion`,
  `challenge_completion`, ...) work against Solana and the previous Base
  deployment.
- `examples/solana-agent`: a runnable two-agent loop in SDK and MCP modes.

### Added — evaluation

- Gaming-resistance benchmark with five mechanisms and three attack classes
  (Sybil farming, slow-burn harvest, collusive rings), deterministic and
  reproducible in one command.
- CC BY 4.0 dataset of 34 documented adversarial agent-reputation patterns.
- Published baseline results, sensitivity tables, and methodology, including
  where this implementation scores poorly.

### Security

- Challenge and capability bonds are held in system-owned vault PDAs and moved
  only via `system_program::transfer` / `invoke_signed`.
- `resolve_challenge` sweeps the entire vault balance, so unsolicited donations
  cannot strand lamports or block challenges (new accounts must be rent-exempt
  on Solana, which bounds the smallest possible donation).
- Attack-oriented test suite covering donation handling, substituted accounts,
  unauthorized privileged operations, and re-initialization attempts.

### Deployed

- Devnet: program `8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE`, config PDA
  `B1JgvqXoGor9oGaoGUGa4cYhHn4xNLdYXVEBaCxcydVu`. The SDK example loop
  (attest → challenge → resolve, score 1 → 0) was executed against devnet and
  the capability bond was reclaimed; deployment cost 1.911 SOL of which 1.891
  SOL is recoverable rent.
