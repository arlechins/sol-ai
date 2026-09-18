# Security review guide

This document is for an external reviewer (or an auditor preparing a scope) of
the `taop_reputation` program and its clients. It maps the trust boundaries to
the exact code and tests that cover them, and lists what to challenge.

## Scope

| Component | Path | Notes |
|---|---|---|
| On-chain program | `programs/taop_reputation/src/` | Holds native SOL bonds |
| Integration tests | `test-suite/tests/` | LiteSVM, in-process |
| TypeScript SDK | `packages/solana/src/` | Signs with caller keys |
| MCP server | `packages/mcp-server/src/` | Reads keys from env for writes |

Out of scope: the evaluation harness (`benchmark/`, simulation only), the demo
example, CI workflow configuration.

## Reproduce everything

```bash
git clone https://github.com/arlechins/sol-ai.git && cd sol-ai
anchor build && ./scripts/sync-idl.sh
cargo test --workspace                  # 100 tests, in-process
./scripts/localnet.sh
pnpm install
pnpm -r --if-present test               # SDK, MCP, webhooks, benchmark
./scripts/verify-build.sh devnet        # reproducible build vs devnet
cd fuzz && cargo +nightly fuzz run account_decode -- -max_total_time=60
```

## Assets and invariants to challenge

1. **Bond custody.** All value moves with `system_program::transfer` /
   `invoke_signed`; there is no direct lamport mutation. Vaults are
   system-owned PDAs. Invariant tests: `tests/invariants.rs`, plus
   `every_created_account_is_rent_exempt` and the randomized
   `randomized_sequences_preserve_accounting_invariants` (six seeds).
2. **No unauthorized value movement.** Every privileged instruction checks
   `admin`/`certifier` equality; recipient accounts are constrained with
   `address =` (treasury) or `has_one` (challenger via `Challenge`). Tests:
   `tests/security.rs`, `privileged_operations_reject_non_authority`.
3. **No account substitution.** PDAs are seed-bound; `resolve_challenge`
   requires `completion.agent` to derive the agent PDA. Tests:
   `resolve_rejects_substituted_*`, `attacker_cannot_reinitialize_an_existing_agent`.
4. **Bond accounting.** A challenge escrows exactly the configured bond; a
   resolution sweeps the whole vault (donations included) to the winner; a
   rejected challenge pays the treasury. Tests:
   `challenge_escrows_exact_bond`, `resolve_upheld_refunds_challenger_exactly`,
   `resolve_rejected_forfeits_bond_to_treasury`,
   `challenge_is_not_blocked_by_vault_donation`.
5. **Capability slashing.** Penalties are bounded; a partial slash must leave
   the vault rent-exempt; a full slash drains it. Tests:
   `slash_validates_penalty_and_authority`,
   `slash_leaving_below_rent_exempt_is_rejected`, `slash_full_drains_vault_and_zeroes_bond`.
6. **Liveness.** A challenger can reclaim a bond after 90 days. Tests:
   `cancel_challenge_after_timeout_refunds_the_challenger` and friends.
   Index capacity is reusable: `index_capacity_is_released_by_withdrawal`.
7. **Authority lifecycle.** Initialization requires the program upgrade
   authority (`programdata.rs`, property-tested); admin handover is two-step
   (`admin_transfer_is_two_step_and_swaps_authority`).
8. **Client contract stability.** Sizes, account and event discriminators, and
   the discovery memcmp offset are pinned in `tests/layout.rs`.
9. **Score correctness.** `compute_score` has five proptest invariants plus
   example boundaries; the SDK computes an identical value and the on-chain
   `get_score` return data is decoded in tests.

## Where to look hardest

- `programdata.rs`: hand-rolled parsing of loader metadata. Prove the 45-byte
  layout against `solana_loader_v3_interface::UpgradeableLoaderState` and the
  bincode option encoding. The property tests only check self-consistency; the
  `fuzz/programdata` target explores arbitrary byte layouts.
- `resolve_challenge` / `cancel_challenge`: vault sweeping and destination
  constraints.
- `slash_capability`: the partial-vs-full penalty boundary and rent checks.
- `register_capability` + `withdraw_capability_bond`: index mutation
  (`Vec<Pubkey>` retain) and account close ordering.
- Arithmetic: `checked_add` on counters, `saturating_sub` and shift caps in
  `compute_score`, `checked_sub` in slashing.

## Known limitations (accepted in v0.1)

- Centralized resolution: a dishonest admin/certifier can invert outcomes.
  Bonds never move to an attacker-chosen destination, but reputation can be
  wrong. See `docs/threat-model.md` §5.
- Self-attested work is not verified on-chain; the benchmark publishes how
  cheaply this can be farmed (`docs/methodology.md`).
- One challenge per completion; no re-challenge after rejection or cancellation.
- The program is upgradeable; the authority belongs in a multisig before
  mainnet (`docs/mainnet-checklist.md`).
- `ProgramData` parsing rejects immutable programs (no upgrade authority), so
  `initialize_config` cannot run after authority revocation.

## Reporting

Private reports: GitHub Security Advisories (see `SECURITY.md`). Include the
commit hash, a reproduction (test or transaction), and impact. Please do not
open public issues for security problems.
