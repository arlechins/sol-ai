#![allow(clippy::too_many_arguments)]

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
use instructions::*;

declare_id!("8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE");

/// TAOP reputation program for Solana.
///
/// v0.1 mechanism: agents self-attest completions, anyone can challenge a
/// completion with a native SOL bond, the admin/certifier resolves disputes.
/// Score = completions - disputes with inactivity decay. Capabilities are
/// registered with a slashable SOL bond and can be certified or slashed.
#[program]
pub mod taop_reputation {
    use super::*;

    /// One-time protocol configuration. The signer becomes the admin.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        certifier: Pubkey,
        challenge_bond_lamports: u64,
        decay_period_secs: i64,
    ) -> Result<()> {
        instructions::initialize_config(ctx, certifier, challenge_bond_lamports, decay_period_secs)
    }

    /// Update bond/decay/pause parameters (admin only).
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        challenge_bond_lamports: Option<u64>,
        decay_period_secs: Option<i64>,
        paused: Option<bool>,
    ) -> Result<()> {
        instructions::update_config(ctx, challenge_bond_lamports, decay_period_secs, paused)
    }

    /// Update the certifier authority (admin only).
    pub fn set_certifier(ctx: Context<SetCertifier>, certifier: Pubkey) -> Result<()> {
        instructions::set_certifier(ctx, certifier)
    }

    /// Propose an admin handover (admin only). Takes effect when the proposed
    /// key calls `accept_admin`.
    pub fn transfer_admin(ctx: Context<TransferAdmin>, new_admin: Pubkey) -> Result<()> {
        instructions::transfer_admin(ctx, new_admin)
    }

    /// Accept a pending admin handover (proposed key only).
    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        instructions::accept_admin(ctx)
    }

    /// Register an agent identity or update its profile metadata URI.
    pub fn register_agent(ctx: Context<RegisterAgent>, metadata_uri: String) -> Result<()> {
        instructions::register_agent(ctx, metadata_uri)
    }

    /// Self-attest a completed task. Creates the agent identity on first use.
    pub fn attest_completion(
        ctx: Context<AttestCompletion>,
        task_type: [u8; 32],
        result_uri: String,
        completion_seq: u64,
    ) -> Result<()> {
        instructions::attest_completion(ctx, task_type, result_uri, completion_seq)
    }

    /// Challenge a completion with the configured native SOL bond.
    pub fn challenge_completion(
        ctx: Context<ChallengeCompletion>,
        evidence_uri: String,
    ) -> Result<()> {
        instructions::challenge_completion(ctx, evidence_uri)
    }

    /// Resolve a pending challenge (admin or certifier only).
    pub fn resolve_challenge(ctx: Context<ResolveChallenge>, upheld: bool) -> Result<()> {
        instructions::resolve_challenge(ctx, upheld)
    }

    /// Read-only score view with inactivity decay applied.
    pub fn get_score(ctx: Context<GetScore>) -> Result<state::ScoreView> {
        instructions::get_score(ctx)
    }

    /// Register a capability with a slashable native SOL bond.
    pub fn register_capability(
        ctx: Context<RegisterCapability>,
        capability_type: [u8; 32],
        metadata_uri: String,
        capability_id: u64,
        bond_lamports: u64,
    ) -> Result<()> {
        instructions::register_capability(
            ctx,
            capability_type,
            metadata_uri,
            capability_id,
            bond_lamports,
        )
    }

    /// Certify a capability (admin or certifier only).
    pub fn certify_capability(ctx: Context<CertifyCapability>) -> Result<()> {
        instructions::certify_capability(ctx)
    }

    /// Slash a capability bond (admin or certifier only).
    pub fn slash_capability(ctx: Context<SlashCapability>, penalty_lamports: u64) -> Result<()> {
        instructions::slash_capability(ctx, penalty_lamports)
    }

    /// Reclaim the remaining bond and close the capability record (creator only).
    pub fn withdraw_capability_bond(ctx: Context<WithdrawCapabilityBond>) -> Result<()> {
        instructions::withdraw_capability_bond(ctx)
    }
}
