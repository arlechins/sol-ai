use anchor_lang::prelude::*;

/// Maximum byte length of any URI field stored on-chain (result, evidence, metadata).
pub const MAX_URI_LEN: usize = 200;

/// Maximum number of capability pointers kept in one capability-type index.
pub const CAP_INDEX_CAPACITY: usize = 64;

/// Protocol-level configuration. Single PDA: seeds = ["config"].
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Authority allowed to update config, set the certifier, and resolve challenges.
    pub admin: Pubkey,
    /// Authority allowed to certify and slash capabilities and resolve challenges.
    pub certifier: Pubkey,
    /// Lamport destination for forfeited challenge bonds and slashed capability bonds.
    pub treasury: Pubkey,
    /// Exact bond required to challenge a completion (lamports).
    pub challenge_bond_lamports: u64,
    /// Inactivity decay period in seconds (default 30 days). Score halves every full period.
    pub decay_period_secs: i64,
    /// When true, attestations, challenges, and capability registrations are rejected.
    pub paused: bool,
    /// Monotonic global completion id (first id is 1).
    pub next_completion_id: u64,
    /// Monotonic global capability id (first id is 1).
    pub next_capability_id: u64,
    pub bump: u8,
}

/// Per-agent reputation state. PDA: seeds = ["agent", authority].
#[account]
#[derive(InitSpace)]
pub struct Agent {
    /// Signing authority that owns this agent identity.
    pub authority: Pubkey,
    /// Number of self-attested completions.
    pub completions: u64,
    /// Number of upheld disputes (fraudulent completions).
    pub disputes: u64,
    /// Unix timestamp of the most recent attestation (used for decay).
    pub last_activity: i64,
    /// Optional profile URI (JSON metadata, e.g. IPFS).
    #[max_len(MAX_URI_LEN)]
    pub metadata_uri: String,
    pub bump: u8,
}

/// A self-attested completion. PDA: seeds = ["completion", agent, seq_le].
#[account]
#[derive(InitSpace)]
pub struct Completion {
    /// Global completion id (monotonic, starts at 1).
    pub id: u64,
    /// Agent that self-attested.
    pub agent: Pubkey,
    /// 32-byte task type tag (e.g. sha256 of a canonical string).
    pub task_type: [u8; 32],
    /// URI of the result/evidence bundle.
    #[max_len(MAX_URI_LEN)]
    pub result_uri: String,
    /// Unix timestamp of the attestation.
    pub timestamp: i64,
    /// True once a challenge has been submitted against this completion.
    pub challenged: bool,
    /// True if a challenge was upheld (completion proven fraudulent).
    pub disputed: bool,
    pub bump: u8,
}

/// A fraud challenge against one completion. PDA: seeds = ["challenge", completion].
#[account]
#[derive(InitSpace)]
pub struct Challenge {
    /// Completion being challenged.
    pub completion: Pubkey,
    /// Challenger that posted the bond.
    pub challenger: Pubkey,
    /// URI of the fraud evidence.
    #[max_len(MAX_URI_LEN)]
    pub evidence_uri: String,
    /// Unix timestamp of the challenge.
    pub timestamp: i64,
    /// True once resolved.
    pub resolved: bool,
    /// True if the challenge was upheld.
    pub upheld: bool,
    /// Bond escrowed in the challenge vault (lamports).
    pub bond_lamports: u64,
    pub bump: u8,
}

/// A registered capability with a slashable bond. PDA: seeds = ["capability", type, creator, seq_le].
#[account]
#[derive(InitSpace)]
pub struct Capability {
    /// Global capability id (monotonic, starts at 1).
    pub id: u64,
    /// Agent that registered (and bonded) the capability.
    pub creator: Pubkey,
    /// 32-byte capability type tag (e.g. sha256 of "LoRA").
    pub capability_type: [u8; 32],
    /// URI of the capability metadata / card.
    #[max_len(MAX_URI_LEN)]
    pub metadata_uri: String,
    /// Remaining slashable bond (lamports).
    pub bond_remaining: u64,
    /// True once certified by the certifier.
    pub certified: bool,
    /// True once slashed at least once.
    pub slashed: bool,
    /// False after the bond has been withdrawn; discovery ignores inactive capabilities.
    pub active: bool,
    pub bump: u8,
}

/// Append-only index of capabilities per type. PDA: seeds = ["cap-index", capability_type].
#[account]
pub struct CapabilityIndex {
    pub capability_type: [u8; 32],
    pub capabilities: Vec<Pubkey>,
    pub bump: u8,
}

impl CapabilityIndex {
    pub const SPACE: usize = 8 + 32 + 4 + (32 * CAP_INDEX_CAPACITY) + 1;
}

/// Return payload of `get_score` (Anchor serializes instruction return values as return data).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ScoreView {
    pub completions: u64,
    pub disputes: u64,
    pub score: u64,
    pub last_activity: i64,
    pub decayed: bool,
}

/// v0.1 score = max(0, completions - disputes), halved for every full decay period of
/// inactivity, capped at 63 halvings. Mirrors `ReputationOracleNetwork.getSelfAttestScore`.
pub fn compute_score(
    completions: u64,
    disputes: u64,
    last_activity: i64,
    now: i64,
    decay_period_secs: i64,
) -> (u64, bool) {
    let net = completions.saturating_sub(disputes);
    if net == 0 || last_activity <= 0 || decay_period_secs <= 0 {
        return (net, false);
    }
    let elapsed = now.saturating_sub(last_activity);
    if elapsed <= decay_period_secs {
        return (net, false);
    }
    let mut halvings = (elapsed / decay_period_secs) as u32;
    if halvings > 63 {
        halvings = 63;
    }
    (net >> halvings, true)
}

#[cfg(test)]
mod tests {
    use super::compute_score;

    const PERIOD: i64 = 30 * 24 * 60 * 60;

    #[test]
    fn no_decay_within_one_period() {
        assert_eq!(compute_score(10, 0, 100, 100 + PERIOD, PERIOD), (10, false));
        assert_eq!(compute_score(10, 0, 100, 100, PERIOD), (10, false));
    }

    #[test]
    fn halves_every_full_period_past_the_first() {
        assert_eq!(
            compute_score(10, 0, 100, 100 + PERIOD + 1, PERIOD),
            (5, true)
        );
        assert_eq!(
            compute_score(10, 0, 100, 100 + 2 * PERIOD + 1, PERIOD),
            (2, true)
        );
        assert_eq!(
            compute_score(10, 0, 100, 100 + 3 * PERIOD + 1, PERIOD),
            (1, true)
        );
        assert_eq!(
            compute_score(10, 0, 100, 100 + 4 * PERIOD + 1, PERIOD),
            (0, true)
        );
    }

    #[test]
    fn halvings_are_capped_at_63() {
        let now = 100 + 500 * PERIOD;
        assert_eq!(compute_score(u64::MAX, 0, 100, now, PERIOD), (1, true));
    }

    #[test]
    fn disputes_clamp_score_to_zero() {
        assert_eq!(compute_score(1, 1, 100, 100, PERIOD), (0, false));
        assert_eq!(
            compute_score(1, 5, 100, 100 + 10 * PERIOD, PERIOD),
            (0, false)
        );
    }

    #[test]
    fn defensive_inputs_do_not_decay() {
        assert_eq!(
            compute_score(10, 0, 0, 100 + 99 * PERIOD, PERIOD),
            (10, false)
        );
        assert_eq!(compute_score(10, 0, 100, 100 + 99 * PERIOD, 0), (10, false));
    }

    mod properties {
        use super::*;
        use proptest::prelude::*;

        prop_compose! {
            fn inputs()(
                completions in 0u64..1_000_000,
                disputes in 0u64..1_000_000,
                last_activity in 0i64..10_000_000_000,
                elapsed in 0i64..100_000_000_000,
                period in 1i64..10_000_000,
            ) -> (u64, u64, i64, i64, i64) {
                (completions, disputes, last_activity, last_activity.saturating_add(elapsed), period)
            }
        }

        proptest! {
            #[test]
            fn score_never_exceeds_net(
                (completions, disputes, last_activity, now, period) in inputs()
            ) {
                let (score, _decayed) =
                    compute_score(completions, disputes, last_activity, now, period);
                prop_assert!(score <= completions.saturating_sub(disputes));
                prop_assert!(score <= completions);
            }

            #[test]
            fn more_completions_never_lower_the_score(
                (completions, disputes, last_activity, now, period) in inputs(),
                extra in 0u64..1_000_000,
            ) {
                let (base, _) =
                    compute_score(completions, disputes, last_activity, now, period);
                let (more, _) = compute_score(
                    completions.saturating_add(extra),
                    disputes,
                    last_activity,
                    now,
                    period,
                );
                prop_assert!(more >= base);
            }

            #[test]
            fn score_is_non_increasing_over_time(
                (completions, disputes, last_activity, now, period) in inputs(),
                later in 0i64..1_000_000_000,
            ) {
                let future = now.saturating_add(later);
                let (before, _) =
                    compute_score(completions, disputes, last_activity, now, period);
                let (after, _) =
                    compute_score(completions, disputes, last_activity, future, period);
                prop_assert!(after <= before);
            }

            #[test]
            fn no_decay_within_one_period(
                (completions, disputes, last_activity, now, period) in inputs()
            ) {
                let within = last_activity.saturating_add(period);
                let (score, decayed) =
                    compute_score(completions, disputes, last_activity, within, period);
                let net = completions.saturating_sub(disputes);
                if last_activity > 0 && net > 0 {
                    prop_assert_eq!(score, net);
                    prop_assert!(!decayed);
                }
            }

            #[test]
            fn score_reaches_zero_after_enough_inactivity(
                (completions, disputes, last_activity, now, period) in inputs()
            ) {
                let far = last_activity.saturating_add(period.saturating_mul(80));
                let (score, decayed) =
                    compute_score(completions, disputes, last_activity, far, period);
                prop_assert_eq!(score, 0);
                prop_assert_eq!(decayed, completions > disputes && last_activity > 0);
                void(now);
            }
        }

        fn void(_value: i64) {}
    }
}
