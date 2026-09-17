# Threat model

Scope: the `taop_reputation` Anchor program, the `@taopp/solana` SDK, the
`@taopp/mcp-server`, and the on-chain state they manage. This model is
adversarial: it assumes public mempools, permissionless callers, and
participants who will exploit any economic or implementation weakness.

## 1. Assets

| Asset | Where it lives | Loss impact |
|---|---|---|
| Challenge bonds (native SOL) | `challenge_vault` PDAs | Challenger loses escrow |
| Capability bonds (native SOL) | `capability_vault` PDAs | Creator loses slashable capital |
| Forfeited / slashed lamports | `treasury` account | Community funds misdirected |
| Reputation state | `Agent`, `Completion`, `Challenge` accounts | Rankings corrupted, trust lost |
| Capability certifications | `Capability` accounts + type index | Wrong agents selected |
| Authority keys | Operator custody (admin, certifier, upgrade authority) | Full protocol compromise |
| Signer keys | SDK / MCP consumers | Key theft, unauthorized writes |

## 2. Actors and trust boundaries

| Actor | Trusted for | Not trusted for |
|---|---|---|
| Agent | Signing its own attestations | Truthfulness of `result_uri` |
| Challenger | Posting a bond | Honest evidence (bond prices lying) |
| Admin | Config, certifier rotation, resolution | Not to resolve dishonestly |
| Certifier | Resolution, certification, slashing | Not to certify/slash dishonestly |
| Treasury key | Receiving funds | Not to spend arbitrarily (it can) |
| Griefer | Nothing | Everything: spam, donations, grief attempts |
| RPC provider | Transport | Correctness (clients verify signatures) |

Trust boundaries:

1. **Program ↔ chain**: accounts are validated by Anchor constraints and PDA
   seeds; nothing outside the program's accounts is trusted.
2. **Program ↔ authorities**: the resolver is centralized in v0.1. A malicious
   admin or certifier can resolve challenges in either direction and slash
   capabilities. This is the documented root of trust (`docs/architecture.md`).
3. **Program ↔ upgrade authority**: the program is upgradeable. Whoever holds
   the upgrade authority can replace the code entirely. Mainnet plans transfer
   this to a multisig (see `docs/vps-runbook.md` equivalents for the runbook).
4. **SDK/MCP ↔ consumer keys**: the libraries sign with caller-provided keys;
   they never generate or transmit keys.
5. **Off-chain evidence**: `result_uri` and `evidence_uri` are opaque strings.
   The program does not fetch or verify them.

## 3. Attack surface and mitigations

| Threat | Vector | Mitigation | Test evidence |
|---|---|---|---|
| Unauthorized resolution | Random signer calls `resolve_challenge` | `admin`/`certifier` equality check | `privileged_operations_reject_non_authority` |
| Unauthorized certification or slashing | Random signer calls `certify_capability` / `slash_capability` | Same authority checks | same test |
| Certifier bricking | Admin sets certifier to the zero pubkey | `InvalidAuthority` guard in `set_certifier` | `set_certifier_rejects_zero_pubkey` |
| Config bricking | Zero treasury / certifier at init | `InvalidAuthority` guards | `zero_pubkeys_are_rejected_for_authorities` |
| Account substitution | Attacker passes a different agent/challenger/treasury account | PDA seed constraints and `address =` constraints | `resolve_rejects_substituted_*`, `resolve_rejects_wrong_agent_account` |
| Re-initialization | Attacker tries to claim an existing agent or challenge | PDA seeds bind to the signer; `init_if_needed` preserves existing records | `attacker_cannot_reinitialize_an_existing_agent` |
| Double challenge | Second bond posted for one completion | `challenged` constraint + account existence | `challenge_rejects_double_challenge` |
| Griefing via donations | Attacker pre-funds a vault to block challenges or strand funds | Deposits allowed; resolution **sweeps the whole vault** to the winner | `challenge_is_not_blocked_by_vault_donation`, `rejected_challenge_sweeps_donations_to_treasury` |
| Micro-payout failure | First payout below rent-exempt minimum cannot create the treasury account | `initialize_config` funds the treasury with the rent-exempt minimum | `treasury_is_funded_at_init_and_accepts_micro_slashes` |
| Partial-slash below rent | Slash leaves a vault below rent-exempt and unspendable | `InvalidPenalty` unless the slash drains the vault | `slash_leaving_below_rent_exempt_is_rejected` |
| Integer overflow | Counters or penalties overflow | `checked_add` / `saturating_sub`, capped decay shifts | property tests, `halvings_are_capped_at_63` |
| Score gaming by timing | Attacker attests to reset decay before a harvest | Decay only reduces inactivity; harvest size must be bonded | benchmark slow-burn scenario (published weakness) |
| Sequence confusion | Wrong `completion_seq` or capability id | Typed errors before state writes | `attest_rejects_wrong_sequence`, `register_capability_rejects_invalid_inputs` |
| URI-storage abuse | Oversized URIs exhaust account space | `#[max_len(200)]` + explicit length checks | `uri_length_boundary_is_exact` |
| CPI reentrancy | Program CPIs to the System program only | No external program callbacks; no self-CPI | code review + CU budgets |
| Compute exhaustion | Instruction blows the CU limit | CU budgets asserted ~3x observed usage | `instructions_stay_within_compute_budgets` |
| Supply-chain compromise | Malicious dependency or action | `cargo audit`, `pnpm audit --audit-level high`, Dependabot, dependency review on PRs, third-party actions pinned to SHAs | CI jobs |

## 4. Economic assumptions

- A challenge is only rational if the expected refund/reward exceeds fees and
  opportunity cost. v0.1 has **no challenger reward**; challengers are made
  whole but not paid. This weakens Sybil resistance and is published as a
  measured weakness (`docs/methodology.md`).
- A capability bond only protects counterparties up to its size. The benchmark
  shows 0.005 SOL covers 0.1% of a 5 SOL harvest.
- Bonds are native SOL; there is no protocol token and no fee switch, so there
  is no token-manipulation surface.

## 5. Residual risks (accepted in v0.1)

1. **Centralized resolution.** A dishonest admin/certifier can invert outcomes.
   Mitigation path: optimistic resolution with bonded watchers (v2).
2. **Upgrade authority.** The code can be replaced. Mitigation: multisig
   authority and a published runbook before mainnet.
3. **Unverified attestations.** Self-attested work is not checked on-chain.
   Mitigation path: interaction-grounded attestations with counterparty
   diversity weighting.
4. **One challenge per completion, no timeout.** A rejected challenge cannot be
   re-opened, and a pending challenge blocks re-challenge indefinitely.
5. **Index staleness and capacity.** Withdrawing a capability leaves its pointer
   in the per-type index; a busy type can fill up (64 entries). Consumers must
   filter by account existence (the SDK does). Pinned by
   `stale_index_entries_are_detectable_after_withdrawal`.
6. **Public RPC metadata.** Reads reveal which agents a client queries. No
   privacy guarantees are made.
7. **Client-side key handling.** The SDK/MCP assume the operator protects keys;
   they cannot defend against a compromised host.

## 6. Out of scope

- Off-chain coercion or legal process against the operator.
- Denial of service at the network/RPC layer.
- The correctness of evidence stored behind `result_uri` / `evidence_uri`.
- Wallet-standard integrations (this repository ships headless libraries).

## 7. Verifying the mitigations

```bash
cargo test --workspace          # 71 tests incl. tests/hardening.rs and security.rs
./scripts/check.sh              # full pre-flight, incl. audits and benchmark baseline
```

Report vulnerabilities privately via GitHub Security Advisories; see
`SECURITY.md`.
