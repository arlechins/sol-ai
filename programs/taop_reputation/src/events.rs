use anchor_lang::prelude::*;

#[event]
pub struct ConfigInitialized {
    pub admin: Pubkey,
    pub certifier: Pubkey,
    pub treasury: Pubkey,
    pub challenge_bond_lamports: u64,
    pub decay_period_secs: i64,
}

#[event]
pub struct ConfigUpdated {
    pub challenge_bond_lamports: u64,
    pub decay_period_secs: i64,
    pub paused: bool,
}

#[event]
pub struct CertifierUpdated {
    pub certifier: Pubkey,
}

#[event]
pub struct AdminTransferProposed {
    pub current_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct AdminTransferred {
    pub previous_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct AgentRegistered {
    pub agent: Pubkey,
    pub authority: Pubkey,
    pub metadata_uri: String,
}

#[event]
pub struct CompletionAttested {
    pub agent: Pubkey,
    pub completion: Pubkey,
    pub completion_id: u64,
    pub task_type: [u8; 32],
    pub result_uri: String,
}

#[event]
pub struct ChallengeSubmitted {
    pub completion: Pubkey,
    pub challenger: Pubkey,
    pub evidence_uri: String,
    pub bond_lamports: u64,
}

#[event]
pub struct ChallengeResolved {
    pub completion: Pubkey,
    pub upheld: bool,
    pub bond_lamports: u64,
    /// Total lamports moved out of the vault (bond plus unsolicited deposits).
    pub swept_lamports: u64,
}

#[event]
pub struct CapabilityRegistered {
    pub capability: Pubkey,
    pub creator: Pubkey,
    pub capability_id: u64,
    pub capability_type: [u8; 32],
    pub bond_lamports: u64,
    pub metadata_uri: String,
}

#[event]
pub struct CapabilityCertified {
    pub capability: Pubkey,
    pub certifier: Pubkey,
}

#[event]
pub struct CapabilitySlashed {
    pub capability: Pubkey,
    pub penalty_lamports: u64,
    pub bond_remaining: u64,
}

#[event]
pub struct BondWithdrawn {
    pub capability: Pubkey,
    pub creator: Pubkey,
    pub amount_lamports: u64,
}
