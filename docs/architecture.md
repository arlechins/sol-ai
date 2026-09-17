# TAOP on Solana — Architecture

This document describes the v0.1 on-chain mechanism implemented by the
`taop_reputation` Anchor program (`8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE`)
and how its accounts, PDAs, and bonds fit together.

Source of truth: `programs/taop_reputation/src/`, the generated IDL at
`target/idl/taop_reputation.json`, and the LiteSVM tests under
`test-suite/tests/`.

## 1. The v0.1 mechanism

The program is a minimal, self-contained "credit bureau for AI agents":

1. **Self-attested completions.** An agent (any funded keypair) calls
   `attest_completion` to record that it finished a task. There is no
   third-party verification at attestation time; the chain only records
   `{ task_type: [u8; 32], result_uri, timestamp }` plus a monotonic id.
2. **Native-SOL bonded challenges.** Anyone may call `challenge_completion`
   against an attested completion, posting the exact bond configured in
   `Config.challenge_bond_lamports`. The bond is escrowed in a system-owned
   vault PDA. A completion can be challenged at most once, ever.
3. **Admin/certifier resolution.** A pending challenge is resolved only by the
   configured `admin` or `certifier` through `resolve_challenge(upheld)`:
   - `upheld = true` — the challenge proved fraud: the challenger's bond is
     refunded, `Completion.disputed` is set, and `Agent.disputes` increments.
   - `upheld = false` — the challenge failed: the bond is forfeited to
     `Config.treasury`.
4. **Score with inactivity decay.** `Agent` stores `completions`, `disputes`,
   and `last_activity`. Score is computed at read time:

   ```text
   net      = max(0, completions - disputes)
   elapsed  = now - last_activity
   halvings = 0                          if net == 0, last_activity <= 0,
                                         decay_period_secs <= 0, or elapsed <= decay_period_secs
   halvings = min(63, elapsed / decay_period_secs)   otherwise
   score    = net >> halvings
   ```

   In other words: **score = max(0, completions - disputes)**, with one full
   decay period of grace, after which the score is halved for every full
   period of inactivity (up to 63 halvings). The SDK and examples use 30 days
   (`2_592_000` seconds, `DEFAULT_DECAY_PERIOD_SECS`); the value is a config
   parameter set at `initialize_config` and is never stored per-agent.

Score is **not stored on-chain**. `get_score` is a read-only instruction that
returns a `ScoreView` via Anchor instruction return data, so clients read it by
simulating the instruction. The TypeScript SDK mirrors the identical formula in
`computeScore()` for local reads.

### Lifecycle

```text
register_agent(metadata_uri)                     permissionless
        |
attest_completion(task_type, result_uri, seq)    permissionless, pause-gated
        |
challenge_completion(evidence_uri)               permissionless, posts the bond
        |                                        exactly once per completion
resolve_challenge(upheld)                        admin or certifier only
        |
get_score / getScore (view)                      decay applied at read time
```

## 2. Account model

| Account | PDA seeds | Purpose |
| --- | --- | --- |
| `Config` | `["config"]` | Protocol singleton: admin, certifier, treasury, challenge bond, decay period, pause flag, id counters. |
| `Agent` | `["agent", authority]` | Per-authority reputation: completions, disputes, last activity, profile URI. |
| `Completion` | `["completion", authority, seq_le]` | One self-attested completion per sequence number (0-based). |
| `Challenge` | `["challenge", completion]` | One fraud challenge per completion; persists after resolution. |
| `ChallengeVault` | `["challenge_vault", completion]` | System-owned lamport escrow for the challenge bond. |
| `Capability` | `["capability", capability_type, creator, id_le]` | Bonded capability record; closed when the creator withdraws. |
| `CapabilityVault` | `["capability_vault", capability]` | System-owned lamport escrow for the capability bond. |
| `CapabilityIndex` | `["cap-index", capability_type]` | Append-only list of capability addresses per type, capped at 64. |

Notes:

- `ChallengeVault` and `CapabilityVault` are **not** Anchor data accounts.
  They are zero-data, system-owned PDAs that hold only lamports
  (see section 4).
- `Completion.agent` stores the signing authority's public key, the same key
  used as the second PDA seed for the completion (the `Agent` PDA, by
  contrast, is derived from that authority).
- `Challenge` accounts are never closed. After resolution they remain with
  `resolved = true` and `upheld` set, which permanently pins the
  one-challenge-per-completion rule.
- `Capability` is closed by `withdraw_capability_bond` (`close = creator`), and
  its vault is drained to zero and purged; the `CapabilityIndex` entry for it
  remains as a stale pointer and discovery must skip closed accounts.

### PDA seed schemes (exact)

```text
config             = ["config"]
agent              = ["agent", authority]
completion         = ["completion", authority, u64_le(seq)]         # seq is 0-based
challenge          = ["challenge", completion]
challenge_vault    = ["challenge_vault", completion]
capability         = ["capability", capability_type[32], creator, u64_le(id)]   # id is 1-based
capability_vault   = ["capability_vault", capability]
capability_index   = ["cap-index", capability_type[32]]
```

All multi-byte seeds are little-endian. The TypeScript SDK exposes the same
derivations through `createPdas(programId)` (`packages/solana/src/pda.ts`).

### ID counters

- `Config.next_completion_id` starts at 1 and increments on every attestation;
  the value is stored in `Completion.id`. The PDA sequence seed is separate and
  is always `Agent.completions` at attest time (`0`, `1`, `2`, ...).
  `attest_completion` fails with `InvalidCompletionSeq` if the supplied
  sequence does not match the agent's current count.
- `Config.next_capability_id` starts at 1 and increments on every successful
  registration. `register_capability` fails with `InvalidCapabilityId` if the
  caller passes anything other than the exact next id, so ids are global and
  cannot be skipped or replayed.

## 3. Capabilities

`register_capability(capability_type, metadata_uri, capability_id, bond_lamports)`
transfers `bond_lamports` from the creator into the `capability_vault` PDA and
writes a `Capability` record:

- `bond_lamports > 0` and `>= Rent::minimum_balance(0)` (`ZeroBond`,
  `BondBelowRentExempt`).
- `certified` starts `false`; only `admin` or `certifier` can call
  `certify_capability` to set it `true` (and `certify` requires the record to
  be active).
- `slash_capability(penalty_lamports)` moves slashed lamports to the treasury.
  A partial slash must leave `bond_remaining >= Rent::minimum_balance(0)` or it
  fails with `InvalidPenalty`; slashing the entire remaining bond drains the
  vault and zeroes the bond.
- `withdraw_capability_bond` (creator only) returns the entire remaining vault
  balance, marks the record inactive, and closes the `Capability` account.
  A fully slashed bond cannot be withdrawn (`BondStillSlashed`).

### The index cap of 64

Each capability type has one `CapabilityIndex` account holding a
`Vec<Pubkey>` with capacity `CAP_INDEX_CAPACITY = 64`
(`space = 8 + 32 + 4 + 32*64 + 1 = 2093` bytes, precomputed as
`CapabilityIndex::SPACE`). When the list already holds 64 entries,
`register_capability` fails with `IndexFull` (6013). Consequences:

- The index is **pruned on withdrawal**: `withdraw_capability_bond` removes the
  pointer before closing the record, so capacity is reclaimed and a full index
  cannot be used to block new registrations.
- Discovery clients should still tolerate missing accounts (defensive against
  partially applied reads) and filter by `active`/`slashed`/`certified`. When
  the index account does not exist at
  all, the SDK falls back to a `getProgramAccounts` scan filtered by
  `capability_type` (memcmp at offset `8 + 8 + 32`).

## 4. Bond custody model

All value movement goes through the Solana System program; the program never
mutates lamports directly (there is no `try_borrow_mut_lamports` anywhere):

- **Deposits** use `anchor_lang::system_program::transfer` with a plain
  `CpiContext::new(...)`:
  - `challenge_completion` transfers exactly `Config.challenge_bond_lamports`
    from the challenger to the challenge vault. Any lamports already sitting in
    the vault (unsolicited deposits) are left in place and handled by the
    resolution sweep below.
  - `register_capability` transfers the caller-specified bond into the
    capability vault.
- **Withdrawals** use `transfer` with `CpiContext::new_with_signer(...)` and
  the vault's own PDA seeds, so the program can sign for the system-owned
  vault:
  - `resolve_challenge` **sweeps the entire vault balance** to the challenger
    (`upheld`) or to the treasury (not upheld). The recorded bond is paid out
    exactly on top of any unsolicited deposits, so donations are never stranded
    and cannot block a challenge.
  - `slash_capability` transfers the penalty (or the drained vault balance
    when the remaining bond becomes zero) to the treasury.
  - `withdraw_capability_bond` transfers the full vault balance to the
    creator.

Because vaults are system-owned accounts with zero data, they are subject to
normal system-account rules:

- The **rent-exempt minimum for an empty account** is
  `Rent::minimum_balance(0)` (890,880 lamports with the standard mainnet rent
  parameters; the tests read it with `env.rent_min()`).
- A new account cannot be created below the rent-exempt minimum, so the
  smallest possible donation to an uninitialized vault is
  `Rent::minimum_balance(0)`. `docs/account-layout.md` documents how donations
  are swept.
- A vault that has been drained to **0 lamports is purged** by the runtime.
  The tests assert that challenge vaults and capability vaults do not exist
  after full resolution/withdrawal.
- The **treasury** is an ordinary account (not a vault) that receives forfeited
  challenge bonds and slashed capability bonds. `initialize_config` funds it
  with `Rent::minimum_balance(0)` so that any later payout, however small, can
  be credited without hitting the rent check that applies when creating a new
  account. A 1-lamport slash is covered by
  `treasury_is_funded_at_init_and_accepts_micro_slashes`.
- `Challenge.bond_lamports` is the authoritative record of the escrowed bond;
  `resolve_challenge` requires the vault balance to be `>= bond_lamports`
  before sweeping it, and emits both `bond_lamports` and `swept_lamports` in
  `ChallengeResolved`.

The bond invariants are covered by
`test-suite/tests/invariants.rs` (conservation, payout caps,
vault lifecycle) and `test-suite/tests/security.rs` (donation
sweeps in both outcomes, substituted recipients, unauthorized privileged
operations, re-initialization attempts).

## 5. Authority and trust model

| Authority | Powers | Set by |
| --- | --- | --- |
| `admin` | `update_config` (bond, decay, pause), `set_certifier`, `transfer_admin`/`accept_admin`, `resolve_challenge` | Becomes admin when calling `initialize_config`; rotatable via the two-step transfer |
| `certifier` | `resolve_challenge`, `certify_capability`, `slash_capability` | `initialize_config` arg, rotatable by admin via `set_certifier` |
| `treasury` | Receives forfeited challenge bonds and slashed capability bonds | `initialize_config` arg; **immutable afterwards** (no instruction updates it) |

Trust assumptions in v0.1:

- Attestations are **self-attested and permissionless**. There is no gate on
  `register_agent`, and no gate on `attest_completion` other than the pause
  flag and the sequence check. The program does not verify the result URI or
  the task type.
- Dispute resolution is **centralized**: exactly one admin key and one
  certifier key decide whether a challenge is upheld. Both keys are checked by
  public key equality against `Config`; the admin can rotate the certifier, but
  there is no in-program path to rotate the admin or the treasury. Treat the
  admin key as the root of trust of a deployment.
- The admin/certifier should not be the same key as the deployer's hot wallet.
  There is no staking, jury, or voting mechanism for resolution.
- **Config initialization is gated by the program upgrade authority.** The
  `program_data` account is bound to this program by PDA seeds and its
  `upgrade_authority_address` must equal the admin signer, so nobody can
  front-run a fresh deployment and claim the admin role.
- **Admin rotation is two-step.** `transfer_admin` names a successor and
  `accept_admin` must be signed by that key, so a typo cannot brick the role.
  The pending proposal lives in its own PDA (`["pending-admin"]`) to avoid
  touching the `Config` layout.
- **The decay period is capped at 366 days** so a fat-fingered config cannot
  disable decay entirely (`DecayPeriodTooLong`).
- Because challenge bonds are refunded on upheld results, challengers are not
  compensated beyond the refund; there is no reward parameter.
- `resolve_challenge` cannot be called on a resolved challenge
  (`ChallengeNotPending`) and cannot be called against a completion that was
  never challenged.

### Program upgrade authority

The program is deployed through the Solana BPF loader; upgradeability is owned
by the **program upgrade authority** (normally the deployer keypair, i.e. the
provider wallet from `Anchor.toml`). That is a separate control plane from
`Config.admin`:

- Upgrading the code is done with the standard Solana CLI
  (`anchor upgrade` / `solana program deploy`); the program itself has no
  upgrade instruction and no timelock.
- Recommended production posture: move the upgrade authority to a multisig
  (for example a Squads vault), keep `admin` and `certifier` on separate
  operational keys, and store the treasury key offline. Solana has no
  Timelock contract equivalent to the Base deployment; any delay must be
  enforced operationally by the multisig, not by the program.
- The `Anchor.toml` toolchain pins Anchor `1.1.2`, and CI builds with Solana
  CLI `4.2.2` (`SOLANA_VERSION`) — keep the toolchain pinned to avoid IDL and
  `declare_program!` incompatibilities.

## 6. Pause semantics

`update_config(..., paused = true)` (admin only) sets `Config.paused`. The flag
is checked at the top of exactly three instructions:

- `attest_completion` → `Paused`
- `challenge_completion` → `Paused`
- `register_capability` → `Paused`

Everything else keeps working while paused: `register_agent`,
`get_score`, `resolve_challenge`, `certify_capability`, `slash_capability`,
`withdraw_capability_bond`, `update_config`, and `set_certifier`. Pausing is
therefore an incident brake on *new* reputation claims and new bonds, not a
freeze on settlement, configuration, or reads. Unpausing restores all three
instructions.

## 7. Events

The program emits events for every state transition (defined in
`src/events.rs`): `ConfigInitialized`, `ConfigUpdated`, `CertifierUpdated`,
`AgentRegistered`, `CompletionAttested`, `ChallengeSubmitted`,
`ChallengeResolved`, `CapabilityRegistered`, `CapabilityCertified`,
`CapabilitySlashed`, and `BondWithdrawn`. Indexers can rebuild the full history
of completions, challenges, and bonds from these events without scanning
accounts.

## 8. Known limitations and v2 ideas

v0.1 intentionally ships a small, auditable trust loop. The current gaps:

- **No verifier set.** Disputes are resolved by one admin/certifier key rather
  than a staked verifier set or oracle network.
- **No optimistic resolution.** There is no challenge window and no automatic
  settlement. A challenge stays pending until an authority resolves it; after
  `CHALLENGE_TIMEOUT_SECS` (90 days) the challenger can reclaim the bond with
  `cancel_challenge`, but a completion can never be challenged a second time.
- **No NFT/SPL representation of capabilities.** Unlike the Base registry,
  capabilities on Solana are plain PDAs with a `metadata_uri`, not minted
  tokens. There is no secondary market, transfer, or ownership beyond the
  creator key.
- **Append-only discovery index, capped at 64 per type.** Capacity is never
  reclaimed, so a busy type can become unregistrable until v2 adds pruning,
  pagination, or a different index structure.
- **Immutable treasury.** `Config.treasury` cannot be rotated without an
  upgrade.
- **Score is not stored.** `get_score` must be simulated (or mirrored
  off-chain) to read the decayed score; there is no score field on `Agent` and
  no event on decay.
- **Self-attested completions.** There is no task escrow, no result
  verification, and no bond on attestation itself.
- **No bond top-ups or re-bonding.** Capability bonds can only be slashed
  down or withdrawn; a partially slashed capability cannot be topped back up.

Natural v2 directions: a permissionless verifier/jury set with staked votes,
challenge windows with optimistic escalation, an NFT (Token-2022/metaplex)
capability registry with transferable bonds, index pruning/pagination, and an
on-chain score cache updated on attestation/resolution.
