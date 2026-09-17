use anchor_lang::prelude::*;

use crate::errors::TaopError;
use crate::events::{CertifierUpdated, ConfigInitialized, ConfigUpdated};
use crate::state::Config;

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: lamport destination for forfeited/slashed bonds; only stored and paid to.
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_config(
    ctx: Context<InitializeConfig>,
    certifier: Pubkey,
    challenge_bond_lamports: u64,
    decay_period_secs: i64,
) -> Result<()> {
    let rent = Rent::get()?;
    require!(
        challenge_bond_lamports >= rent.minimum_balance(0),
        TaopError::BondBelowRentExempt
    );
    require!(decay_period_secs > 0, TaopError::InvalidDecayPeriod);
    require!(
        ctx.accounts.treasury.key() != Pubkey::default(),
        TaopError::Unauthorized
    );

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.certifier = certifier;
    config.treasury = ctx.accounts.treasury.key();
    config.challenge_bond_lamports = challenge_bond_lamports;
    config.decay_period_secs = decay_period_secs;
    config.paused = false;
    config.next_completion_id = 1;
    config.next_capability_id = 1;
    config.bump = ctx.bumps.config;

    emit!(ConfigInitialized {
        admin: config.admin,
        certifier: config.certifier,
        treasury: config.treasury,
        challenge_bond_lamports: config.challenge_bond_lamports,
        decay_period_secs: config.decay_period_secs,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

pub fn update_config(
    ctx: Context<UpdateConfig>,
    challenge_bond_lamports: Option<u64>,
    decay_period_secs: Option<i64>,
    paused: Option<bool>,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.admin.key(),
        ctx.accounts.config.admin,
        TaopError::Unauthorized
    );

    let rent = Rent::get()?;
    let config = &mut ctx.accounts.config;
    if let Some(bond) = challenge_bond_lamports {
        require!(
            bond >= rent.minimum_balance(0),
            TaopError::BondBelowRentExempt
        );
        config.challenge_bond_lamports = bond;
    }
    if let Some(period) = decay_period_secs {
        require!(period > 0, TaopError::InvalidDecayPeriod);
        config.decay_period_secs = period;
    }
    if let Some(p) = paused {
        config.paused = p;
    }

    emit!(ConfigUpdated {
        challenge_bond_lamports: config.challenge_bond_lamports,
        decay_period_secs: config.decay_period_secs,
        paused: config.paused,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SetCertifier<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

pub fn set_certifier(ctx: Context<SetCertifier>, certifier: Pubkey) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.admin.key(),
        ctx.accounts.config.admin,
        TaopError::Unauthorized
    );
    let config = &mut ctx.accounts.config;
    config.certifier = certifier;

    emit!(CertifierUpdated { certifier });
    Ok(())
}
