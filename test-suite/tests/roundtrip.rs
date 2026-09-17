//! Borsh round-trip properties for every account struct.
//!
//! The SDK and indexers decode these accounts with Borsh using the field order
//! in the IDL. These tests prove that any value the program can store survives
//! a serialize/deserialize round-trip unchanged and that serialized payloads
//! always fit the precomputed `INIT_SPACE` (i.e. the `#[max_len]` bounds are
//! actually sufficient).

use anchor_lang::prelude::Pubkey;
use anchor_lang::Space;
use borsh::{BorshDeserialize, BorshSerialize};
use proptest::prelude::*;

use ::taop_reputation::state::{
    Agent, Capability, Challenge, Completion, Config, PendingAdmin, MAX_URI_LEN,
};

fn pubkey() -> impl Strategy<Value = Pubkey> {
    proptest::array::uniform32(any::<u8>()).prop_map(Pubkey::new_from_array)
}

fn uri() -> impl Strategy<Value = String> {
    proptest::string::string_regex(&format!("[ -~]{{0,{MAX_URI_LEN}}}")).unwrap()
}

fn bytes32() -> impl Strategy<Value = [u8; 32]> {
    proptest::array::uniform32(any::<u8>())
}

proptest! {
    #[test]
    fn config_round_trips(
        admin in pubkey(),
        certifier in pubkey(),
        treasury in pubkey(),
        challenge_bond_lamports in any::<u64>(),
        decay_period_secs in any::<i64>(),
        paused in any::<bool>(),
        next_completion_id in any::<u64>(),
        next_capability_id in any::<u64>(),
        bump in any::<u8>(),
    ) {
        let account = Config {
            admin,
            certifier,
            treasury,
            challenge_bond_lamports,
            decay_period_secs,
            paused,
            next_completion_id,
            next_capability_id,
            bump,
        };
        let bytes = borsh::to_vec(&account).unwrap();
        prop_assert!(bytes.len() <= Config::INIT_SPACE);
        let decoded = Config::try_from_slice(&bytes).unwrap();
        prop_assert_eq!(decoded.admin, account.admin);
        prop_assert_eq!(decoded.certifier, account.certifier);
        prop_assert_eq!(decoded.treasury, account.treasury);
        prop_assert_eq!(decoded.challenge_bond_lamports, account.challenge_bond_lamports);
        prop_assert_eq!(decoded.decay_period_secs, account.decay_period_secs);
        prop_assert_eq!(decoded.paused, account.paused);
        prop_assert_eq!(decoded.next_completion_id, account.next_completion_id);
        prop_assert_eq!(decoded.next_capability_id, account.next_capability_id);
        prop_assert_eq!(decoded.bump, account.bump);
    }

    #[test]
    fn agent_round_trips(
        authority in pubkey(),
        completions in any::<u64>(),
        disputes in any::<u64>(),
        last_activity in any::<i64>(),
        metadata_uri in uri(),
        bump in any::<u8>(),
    ) {
        let account = Agent {
            authority,
            completions,
            disputes,
            last_activity,
            metadata_uri,
            bump,
        };
        let bytes = borsh::to_vec(&account).unwrap();
        prop_assert!(bytes.len() <= Agent::INIT_SPACE);
        let decoded = Agent::try_from_slice(&bytes).unwrap();
        prop_assert_eq!(decoded.authority, account.authority);
        prop_assert_eq!(decoded.completions, account.completions);
        prop_assert_eq!(decoded.disputes, account.disputes);
        prop_assert_eq!(decoded.last_activity, account.last_activity);
        prop_assert_eq!(decoded.metadata_uri, account.metadata_uri);
        prop_assert_eq!(decoded.bump, account.bump);
    }

    #[test]
    fn completion_round_trips(
        id in any::<u64>(),
        agent in pubkey(),
        task_type in bytes32(),
        result_uri in uri(),
        timestamp in any::<i64>(),
        challenged in any::<bool>(),
        disputed in any::<bool>(),
        bump in any::<u8>(),
    ) {
        let account = Completion {
            id,
            agent,
            task_type,
            result_uri,
            timestamp,
            challenged,
            disputed,
            bump,
        };
        let bytes = borsh::to_vec(&account).unwrap();
        prop_assert!(bytes.len() <= Completion::INIT_SPACE);
        let decoded = Completion::try_from_slice(&bytes).unwrap();
        prop_assert_eq!(decoded.id, account.id);
        prop_assert_eq!(decoded.agent, account.agent);
        prop_assert_eq!(decoded.task_type, account.task_type);
        prop_assert_eq!(decoded.result_uri, account.result_uri);
        prop_assert_eq!(decoded.timestamp, account.timestamp);
        prop_assert_eq!(decoded.challenged, account.challenged);
        prop_assert_eq!(decoded.disputed, account.disputed);
        prop_assert_eq!(decoded.bump, account.bump);
    }

    #[test]
    fn challenge_round_trips(
        completion in pubkey(),
        challenger in pubkey(),
        evidence_uri in uri(),
        timestamp in any::<i64>(),
        resolved in any::<bool>(),
        upheld in any::<bool>(),
        bond_lamports in any::<u64>(),
        bump in any::<u8>(),
    ) {
        let account = Challenge {
            completion,
            challenger,
            evidence_uri,
            timestamp,
            resolved,
            upheld,
            bond_lamports,
            bump,
        };
        let bytes = borsh::to_vec(&account).unwrap();
        prop_assert!(bytes.len() <= Challenge::INIT_SPACE);
        let decoded = Challenge::try_from_slice(&bytes).unwrap();
        prop_assert_eq!(decoded.completion, account.completion);
        prop_assert_eq!(decoded.challenger, account.challenger);
        prop_assert_eq!(decoded.evidence_uri, account.evidence_uri);
        prop_assert_eq!(decoded.timestamp, account.timestamp);
        prop_assert_eq!(decoded.resolved, account.resolved);
        prop_assert_eq!(decoded.upheld, account.upheld);
        prop_assert_eq!(decoded.bond_lamports, account.bond_lamports);
        prop_assert_eq!(decoded.bump, account.bump);
    }

    #[test]
    fn capability_round_trips(
        id in any::<u64>(),
        creator in pubkey(),
        capability_type in bytes32(),
        metadata_uri in uri(),
        bond_remaining in any::<u64>(),
        certified in any::<bool>(),
        slashed in any::<bool>(),
        active in any::<bool>(),
        bump in any::<u8>(),
    ) {
        let account = Capability {
            id,
            creator,
            capability_type,
            metadata_uri,
            bond_remaining,
            certified,
            slashed,
            active,
            bump,
        };
        let bytes = borsh::to_vec(&account).unwrap();
        prop_assert!(bytes.len() <= Capability::INIT_SPACE);
        let decoded = Capability::try_from_slice(&bytes).unwrap();
        prop_assert_eq!(decoded.id, account.id);
        prop_assert_eq!(decoded.creator, account.creator);
        prop_assert_eq!(decoded.capability_type, account.capability_type);
        prop_assert_eq!(decoded.metadata_uri, account.metadata_uri);
        prop_assert_eq!(decoded.bond_remaining, account.bond_remaining);
        prop_assert_eq!(decoded.certified, account.certified);
        prop_assert_eq!(decoded.slashed, account.slashed);
        prop_assert_eq!(decoded.active, account.active);
        prop_assert_eq!(decoded.bump, account.bump);
    }

    #[test]
    fn pending_admin_round_trips(new_admin in pubkey(), bump in any::<u8>()) {
        let account = PendingAdmin { new_admin, bump };
        let bytes = borsh::to_vec(&account).unwrap();
        prop_assert!(bytes.len() <= PendingAdmin::INIT_SPACE);
        let decoded = PendingAdmin::try_from_slice(&bytes).unwrap();
        prop_assert_eq!(decoded.new_admin, account.new_admin);
        prop_assert_eq!(decoded.bump, account.bump);
    }
}
