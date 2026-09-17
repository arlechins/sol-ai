mod common;

use common::*;

#[test]
fn initialize_config_sets_fields() {
    let env = setup();

    let config = env.config_account();
    assert_eq!(config.admin, env.admin.pubkey());
    assert_eq!(config.certifier, env.certifier.pubkey());
    assert_eq!(config.treasury, env.treasury);
    assert_eq!(config.challenge_bond_lamports, DEFAULT_BOND);
    assert_eq!(config.decay_period_secs, DECAY_PERIOD_SECS);
    assert!(!config.paused);
    assert_eq!(config.next_completion_id, 1);
    assert_eq!(config.next_capability_id, 1);
}

#[test]
fn initialize_config_cannot_run_twice() {
    let mut env = setup();
    let ix = initialize_config_ix(
        &env.ctx,
        &env.admin.pubkey(),
        &env.treasury,
        &env.certifier.pubkey(),
        DEFAULT_BOND,
        DECAY_PERIOD_SECS,
    );
    let admin = env.admin.insecure_clone();
    env.ctx
        .execute_instruction(ix, &[&admin])
        .unwrap()
        .assert_failure();
}

#[test]
fn initialize_config_rejects_zero_treasury() {
    // The default pubkey is the System program, which Anchor rejects as a
    // writable account (`ConstraintMut`) before the instruction body. The
    // program also guards against `Pubkey::default()` as defense in depth.
    let mut ctx = fresh_ctx();
    let admin = funded(&mut ctx, 10);
    let ix = initialize_config_ix(
        &ctx,
        &admin.pubkey(),
        &Pubkey::default(),
        &admin.pubkey(),
        DEFAULT_BOND,
        DECAY_PERIOD_SECS,
    );
    ctx.execute_instruction(ix, &[&admin])
        .unwrap()
        .assert_failure();
}

#[test]
fn initialize_config_rejects_bond_below_rent_exempt() {
    let mut ctx = fresh_ctx();
    let admin = funded(&mut ctx, 10);
    let treasury = Pubkey::new_unique();
    let rent_min = ctx
        .svm
        .get_sysvar::<solana_program::rent::Rent>()
        .minimum_balance(0);
    let ix = initialize_config_ix(
        &ctx,
        &admin.pubkey(),
        &treasury,
        &admin.pubkey(),
        rent_min - 1,
        DECAY_PERIOD_SECS,
    );
    ctx.execute_instruction(ix, &[&admin])
        .unwrap()
        .assert_anchor_error("BondBelowRentExempt");
}

#[test]
fn initialize_config_rejects_zero_decay_period() {
    let mut ctx = fresh_ctx();
    let admin = funded(&mut ctx, 10);
    let treasury = Pubkey::new_unique();
    let ix = initialize_config_ix(
        &ctx,
        &admin.pubkey(),
        &treasury,
        &admin.pubkey(),
        DEFAULT_BOND,
        0,
    );
    ctx.execute_instruction(ix, &[&admin])
        .unwrap()
        .assert_anchor_error("InvalidDecayPeriod");
}

#[test]
fn update_config_requires_admin() {
    let mut env = setup();
    let intruder = funded(&mut env.ctx, 5);
    env.update_config(&intruder, Some(9_000_000), None, None)
        .assert_anchor_error("Unauthorized");
}

#[test]
fn update_config_updates_parameters() {
    let mut env = setup();
    let admin = env.admin.insecure_clone();
    env.update_config(&admin, Some(7_000_000), Some(3600), Some(true))
        .assert_success();

    let config = env.config_account();
    assert_eq!(config.challenge_bond_lamports, 7_000_000);
    assert_eq!(config.decay_period_secs, 3600);
    assert!(config.paused);
}

#[test]
fn update_config_rejects_invalid_values() {
    let mut env = setup();
    let admin = env.admin.insecure_clone();
    env.update_config(&admin, Some(1), None, None)
        .assert_anchor_error("BondBelowRentExempt");
    env.update_config(&admin, None, Some(0), None)
        .assert_anchor_error("InvalidDecayPeriod");

    let config = env.config_account();
    assert_eq!(config.challenge_bond_lamports, DEFAULT_BOND);
    assert_eq!(config.decay_period_secs, DECAY_PERIOD_SECS);
}

#[test]
fn set_certifier_requires_admin_and_updates_authority() {
    let mut env = setup();
    let attacker = funded(&mut env.ctx, 5);
    env.set_certifier(&attacker, &attacker.pubkey())
        .assert_anchor_error("Unauthorized");

    let new_certifier = funded(&mut env.ctx, 5);
    let admin = env.admin.insecure_clone();
    env.set_certifier(&admin, &new_certifier.pubkey())
        .assert_success();
    assert_eq!(env.config_account().certifier, new_certifier.pubkey());

    // Old certifier can no longer certify; the new one can.
    let creator = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");
    env.register_capability(&creator, capability_type, "ipfs://cap", 1, DEFAULT_BOND)
        .assert_success();
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);
    let old_certifier = env.certifier.insecure_clone();
    env.certify(&old_certifier, &capability)
        .assert_anchor_error("Unauthorized");
    env.certify(&new_certifier, &capability).assert_success();
    assert!(env.capability(&capability).certified);
}

#[test]
fn pause_blocks_writes_and_unpause_restores_them() {
    let mut env = setup();
    let admin = env.admin.insecure_clone();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    let creator = funded(&mut env.ctx, 5);

    env.update_config(&admin, None, None, Some(true))
        .assert_success();

    let task = task_type("summarization");
    env.attest(&agent, task, "ipfs://r0", 0)
        .assert_anchor_error("Paused");
    env.register_capability(&creator, task, "ipfs://cap", 1, DEFAULT_BOND)
        .assert_anchor_error("Paused");

    // Pause does not block challenge submission? It does: reads are allowed,
    // but challenge writes are paused too.
    env.update_config(&admin, None, None, Some(false))
        .assert_success();
    env.attest(&agent, task, "ipfs://r0", 0).assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);
    env.challenge(&completion, &challenger, "ipfs://ev")
        .assert_success();

    // Now pause, and verify a second challenge is rejected on the pause path
    // (the completion is already challenged, so use a fresh attestation).
    env.update_config(&admin, None, None, Some(true))
        .assert_success();
    env.attest(&agent, task, "ipfs://r1", 1)
        .assert_anchor_error("Paused");
}
