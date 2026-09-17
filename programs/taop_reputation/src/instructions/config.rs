use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer as system_transfer, Transfer};

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
    /// CHECK: lamport destination for forfeited/slashed bonds; funded with the
    /// rent-exempt minimum here so that later micro-payouts can create the account.
    #[account(mut)]
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
    require!(certifier != Pubkey::default(), TaopError::InvalidAuthority);
    require!(
        ctx.accounts.treasury.key() != Pubkey::default(),
        TaopError::InvalidAuthority
    );

    // Fund the treasury with the rent-exempt minimum so that small forfeitures
    // and micro-slashes can always be paid out (a first payout below the
    // rent-exempt minimum would otherwise fail to create the account).
    system_transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.admin.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        ),
        rent.minimum_balance(0),
    )?;

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
    require!(certifier != Pubkey::default(), TaopError::InvalidAuthority);
    let config = &mut ctx.accounts.config;
    config.certifier = certifier;

    emit!(CertifierUpdated { certifier });
    Ok(())
}
