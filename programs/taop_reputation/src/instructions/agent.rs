use anchor_lang::prelude::*;

use crate::errors::TaopError;
use crate::events::AgentRegistered;
use crate::state::{Agent, MAX_URI_LEN};

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Agent::INIT_SPACE,
        seeds = [b"agent", authority.key().as_ref()],
        bump
    )]
    pub agent: Account<'info, Agent>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Register a new agent identity or update the profile metadata of an existing one.
pub fn register_agent(ctx: Context<RegisterAgent>, metadata_uri: String) -> Result<()> {
    require!(metadata_uri.len() <= MAX_URI_LEN, TaopError::UriTooLong);

    let agent = &mut ctx.accounts.agent;
    if agent.authority == Pubkey::default() {
        agent.authority = ctx.accounts.authority.key();
    }
    agent.metadata_uri = metadata_uri.clone();
    agent.bump = ctx.bumps.agent;

    emit!(AgentRegistered {
        agent: agent.key(),
        authority: agent.authority,
        metadata_uri,
    });
    Ok(())
}
