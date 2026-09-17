use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer as system_transfer, Transfer};

use crate::errors::TaopError;
use crate::events::{
    ChallengeCancelled, ChallengeResolved, ChallengeSubmitted, CompletionAttested,
};
use crate::state::{
    compute_score, Agent, Challenge, Completion, Config, ScoreView, CHALLENGE_TIMEOUT_SECS,
    MAX_URI_LEN,
};

#[derive(Accounts)]
#[instruction(task_type: [u8; 32], result_uri: String, completion_seq: u64)]
pub struct AttestCompletion<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Agent::INIT_SPACE,
        seeds = [b"agent", authority.key().as_ref()],
        bump
    )]
    pub agent: Account<'info, Agent>,
    #[account(
        init,
        payer = authority,
        space = 8 + Completion::INIT_SPACE,
        seeds = [b"completion", authority.key().as_ref(), &completion_seq.to_le_bytes()],
        bump
    )]
    pub completion: Account<'info, Completion>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Self-attest a completed task. Creates the agent identity on first use.
pub fn attest_completion(
    ctx: Context<AttestCompletion>,
    task_type: [u8; 32],
    result_uri: String,
    completion_seq: u64,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, TaopError::Paused);
    require!(result_uri.len() <= MAX_URI_LEN, TaopError::UriTooLong);

    let agent = &mut ctx.accounts.agent;
    require!(
        completion_seq == agent.completions,
        TaopError::InvalidCompletionSeq
    );
    if agent.authority == Pubkey::default() {
        agent.authority = ctx.accounts.authority.key();
        agent.bump = ctx.bumps.agent;
    }

    let now = Clock::get()?.unix_timestamp;
    let config = &mut ctx.accounts.config;
    let id = config.next_completion_id;
    config.next_completion_id = id.checked_add(1).ok_or(TaopError::ArithmeticOverflow)?;

    agent.completions = agent
        .completions
        .checked_add(1)
        .ok_or(TaopError::ArithmeticOverflow)?;
    agent.last_activity = now;

    let completion = &mut ctx.accounts.completion;
    completion.id = id;
    completion.agent = agent.authority;
    completion.task_type = task_type;
    completion.result_uri = result_uri.clone();
    completion.timestamp = now;
    completion.challenged = false;
    completion.disputed = false;
    completion.bump = ctx.bumps.completion;

    emit!(CompletionAttested {
        agent: agent.key(),
        completion: completion.key(),
        completion_id: id,
        task_type,
        result_uri,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ChallengeCompletion<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, constraint = !completion.challenged @ TaopError::AlreadyChallenged)]
    pub completion: Account<'info, Completion>,
    #[account(
        init_if_needed,
        payer = challenger,
        space = 8 + Challenge::INIT_SPACE,
        seeds = [b"challenge", completion.key().as_ref()],
        bump
    )]
    pub challenge: Account<'info, Challenge>,
    /// CHECK: system-owned vault PDA escrowing the challenge bond.
    #[account(mut, seeds = [b"challenge_vault", completion.key().as_ref()], bump)]
    pub challenge_vault: SystemAccount<'info>,
    #[account(mut)]
    pub challenger: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Challenge a completion by posting the configured bond (native SOL transfer to the vault).
/// Unsolicited lamports sent to the vault do not block challenges; they are swept to the
/// winning destination when the challenge is resolved.
pub fn challenge_completion(ctx: Context<ChallengeCompletion>, evidence_uri: String) -> Result<()> {
    require!(!ctx.accounts.config.paused, TaopError::Paused);
    require!(evidence_uri.len() <= MAX_URI_LEN, TaopError::UriTooLong);

    let completion = &mut ctx.accounts.completion;
    require!(!completion.challenged, TaopError::AlreadyChallenged);

    let bond = ctx.accounts.config.challenge_bond_lamports;
    system_transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.challenger.to_account_info(),
                to: ctx.accounts.challenge_vault.to_account_info(),
            },
        ),
        bond,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let challenge = &mut ctx.accounts.challenge;
    challenge.completion = completion.key();
    challenge.challenger = ctx.accounts.challenger.key();
    challenge.evidence_uri = evidence_uri.clone();
    challenge.timestamp = now;
    challenge.resolved = false;
    challenge.upheld = false;
    challenge.bond_lamports = bond;
    challenge.bump = ctx.bumps.challenge;

    completion.challenged = true;

    emit!(ChallengeSubmitted {
        completion: completion.key(),
        challenger: challenge.challenger,
        evidence_uri,
        bond_lamports: bond,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ResolveChallenge<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub completion: Account<'info, Completion>,
    #[account(mut, seeds = [b"agent", completion.agent.as_ref()], bump = agent.bump)]
    pub agent: Account<'info, Agent>,
    #[account(
        mut,
        has_one = completion,
        seeds = [b"challenge", completion.key().as_ref()],
        bump = challenge.bump
    )]
    pub challenge: Account<'info, Challenge>,
    /// CHECK: system-owned vault PDA escrowing the challenge bond.
    #[account(mut, seeds = [b"challenge_vault", completion.key().as_ref()], bump)]
    pub challenge_vault: SystemAccount<'info>,
    /// CHECK: refund destination; constrained to the recorded challenger.
    #[account(mut, address = challenge.challenger)]
    pub challenger: UncheckedAccount<'info>,
    /// CHECK: forfeit destination; constrained to the configured treasury.
    #[account(mut, address = config.treasury)]
    pub treasury: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Resolve a pending challenge (admin or certifier only).
/// upheld = true  -> the vault balance (bond plus any unsolicited lamports) is
///                   refunded to the challenger; the agent dispute count increments.
/// upheld = false -> the vault balance is forfeited to the treasury.
pub fn resolve_challenge(ctx: Context<ResolveChallenge>, upheld: bool) -> Result<()> {
    let authority = ctx.accounts.authority.key();
    require!(
        authority == ctx.accounts.config.admin || authority == ctx.accounts.config.certifier,
        TaopError::Unauthorized
    );

    require!(
        !ctx.accounts.challenge.resolved,
        TaopError::ChallengeNotPending
    );
    require!(
        ctx.accounts.completion.challenged,
        TaopError::ChallengeNotPending
    );

    let recorded_bond = ctx.accounts.challenge.bond_lamports;
    // Sweep the whole vault: the recorded bond plus any lamports sent to the PDA
    // outside the program. This prevents 1-lamport griefing of challenges.
    let amount = ctx.accounts.challenge_vault.lamports();
    require!(amount >= recorded_bond, TaopError::VaultBalanceMismatch);

    let completion_key = ctx.accounts.completion.key();
    let vault_bump = [ctx.bumps.challenge_vault];
    let vault_seeds: &[&[u8]] = &[b"challenge_vault", completion_key.as_ref(), &vault_bump];
    let destination = if upheld {
        ctx.accounts.challenger.to_account_info()
    } else {
        ctx.accounts.treasury.to_account_info()
    };
    system_transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.challenge_vault.to_account_info(),
                to: destination,
            },
            &[vault_seeds],
        ),
        amount,
    )?;

    if upheld {
        ctx.accounts.completion.disputed = true;
        ctx.accounts.agent.disputes = ctx
            .accounts
            .agent
            .disputes
            .checked_add(1)
            .ok_or(TaopError::ArithmeticOverflow)?;
    }

    let challenge = &mut ctx.accounts.challenge;
    challenge.resolved = true;
    challenge.upheld = upheld;

    emit!(ChallengeResolved {
        completion: challenge.completion,
        upheld,
        bond_lamports: recorded_bond,
        swept_lamports: amount,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct GetScore<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub agent: Account<'info, Agent>,
}

/// Read-only score view with inactivity decay applied. Returns data via instruction return.
pub fn get_score(ctx: Context<GetScore>) -> Result<ScoreView> {
    let now = Clock::get()?.unix_timestamp;
    let agent = &ctx.accounts.agent;
    let (score, decayed) = compute_score(
        agent.completions,
        agent.disputes,
        agent.last_activity,
        now,
        ctx.accounts.config.decay_period_secs,
    );
    Ok(ScoreView {
        completions: agent.completions,
        disputes: agent.disputes,
        score,
        last_activity: agent.last_activity,
        decayed,
    })
}

#[derive(Accounts)]
pub struct CancelChallenge<'info> {
    #[account(mut)]
    pub completion: Account<'info, Completion>,
    #[account(
        mut,
        has_one = completion,
        seeds = [b"challenge", completion.key().as_ref()],
        bump = challenge.bump
    )]
    pub challenge: Account<'info, Challenge>,
    /// CHECK: system-owned vault PDA escrowing the challenge bond.
    #[account(mut, seeds = [b"challenge_vault", completion.key().as_ref()], bump)]
    pub challenge_vault: SystemAccount<'info>,
    /// The original challenger, and the only key allowed to cancel.
    #[account(mut, address = challenge.challenger)]
    pub challenger: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Reclaim a bond from a challenge the authority never resolved after
/// `CHALLENGE_TIMEOUT_SECS`. The challenge is marked resolved (not upheld); the
/// completion stays challenged so it cannot be re-challenged.
pub fn cancel_challenge(ctx: Context<CancelChallenge>) -> Result<()> {
    require!(
        !ctx.accounts.challenge.resolved,
        TaopError::ChallengeNotPending
    );
    require!(
        ctx.accounts.completion.challenged,
        TaopError::ChallengeNotPending
    );

    let now = Clock::get()?.unix_timestamp;
    require!(
        now.saturating_sub(ctx.accounts.challenge.timestamp) >= CHALLENGE_TIMEOUT_SECS,
        TaopError::ChallengeNotTimedOut
    );

    let amount = ctx.accounts.challenge_vault.lamports();
    let completion_key = ctx.accounts.completion.key();
    let vault_bump = [ctx.bumps.challenge_vault];
    let vault_seeds: &[&[u8]] = &[b"challenge_vault", completion_key.as_ref(), &vault_bump];
    system_transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.challenge_vault.to_account_info(),
                to: ctx.accounts.challenger.to_account_info(),
            },
            &[vault_seeds],
        ),
        amount,
    )?;

    let challenge = &mut ctx.accounts.challenge;
    challenge.resolved = true;
    challenge.upheld = false;

    emit!(ChallengeCancelled {
        completion: challenge.completion,
        challenger: challenge.challenger,
        swept_lamports: amount,
    });
    Ok(())
}
