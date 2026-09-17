# Account Layout Reference

Byte-precise reference for every account created by the `taop_reputation`
program. All sizes below are derived from `programs/taop_reputation/src/state.rs`
and match the Anchor `InitSpace` derive (plus the 8-byte account discriminator
added by `#[account]`).

Primitive sizes used throughout:

| Type | Serialized size |
| --- | --- |
| `Pubkey` | 32 |
| `u64` | 8 |
| `i64` | 8 |
| `bool` | 1 |
| `u8` | 1 |
| `[u8; 32]` | 32 |
| `String` with `#[max_len(200)]` | 4 (length prefix) + 200 = 204 |
| `Vec<Pubkey>` capped at 64 | 4 (length prefix) + 32 × 64 = 2052 |

Global limits from `state.rs`:

- `MAX_URI_LEN = 200` — every `String` field on-chain is capped at 200 bytes
  (`UriTooLong`).
- `CAP_INDEX_CAPACITY = 64` — maximum pointers in one `CapabilityIndex`.

The account space formula used in every `init` / `init_if_needed` constraint is:

```text
space = 8 + <Account>::INIT_SPACE
```

where 8 is the Anchor discriminator (`sha256("account:<Name>")[0..8]`).
`CapabilityIndex` is the one exception: it does not derive `InitSpace` and uses
the precomputed `CapabilityIndex::SPACE`, which already includes the
discriminator.

## Config

- **PDA seeds:** `["config"]` — a single protocol-wide account.
- **Account space:** `8 + Config::INIT_SPACE = 8 + 130 = 138` bytes.
- **Discriminator:** `[155, 12, 170, 224, 30, 250, 204, 130]`

| Field | Rust type | Bytes |
| --- | --- | --- |
| `admin` | `Pubkey` | 32 |
| `certifier` | `Pubkey` | 32 |
| `treasury` | `Pubkey` | 32 |
| `challenge_bond_lamports` | `u64` | 8 |
| `decay_period_secs` | `i64` | 8 |
| `paused` | `bool` | 1 |
| `next_completion_id` | `u64` | 8 |
| `next_capability_id` | `u64` | 8 |
| `bump` | `u8` | 1 |
| **Total `INIT_SPACE`** | | **130** |

Created once by `initialize_config`. `next_completion_id` and
`next_capability_id` both start at 1. `treasury` cannot be changed after init.

## Agent

- **PDA seeds:** `["agent", authority]`.
- **Account space:** `8 + Agent::INIT_SPACE = 8 + 261 = 269` bytes.
- **Discriminator:** `[47, 166, 112, 147, 155, 197, 86, 7]`

| Field | Rust type | Bytes |
| --- | --- | --- |
| `authority` | `Pubkey` | 32 |
| `completions` | `u64` | 8 |
| `disputes` | `u64` | 8 |
| `last_activity` | `i64` | 8 |
| `metadata_uri` | `String` (`#[max_len(200)]`) | 204 |
| `bump` | `u8` | 1 |
| **Total `INIT_SPACE`** | | **261** |

Created lazily with `init_if_needed` by `register_agent` **or** on the first
`attest_completion`. On creation, `authority` is set from the signer; on later
`register_agent` calls only `metadata_uri` changes. `last_activity` is the
timestamp of the most recent attestation and drives decay.

## Completion

- **PDA seeds:** `["completion", authority, u64_le(seq)]` where `seq` is the
  agent's 0-based completion sequence.
- **Account space:** `8 + Completion::INIT_SPACE = 8 + 287 = 295` bytes.
- **Discriminator:** `[122, 228, 30, 216, 217, 48, 88, 215]`

| Field | Rust type | Bytes |
| --- | --- | --- |
| `id` | `u64` | 8 |
| `agent` | `Pubkey` | 32 |
| `task_type` | `[u8; 32]` | 32 |
| `result_uri` | `String` (`#[max_len(200)]`) | 204 |
| `timestamp` | `i64` | 8 |
| `challenged` | `bool` | 1 |
| `disputed` | `bool` | 1 |
| `bump` | `u8` | 1 |
| **Total `INIT_SPACE`** | | **287** |

`id` is the 1-based global id taken from `Config.next_completion_id`; the PDA
seed `seq` is the 0-based per-agent sequence and must equal
`Agent.completions` at attest time. `agent` stores the signing authority (not
the `Agent` PDA). `challenged` is set on the first challenge and never cleared;
`disputed` is set only when a challenge is upheld.

## Challenge

- **PDA seeds:** `["challenge", completion]` — at most one challenge per
  completion, forever.
- **Account space:** `8 + Challenge::INIT_SPACE = 8 + 287 = 295` bytes.
- **Discriminator:** `[119, 250, 161, 121, 119, 81, 22, 208]`

| Field | Rust type | Bytes |
| --- | --- | --- |
| `completion` | `Pubkey` | 32 |
| `challenger` | `Pubkey` | 32 |
| `evidence_uri` | `String` (`#[max_len(200)]`) | 204 |
| `timestamp` | `i64` | 8 |
| `resolved` | `bool` | 1 |
| `upheld` | `bool` | 1 |
| `bond_lamports` | `u64` | 8 |
| `bump` | `u8` | 1 |
| **Total `INIT_SPACE`** | | **287** |

Created by `challenge_completion` with `init_if_needed` after checking
`!Completion.challenged`. The account is **not closed** after resolution; it
remains with `resolved = true` and `upheld` set. `bond_lamports` is the exact
bond the challenger transferred into the challenge vault; because deposits are
permissionless, the vault may also hold unsolicited lamports, which are swept on
resolution (see "Vault accounting" below).

## Capability

- **PDA seeds:** `["capability", capability_type(32 bytes), creator, u64_le(id)]`
  where `id` is the 1-based global capability id.
- **Account space:** `8 + Capability::INIT_SPACE = 8 + 288 = 296` bytes.
- **Discriminator:** `[192, 140, 41, 92, 236, 64, 181, 99]`

| Field | Rust type | Bytes |
| --- | --- | --- |
| `id` | `u64` | 8 |
| `creator` | `Pubkey` | 32 |
| `capability_type` | `[u8; 32]` | 32 |
| `metadata_uri` | `String` (`#[max_len(200)]`) | 204 |
| `bond_remaining` | `u64` | 8 |
| `certified` | `bool` | 1 |
| `slashed` | `bool` | 1 |
| `active` | `bool` | 1 |
| `bump` | `u8` | 1 |
| **Total `INIT_SPACE`** | | **288** |

`id` must equal `Config.next_capability_id` at registration. `bond_remaining`
tracks the un-slashed part of the bond; it is set to 0 by a full slash and by
withdrawal. `active` is set to `false` immediately before the account is closed
by `withdraw_capability_bond` (`close = creator`), so any observer that still
holds the address sees a closed account instead of a stale active record.

## CapabilityIndex

- **PDA seeds:** `["cap-index", capability_type(32 bytes)]`.
- **Account space:** `CapabilityIndex::SPACE = 2093` bytes (already includes the
  8-byte discriminator).
- **Discriminator:** `[128, 66, 99, 20, 133, 90, 103, 111]`

```
SPACE = 8 + 32 + 4 + (32 * CAP_INDEX_CAPACITY) + 1
      = 8 + 32 + 4 + 2048 + 1
      = 2093
```

| Field | Rust type | Bytes |
| --- | --- | --- |
| `capability_type` | `[u8; 32]` | 32 |
| `capabilities` | `Vec<Pubkey>` (max 64) | 2052 |
| `bump` | `u8` | 1 |
| Anchor discriminator | | 8 |
| **Total** | | **2093** |

Created lazily by `register_capability` with `init_if_needed`. On the first
registration for a type the zero `capability_type` is filled in with the real
type and the bump is stored. The list is append-only and never pruned; a 65th
registration fails with `IndexFull`, even if earlier entries were withdrawn.

## Vault accounts

Two PDAs hold bonded lamports. They are **system-owned accounts with zero data
bytes** — no Anchor discriminator, no fields, no rent-exempt data rent. The
`SystemAccount` type is used only to prove the address; balances are read with
`lamports()` and moved with System program transfers.

| Vault | PDA seeds | Holds |
| --- | --- | --- |
| Challenge vault | `["challenge_vault", completion]` | The challenge bond for one completion, plus any unsolicited lamports (swept on resolution). |
| Capability vault | `["capability_vault", capability]` | The remaining capability bond for one capability, plus any unsolicited lamports (paid to the creator on withdrawal). |

Rules:

- **Rent-exempt minimum.** The minimum for a zero-data system account is
  `Rent::minimum_balance(0)` (890,880 lamports under the standard mainnet rent
  parameters; the tests call `env.rent_min()`). A vault at **0 lamports is
  purged** by the runtime, and a new account cannot be created below the
  rent-exempt minimum (so the smallest donation to a fresh vault is
  `Rent::minimum_balance(0)`).
- **Challenge deposits** transfer exactly `Config.challenge_bond_lamports` into
  the vault regardless of its current balance; unsolicited lamports are
  permitted.
- **Challenge payouts sweep the entire vault balance** to the challenger
  (upheld) or the treasury (rejected); the vault ends at 0 and is purged. The
  `ChallengeResolved` event records the recorded bond (`bond_lamports`) and the
  total swept amount (`swept_lamports`).
- **Capability partial slash:** with `penalty < bond_remaining`, the remaining
  bond must be `>= rent.minimum_balance(0)` or the instruction fails with
  `InvalidPenalty`; the penalty is transferred and the vault stays rent-exempt.
- **Capability full slash:** when the penalty equals the whole remaining bond,
  the vault is drained to 0 and purged (the `Capability` record stays with
  `bond_remaining = 0` and `slashed = true`).
- **Capability withdrawal:** the creator receives the entire vault balance
  (which may include any lamports in excess of `bond_remaining`), the vault is
  purged, and the `Capability` account is closed (`close = creator`), refunding
  its rent to the creator.

## Instruction-to-accounts matrix

All 12 instructions in IDL order. `w` = writable, `s` = signer. Accounts
marked PDA are constrained by Anchor seeds; the rest are supplied by the
caller. `system_program` is always the System program
(`11111111111111111111111111111111`) and never signs.

### 1. `initialize_config(certifier: Pubkey, challenge_bond_lamports: u64, decay_period_secs: i64)`

| # | Account | w | s | Notes |
| --- | --- | --- | --- | --- |
| 1 | `config` | w | | PDA `["config"]`, `init` |
| 2 | `admin` | w | s | Payer; becomes `Config.admin` |
| 3 | `treasury` | w | | Destination for forfeited/slashed bonds; funded with the rent-exempt minimum at init |
| 4 | `system_program` | | | |

### 2. `update_config(challenge_bond_lamports: Option<u64>, decay_period_secs: Option<i64>, paused: Option<bool>)`

| # | Account | w | s | Notes |
| --- | --- | --- | --- | --- |
| 1 | `config` | w | | PDA `["config"]` |
| 2 | `admin` | | s | Must equal `Config.admin` |

### 3. `set_certifier(certifier: Pubkey)`

| # | Account | w | s | Notes |
| --- | --- | --- | --- | --- |
| 1 | `config` | w | | PDA `["config"]` |
| 2 | `admin` | | s | Must equal `Config.admin` |

### 4. `register_agent(metadata_uri: String)`

| # | Account | w | s | Notes |
| --- | --- | --- | --- | --- |
| 1 | `agent` | w | | PDA `["agent", authority]`, `init_if_needed` |
| 2 | `authority` | w | s | Payer and owner |
| 3 | `system_program` | | | |

### 5. `attest_completion(task_type: [u8; 32], result_uri: String, completion_seq: u64)`

| # | Account | w | s | Notes |
| --- | --- | --- | --- | --- |
| 1 | `config` | w | | PDA `["config"]`; pause flag + id counter |
| 2 | `agent` | w | | PDA `["agent", authority]`, `init_if_needed` |
| 3 | `completion` | w | | PDA `["completion", authority, seq_le]`, `init` |
| 4 | `authority` | w | s | Payer |
| 5 | `system_program` | | | |

### 6. `challenge_completion(evidence_uri: String)`

| # | Account | w | s | Notes |
| --- | --- | --- | --- | --- |
| 1 | `config` | | | PDA `["config"]`; bond amount + pause flag |
| 2 | `completion` | w | | Must not already be challenged |
| 3 | `challenge` | w | | PDA `["challenge", completion]`, `init_if_needed` |
| 4 | `challenge_vault` | w | | PDA `["challenge_vault", completion]`; must be empty |
| 5 | `challenger` | w | s | Payer of the bond |
| 6 | `system_program` | | | |

### 7. `resolve_challenge(upheld: bool)`

| # | Account | w | s | Notes |
| --- | --- | --- | --- | --- |
| 1 | `config` | | | PDA `["config"]` |
| 2 | `completion` | w | | Constrained to `challenge.completion` |
| 3 | `agent` | w | | PDA `["agent", completion.agent]` |
| 4 | `challenge` | w | | PDA `["challenge", completion]` |
| 5 | `challenge_vault` | w | | PDA `["challenge_vault", completion]` |
| 6 | `challenger` | w | | Constrained to `challenge.challenger` |
| 7 | `treasury` | w | | Constrained to `config.treasury` |
| 8 | `authority` | w | s | Must equal admin or certifier |
| 9 | `system_program` | | | |

### 8. `get_score() -> ScoreView`

| # | Account | w | s | Notes |
| --- | --- | --- | --- | --- |
| 1 | `config` | | | PDA `["config"]` |
| 2 | `agent` | | | Any agent account |

Read-only; returns `ScoreView { completions, disputes, score, last_activity, decayed }`
as instruction return data.

### 9. `register_capability(capability_type: [u8; 32], metadata_uri: String, capability_id: u64, bond_lamports: u64)`

| # | Account | w | s | Notes |
| --- | --- | --- | --- | --- |
| 1 | `config` | w | | PDA `["config"]`; pause flag + id counter |
| 2 | `index` | w | | PDA `["cap-index", capability_type]`, `init_if_needed` |
| 3 | `capability` | w | | PDA `["capability", type, creator, id_le]`, `init` |
| 4 | `capability_vault` | w | | PDA `["capability_vault", capability]` |
| 5 | `creator` | w | s | Payer of bond and rent |
| 6 | `system_program` | | | |

### 10. `certify_capability()`

| # | Account | w | s | Notes |
| --- | --- | --- | --- | --- |
| 1 | `config` | | | PDA `["config"]` |
| 2 | `capability` | w | | Must be active |
| 3 | `authority` | | s | Must equal admin or certifier |

### 11. `slash_capability(penalty_lamports: u64)`

| # | Account | w | s | Notes |
| --- | --- | --- | --- | --- |
| 1 | `config` | | | PDA `["config"]` |
| 2 | `capability` | w | | Must be active; penalty <= `bond_remaining` |
| 3 | `capability_vault` | w | | PDA `["capability_vault", capability]` |
| 4 | `treasury` | w | | Constrained to `config.treasury` |
| 5 | `authority` | | s | Must equal admin or certifier |
| 6 | `system_program` | | | |

### 12. `withdraw_capability_bond()`

| # | Account | w | s | Notes |
| --- | --- | --- | --- | --- |
| 1 | `config` | | | PDA `["config"]` |
| 2 | `capability` | w | | Has one `creator`; closed (`close = creator`) |
| 3 | `capability_vault` | w | | PDA `["capability_vault", capability]`; fully drained |
| 4 | `creator` | w | s | Must equal `capability.creator` |
| 5 | `system_program` | | | |

## Rent and bond summary

| Item | Rule | Error |
| --- | --- | --- |
| Challenge bond at init/update | `>= Rent::minimum_balance(0)` | `BondBelowRentExempt` |
| Decay period | `> 0` | `InvalidDecayPeriod` |
| Capability bond | `> 0` and `>= Rent::minimum_balance(0)` | `ZeroBond`, `BondBelowRentExempt` |
| Partial slash | `bond_remaining - penalty >= Rent::minimum_balance(0)` (or penalty == full bond) | `InvalidPenalty` |
| Penalty | `0 < penalty <= bond_remaining` | `ZeroBond`, `PenaltyExceedsBond` |
| Vault balance vs records | challenge: `>= Challenge.bond_lamports` before the resolution sweep; capability: `>= Capability.bond_remaining` | `VaultBalanceMismatch` |
| Zero treasury or certifier | rejected in `initialize_config` and `set_certifier` | `InvalidAuthority` |
