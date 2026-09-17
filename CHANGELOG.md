# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.3] - 2026-09-17

Availability and liveness hardening for bonds and the capability index.

### Security

- **Challenge liveness timeout.** `cancel_challenge` lets the original
  challenger reclaim a bond after `CHALLENGE_TIMEOUT_SECS` (90 days) if the
  authority never resolves. The challenge is marked resolved and not upheld;
  the completion stays challenged so it cannot be re-challenged, and no dispute
  is recorded. Before the timeout the instruction fails with
  `ChallengeNotTimedOut`, and only the challenger can call it.
- **Capability index pruning.** `withdraw_capability_bond` now removes the
  capability pointer from its type index before closing the record. A type's
  64-entry capacity can no longer be exhausted by churn, which previously
  blocked new registrations permanently.
- **Batched RPC reads.** The SDK chunks `getMultipleAccountsInfo` into groups
  of 100, so discovery and score aggregation cannot fail on large sets.

### Added

- `cancel_challenge` instruction and `ChallengeCancelled` event.
- SDK methods `cancelChallenge()` and `challengeTimedOut()`; `commitment`
  configuration option.
- Compute-unit budgets for `cancel_challenge` and `withdraw_capability_bond`.
- `security-insights.yml` (OpenSSF) and a Scorecard badge; pinned Rust
  toolchain via `rust-toolchain.toml`.

### Changed

- Test counts: 80 Rust tests total (69 integration + 11 unit/property) and 19
  SDK tests.

## [0.1.2] - 2026-09-17

Further hardening: deployment front-running protection, safe admin rotation,
configuration caps, stricter input validation, and expanded supply-chain
automation. The program is upgraded in place on devnet under the same program
ID.

### Security

- **Deployment front-running guard.** `initialize_config` now takes the
  program's `ProgramData` PDA, bound by seeds, and requires its
  `upgrade_authority_address` to equal the admin signer. Nobody can initialize a
  fresh deployment and claim the admin role.
- **Two-step admin transfer.** New `transfer_admin` / `accept_admin`
  instructions and a `PendingAdmin` PDA let the admin hand over to a multisig
  without a typo risk; the old admin keeps control until the successor accepts.
- **Decay cap.** The inactivity decay period is capped at 366 days
  (`DecayPeriodTooLong`) so a fat-fingered config cannot disable decay.
- **SDK input validation.** URIs are length-checked (`UriTooLong`), decay
  periods are capped (`DecayPeriodTooLong`), reads that need a fee payer throw
  `WalletRequired`, and missing accounts and challenges surface as typed
  `AccountNotFound` errors instead of raw failures.
- **MCP input validation.** Solana adapters reject non-base58 addresses and Base
  adapters reject non-EVM addresses with field-specific messages.

### Deployed

- Devnet upgraded in place: signature
  `uaeSPVgXdhb7Ts18u9F3Bo9NaWVULJVevc3CW3RsyEdxQm69qqnbdU74RDG192rBaxX1Vrws6ccf3ZNLFJ4iWyA`.
  A two-step admin handover was executed on devnet and returned the admin to the
  operator.
- Note: the upgradeable loader keeps the programdata account at its maximum
  size after the first upgrade; rent is refundable if the program is ever
  closed.

### Added

- `PendingAdmin` account (PDA `["pending-admin"]`) and `AdminTransferProposed` /
  `AdminTransferred` events.
- OpenSSF Scorecard and CodeQL workflows (actions pinned to commit SHAs).
- CI least-privilege permissions, per-branch concurrency, and job timeouts.
- SDK client-validation unit tests.

### Changed

- Test counts: 76 Rust tests total (65 integration + 11 unit/property) and 18
  SDK tests.

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

### Deployed

- Devnet upgrade executed in place: signature
  `5XwCkWxCaoUYWMYjVLHwBVC6HkSBpdqAehxWbvhnwPN1A4fviZ8CAcoFzrpWjh7RarwaJeoQUQpUaV1xFouGEaQq`
  (program now 381,960 bytes; config preserved). A post-upgrade write loop
  (attest → challenge → resolve) was executed and `get_score` matches the SDK's
  local computation.

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
