use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer as system_transfer, Transfer};

use crate::errors::TaopError;
use crate::events::{BondWithdrawn, CapabilityCertified, CapabilityRegistered, CapabilitySlashed};
use crate::state::{Capability, CapabilityIndex, Config, CAP_INDEX_CAPACITY, MAX_URI_LEN};

#[derive(Accounts)]
#[instruction(capability_type: [u8; 32], metadata_uri: String, capability_id: u64, bond_lamports: u64)]
pub struct RegisterCapability<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = creator,
        space = CapabilityIndex::SPACE,
        seeds = [b"cap-index", capability_type.as_ref()],
        bump
    )]
    pub index: Account<'info, CapabilityIndex>,
    #[account(
        init,
        payer = creator,
        space = 8 + Capability::INIT_SPACE,
        seeds = [b"capability", capability_type.as_ref(), creator.key().as_ref(), &capability_id.to_le_bytes()],
        bump
    )]
    pub capability: Account<'info, Capability>,
    /// CHECK: system-owned vault PDA escrowing the capability bond.
    #[account(mut, seeds = [b"capability_vault", capability.key().as_ref()], bump)]
    pub capability_vault: SystemAccount<'info>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Register a capability with a slashable native SOL bond.
pub fn register_capability(
    ctx: Context<RegisterCapability>,
    capability_type: [u8; 32],
    metadata_uri: String,
    capability_id: u64,
    bond_lamports: u64,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, TaopError::Paused);
    require!(metadata_uri.len() <= MAX_URI_LEN, TaopError::UriTooLong);
    require!(bond_lamports > 0, TaopError::ZeroBond);

    let rent = Rent::get()?;
    require!(
        bond_lamports >= rent.minimum_balance(0),
        TaopError::BondBelowRentExempt
    );
    require!(
        capability_id == ctx.accounts.config.next_capability_id,
        TaopError::InvalidCapabilityId
    );

    system_transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.capability_vault.to_account_info(),
            },
        ),
        bond_lamports,
    )?;

    let config = &mut ctx.accounts.config;
    let id = config.next_capability_id;
    config.next_capability_id = id.checked_add(1).ok_or(TaopError::ArithmeticOverflow)?;

    let capability = &mut ctx.accounts.capability;
    capability.id = id;
    capability.creator = ctx.accounts.creator.key();
    capability.capability_type = capability_type;
    capability.metadata_uri = metadata_uri.clone();
    capability.bond_remaining = bond_lamports;
    capability.certified = false;
    capability.slashed = false;
    capability.active = true;
    capability.bump = ctx.bumps.capability;

    let index = &mut ctx.accounts.index;
    if index.capability_type == [0u8; 32] {
        index.capability_type = capability_type;
        index.bump = ctx.bumps.index;
    }
    require!(
        index.capabilities.len() < CAP_INDEX_CAPACITY,
        TaopError::IndexFull
    );
    index.capabilities.push(capability.key());

    emit!(CapabilityRegistered {
        capability: capability.key(),
        creator: capability.creator,
        capability_id: id,
        capability_type,
        bond_lamports,
        metadata_uri,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CertifyCapability<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub capability: Account<'info, Capability>,
    pub authority: Signer<'info>,
}

/// Mark a capability as certified (admin or certifier only).
pub fn certify_capability(ctx: Context<CertifyCapability>) -> Result<()> {
    let authority = ctx.accounts.authority.key();
    require!(
        authority == ctx.accounts.config.admin || authority == ctx.accounts.config.certifier,
        TaopError::Unauthorized
    );
    require!(
        ctx.accounts.capability.active,
        TaopError::CapabilityNotActive
    );

    let capability = &mut ctx.accounts.capability;
    capability.certified = true;

    emit!(CapabilityCertified {
        capability: capability.key(),
        certifier: authority,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SlashCapability<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub capability: Account<'info, Capability>,
    /// CHECK: system-owned vault PDA escrowing the capability bond.
    #[account(mut, seeds = [b"capability_vault", capability.key().as_ref()], bump)]
    pub capability_vault: SystemAccount<'info>,
    /// CHECK: forfeit destination; constrained to the configured treasury.
    #[account(mut, address = config.treasury)]
    pub treasury: UncheckedAccount<'info>,
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Slash a creator's bond (admin or certifier only). Penalty is bounded by the
/// remaining bond; a partial slash must leave the vault rent-exempt.
pub fn slash_capability(ctx: Context<SlashCapability>, penalty_lamports: u64) -> Result<()> {
    let authority = ctx.accounts.authority.key();
    require!(
        authority == ctx.accounts.config.admin || authority == ctx.accounts.config.certifier,
        TaopError::Unauthorized
    );
    require!(
        ctx.accounts.capability.active,
        TaopError::CapabilityNotActive
    );
    require!(penalty_lamports > 0, TaopError::ZeroBond);
    require!(
        penalty_lamports <= ctx.accounts.capability.bond_remaining,
        TaopError::PenaltyExceedsBond
    );
    require!(
        ctx.accounts.capability_vault.lamports() >= ctx.accounts.capability.bond_remaining,
        TaopError::VaultBalanceMismatch
    );

    let rent = Rent::get()?;
    let remaining = ctx
        .accounts
        .capability
        .bond_remaining
        .checked_sub(penalty_lamports)
        .ok_or(TaopError::PenaltyExceedsBond)?;

    // A partial slash must leave the vault rent-exempt; slashing the full bond
    // drains and purges the vault account.
    let amount = if remaining == 0 {
        ctx.accounts.capability_vault.lamports()
    } else {
        require!(
            remaining >= rent.minimum_balance(0),
            TaopError::InvalidPenalty
        );
        penalty_lamports
    };

    let capability_key = ctx.accounts.capability.key();
    let vault_bump = [ctx.bumps.capability_vault];
    let vault_seeds: &[&[u8]] = &[b"capability_vault", capability_key.as_ref(), &vault_bump];
    system_transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.capability_vault.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
            &[vault_seeds],
        ),
        amount,
    )?;

    let capability = &mut ctx.accounts.capability;
    capability.bond_remaining = remaining;
    capability.slashed = true;

    emit!(CapabilitySlashed {
        capability: capability.key(),
        penalty_lamports: amount,
        bond_remaining: remaining,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawCapabilityBond<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, close = creator, has_one = creator)]
    pub capability: Account<'info, Capability>,
    /// CHECK: system-owned vault PDA escrowing the capability bond.
    #[account(mut, seeds = [b"capability_vault", capability.key().as_ref()], bump)]
    pub capability_vault: SystemAccount<'info>,
    /// Type index, pruned on withdrawal so closed records cannot exhaust the
    /// 64-entry capacity and block new registrations.
    #[account(
        mut,
        seeds = [b"cap-index", capability.capability_type.as_ref()],
        bump = index.bump
    )]
    pub index: Account<'info, CapabilityIndex>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Creator reclaims the remaining un-slashed bond. Closes the capability record;
/// discovery indexes may retain the stale pointer and must filter closed accounts.
pub fn withdraw_capability_bond(ctx: Context<WithdrawCapabilityBond>) -> Result<()> {
    require!(
        ctx.accounts.capability.active,
        TaopError::CapabilityNotActive
    );
    let remaining = ctx.accounts.capability.bond_remaining;
    require!(remaining > 0, TaopError::BondStillSlashed);
    require!(
        ctx.accounts.capability_vault.lamports() >= remaining,
        TaopError::VaultBalanceMismatch
    );

    let vault_balance = ctx.accounts.capability_vault.lamports();
    let capability_key = ctx.accounts.capability.key();
    let vault_bump = [ctx.bumps.capability_vault];
    let vault_seeds: &[&[u8]] = &[b"capability_vault", capability_key.as_ref(), &vault_bump];
    system_transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.capability_vault.to_account_info(),
                to: ctx.accounts.creator.to_account_info(),
            },
            &[vault_seeds],
        ),
        vault_balance,
    )?;

    let capability_key = ctx.accounts.capability.key();
    ctx.accounts
        .index
        .capabilities
        .retain(|key| *key != capability_key);

    let capability = &mut ctx.accounts.capability;
    capability.bond_remaining = 0;
    capability.active = false;

    emit!(BondWithdrawn {
        capability: capability.key(),
        creator: capability.creator,
        amount_lamports: vault_balance,
    });
    Ok(())
}
