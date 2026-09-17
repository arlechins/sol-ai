mod common;

use common::*;

#[test]
fn register_agent_and_update_metadata() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);

    env.register_agent(&agent, "ipfs://profile-v1")
        .assert_success();
    let record = env.agent(&agent.pubkey());
    assert_eq!(record.authority, agent.pubkey());
    assert_eq!(record.metadata_uri, "ipfs://profile-v1");

    env.register_agent(&agent, "ipfs://profile-v2")
        .assert_success();
    assert_eq!(env.agent(&agent.pubkey()).metadata_uri, "ipfs://profile-v2");
}

#[test]
fn register_agent_rejects_long_metadata() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let long = "x".repeat(201);
    env.register_agent(&agent, &long)
        .assert_anchor_error("UriTooLong");
}

#[test]
fn attest_creates_agent_and_completion_with_sequential_ids() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let task = task_type("summarization");

    env.attest(&agent, task, "ipfs://r0", 0).assert_success();
    env.attest(&agent, task, "ipfs://r1", 1).assert_success();
    env.attest(&agent, task, "ipfs://r2", 2).assert_success();

    let record = env.agent(&agent.pubkey());
    assert_eq!(record.completions, 3);
    assert_eq!(record.last_activity, T0);

    assert_eq!(env.completion(&agent.pubkey(), 0).id, 1);
    assert_eq!(env.completion(&agent.pubkey(), 1).id, 2);
    assert_eq!(env.completion(&agent.pubkey(), 2).id, 3);
    assert_eq!(env.completion(&agent.pubkey(), 2).result_uri, "ipfs://r2");
    assert_eq!(env.config_account().next_completion_id, 4);
}

#[test]
fn attest_preserves_registered_metadata() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    env.register_agent(&agent, "ipfs://profile")
        .assert_success();
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    assert_eq!(env.agent(&agent.pubkey()).metadata_uri, "ipfs://profile");
}

#[test]
fn attest_rejects_wrong_sequence() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 1)
        .assert_anchor_error("InvalidCompletionSeq");
}

#[test]
fn attest_rejects_long_result_uri() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let long = "x".repeat(201);
    env.attest(&agent, task_type("summarization"), &long, 0)
        .assert_anchor_error("UriTooLong");
}

#[test]
fn challenge_escrows_exact_bond() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    let completion = {
        env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
            .assert_success();
        completion_pda(&agent.pubkey(), 0)
    };

    env.challenge(&completion, &challenger, "ipfs://fraud")
        .assert_success();

    let challenge = env.challenge_account(&completion);
    assert_eq!(challenge.challenger, challenger.pubkey());
    assert_eq!(challenge.evidence_uri, "ipfs://fraud");
    assert_eq!(challenge.bond_lamports, DEFAULT_BOND);
    assert!(!challenge.resolved);
    assert!(!challenge.upheld);
    assert_eq!(
        env.lamports(&challenge_vault_pda(&completion)),
        DEFAULT_BOND
    );
    assert!(env.completion(&agent.pubkey(), 0).challenged);
}

#[test]
fn challenge_rejects_double_challenge() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    let other = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);

    env.challenge(&completion, &challenger, "ipfs://ev1")
        .assert_success();
    // The completion is already challenged: the constraint fires with a typed
    // error before account initialization, and no additional bond moves.
    env.challenge(&completion, &other, "ipfs://ev2")
        .assert_anchor_error("AlreadyChallenged");

    // The failed second challenge must not move any additional lamports into the vault.
    assert_eq!(
        env.lamports(&challenge_vault_pda(&completion)),
        DEFAULT_BOND
    );
}

#[test]
fn challenge_requires_existing_completion() {
    let mut env = setup();
    let challenger = funded(&mut env.ctx, 5);
    let fake = completion_pda(&Pubkey::new_unique(), 0);
    env.challenge(&fake, &challenger, "ipfs://ev")
        .assert_failure();
}

#[test]
fn resolve_upheld_refunds_challenger_exactly() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);
    env.challenge(&completion, &challenger, "ipfs://fraud")
        .assert_success();

    let before = env.lamports(&challenger.pubkey());
    let admin = env.admin.insecure_clone();
    env.resolve(&admin, &completion, true).assert_success();
    let after = env.lamports(&challenger.pubkey());

    // Admin paid the fee; the challenger is made whole by exactly the bond.
    assert_eq!(after - before, DEFAULT_BOND);
    assert!(env.challenge_account(&completion).resolved);
    assert!(env.challenge_account(&completion).upheld);
    assert!(env.completion(&agent.pubkey(), 0).disputed);
    assert_eq!(env.agent(&agent.pubkey()).disputes, 1);
    assert!(!env.exists(&challenge_vault_pda(&completion)));
}

#[test]
fn resolve_rejected_forfeits_bond_to_treasury() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);
    env.challenge(&completion, &challenger, "ipfs://wrong")
        .assert_success();

    let treasury_before = env.lamports(&env.treasury);
    let admin = env.admin.insecure_clone();
    env.resolve(&admin, &completion, false).assert_success();
    let treasury_after = env.lamports(&env.treasury);

    assert_eq!(treasury_after - treasury_before, DEFAULT_BOND);
    assert!(env.challenge_account(&completion).resolved);
    assert!(!env.challenge_account(&completion).upheld);
    assert!(!env.completion(&agent.pubkey(), 0).disputed);
    assert_eq!(env.agent(&agent.pubkey()).disputes, 0);
    assert!(!env.exists(&challenge_vault_pda(&completion)));
}

#[test]
fn resolve_requires_admin_or_certifier() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    let intruder = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);
    env.challenge(&completion, &challenger, "ipfs://fraud")
        .assert_success();

    env.resolve(&intruder, &completion, true)
        .assert_anchor_error("Unauthorized");
}

#[test]
fn certifier_can_resolve() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);
    env.challenge(&completion, &challenger, "ipfs://fraud")
        .assert_success();

    let certifier = env.certifier.insecure_clone();
    env.resolve(&certifier, &completion, true).assert_success();
    assert_eq!(env.agent(&agent.pubkey()).disputes, 1);
}

#[test]
fn resolve_twice_fails() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);
    env.challenge(&completion, &challenger, "ipfs://fraud")
        .assert_success();

    let admin = env.admin.insecure_clone();
    env.resolve(&admin, &completion, true).assert_success();
    env.resolve(&admin, &completion, true)
        .assert_anchor_error("ChallengeNotPending");
}

#[test]
fn resolve_requires_a_pending_challenge() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);
    let admin = env.admin.insecure_clone();
    env.resolve(&admin, &completion, true).assert_failure();
}

#[test]
fn score_is_completions_minus_disputes() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    let task = task_type("summarization");

    for seq in 0..3 {
        env.attest(&agent, task, &format!("ipfs://r{seq}"), seq)
            .assert_success();
    }
    let completion = completion_pda(&agent.pubkey(), 0);
    env.challenge(&completion, &challenger, "ipfs://fraud")
        .assert_success();
    let admin = env.admin.insecure_clone();
    env.resolve(&admin, &completion, true).assert_success();

    let score = env.get_score(&agent.pubkey());
    assert_eq!(score.completions, 3);
    assert_eq!(score.disputes, 1);
    assert_eq!(score.score, 2);
    assert!(!score.decayed);
}

#[test]
fn score_clamps_at_zero_when_disputes_exceed_completions() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);
    env.challenge(&completion, &challenger, "ipfs://fraud")
        .assert_success();
    let admin = env.admin.insecure_clone();
    env.resolve(&admin, &completion, true).assert_success();

    let score = env.get_score(&agent.pubkey());
    assert_eq!(score.completions, 1);
    assert_eq!(score.disputes, 1);
    assert_eq!(score.score, 0);
}

#[test]
fn rejected_challenge_does_not_reduce_score() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    let task = task_type("summarization");
    env.attest(&agent, task, "ipfs://r0", 0).assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);
    env.challenge(&completion, &challenger, "ipfs://wrong")
        .assert_success();
    let admin = env.admin.insecure_clone();
    env.resolve(&admin, &completion, false).assert_success();

    let score = env.get_score(&agent.pubkey());
    assert_eq!(score.completions, 1);
    assert_eq!(score.disputes, 0);
    assert_eq!(score.score, 1);
}

#[test]
fn score_halves_for_every_full_decay_period_of_inactivity() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let task = task_type("summarization");
    for seq in 0..4 {
        env.attest(&agent, task, &format!("ipfs://r{seq}"), seq)
            .assert_success();
    }

    // Exactly one period of inactivity: no decay yet.
    set_clock(&mut env.ctx, T0 + DECAY_PERIOD_SECS);
    let score = env.get_score(&agent.pubkey());
    assert_eq!(score.score, 4);
    assert!(!score.decayed);

    // One second past the period: one halving.
    set_clock(&mut env.ctx, T0 + DECAY_PERIOD_SECS + 1);
    let score = env.get_score(&agent.pubkey());
    assert_eq!(score.score, 2);
    assert!(score.decayed);

    // Two periods: two halvings.
    set_clock(&mut env.ctx, T0 + (2 * DECAY_PERIOD_SECS) + 1);
    let score = env.get_score(&agent.pubkey());
    assert_eq!(score.score, 1);

    // Three periods: three halvings → 4 >> 3 == 0.
    set_clock(&mut env.ctx, T0 + (3 * DECAY_PERIOD_SECS) + 1);
    let score = env.get_score(&agent.pubkey());
    assert_eq!(score.score, 0);
}

#[test]
fn fresh_activity_stops_decay() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let task = task_type("summarization");
    for seq in 0..4 {
        env.attest(&agent, task, &format!("ipfs://r{seq}"), seq)
            .assert_success();
    }

    set_clock(&mut env.ctx, T0 + DECAY_PERIOD_SECS + 1);
    assert_eq!(env.get_score(&agent.pubkey()).score, 2);

    // A new attestation resets last_activity and the decayed score is recomputed
    // from the full net count (4 + 1 = 5).
    env.attest(&agent, task, "ipfs://r4", 4).assert_success();
    let score = env.get_score(&agent.pubkey());
    assert_eq!(score.completions, 5);
    assert_eq!(score.score, 5);
    assert!(!score.decayed);

    // And decay resumes from the new activity timestamp.
    set_clock(
        &mut env.ctx,
        T0 + DECAY_PERIOD_SECS + 1 + DECAY_PERIOD_SECS + 1,
    );
    assert_eq!(env.get_score(&agent.pubkey()).score, 2);
}
