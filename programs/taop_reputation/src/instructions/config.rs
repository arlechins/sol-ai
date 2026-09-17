use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer as system_transfer, Transfer};

use crate::errors::TaopError;
use crate::events::{
    AdminTransferProposed, AdminTransferred, CertifierUpdated, ConfigInitialized, ConfigUpdated,
};
use crate::state::{Config, PendingAdmin, MAX_DECAY_PERIOD_SECS};

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
    /// ProgramData PDA of this program. Seeding binds it to this program and
    /// `assert_upgrade_authority` reads the metadata directly (the typed
    /// `ProgramData` account would pull a bincode/serde dependency into the
    /// program for no runtime benefit).
    /// CHECK: owner, address, and upgrade authority are validated manually.
    #[account(
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = anchor_lang::solana_program::bpf_loader_upgradeable::ID,
        owner = anchor_lang::solana_program::bpf_loader_upgradeable::ID,
    )]
    pub program_data: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_config(
    ctx: Context<InitializeConfig>,
    certifier: Pubkey,
    challenge_bond_lamports: u64,
    decay_period_secs: i64,
) -> Result<()> {
    assert_upgrade_authority(&ctx.accounts.program_data, &ctx.accounts.admin.key())?;

    let rent = Rent::get()?;
    require!(
        challenge_bond_lamports >= rent.minimum_balance(0),
        TaopError::BondBelowRentExempt
    );
    require!(decay_period_secs > 0, TaopError::InvalidDecayPeriod);
    require!(
        decay_period_secs <= MAX_DECAY_PERIOD_SECS,
        TaopError::DecayPeriodTooLong
    );
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
        require!(
            period <= MAX_DECAY_PERIOD_SECS,
            TaopError::DecayPeriodTooLong
        );
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

/// UpgradeableLoaderState::ProgramData bincode layout:
/// `[u32 tag = 3][u64 slot][u8 option][32-byte authority]` followed by the ELF.
/// Parsed by hand to avoid linking bincode into the program.
const PROGRAMDATA_TAG: u32 = 3;
const PROGRAMDATA_METADATA_LEN: usize = 4 + 8 + 1 + 32;
const AUTHORITY_PRESENT: u8 = 1;

fn assert_upgrade_authority(program_data: &UncheckedAccount, admin: &Pubkey) -> Result<()> {
    let data = program_data.try_borrow_data()?;
    require!(
        data.len() >= PROGRAMDATA_METADATA_LEN,
        TaopError::InvalidAuthority
    );
    let tag = u32::from_le_bytes(
        data[0..4]
            .try_into()
            .map_err(|_| TaopError::InvalidAuthority)?,
    );
    require!(tag == PROGRAMDATA_TAG, TaopError::InvalidAuthority);
    // An immutable program (no upgrade authority) cannot prove a deployer, so
    // config initialization is rejected rather than left open to anyone.
    require!(data[12] == AUTHORITY_PRESENT, TaopError::InvalidAuthority);
    let authority_bytes: [u8; 32] = data[13..45]
        .try_into()
        .map_err(|_| TaopError::InvalidAuthority)?;
    let authority = Pubkey::new_from_array(authority_bytes);

    require_keys_eq!(authority, *admin, TaopError::Unauthorized);
    Ok(())
}

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + PendingAdmin::INIT_SPACE,
        seeds = [b"pending-admin"],
        bump
    )]
    pub pending: Account<'info, PendingAdmin>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Propose an admin handover (admin only). The proposal is not effective until
/// the proposed key accepts it with `accept_admin`, so a typo cannot brick the
/// admin role.
pub fn transfer_admin(ctx: Context<TransferAdmin>, new_admin: Pubkey) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.admin.key(),
        ctx.accounts.config.admin,
        TaopError::Unauthorized
    );
    require!(new_admin != Pubkey::default(), TaopError::InvalidAuthority);

    let pending = &mut ctx.accounts.pending;
    pending.new_admin = new_admin;
    pending.bump = ctx.bumps.pending;

    emit!(AdminTransferProposed {
        current_admin: ctx.accounts.config.admin,
        new_admin,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = new_admin,
        seeds = [b"pending-admin"],
        bump = pending.bump,
        constraint = pending.new_admin == new_admin.key() @ TaopError::Unauthorized
    )]
    pub pending: Account<'info, PendingAdmin>,
    #[account(mut)]
    pub new_admin: Signer<'info>,
}

/// Accept a pending admin handover. Only the proposed key can accept; the
/// pending account is closed and its rent refunded to the new admin.
pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
    let previous_admin = ctx.accounts.config.admin;
    let new_admin = ctx.accounts.new_admin.key();
    ctx.accounts.config.admin = new_admin;

    emit!(AdminTransferred {
        previous_admin,
        new_admin,
    });
    Ok(())
}
