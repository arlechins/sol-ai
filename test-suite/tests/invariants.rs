mod common;

use common::*;

#[test]
fn challenge_bonds_are_conserved_across_resolutions() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    let other = funded(&mut env.ctx, 5);
    let task = task_type("summarization");

    // Completion 0: challenge upheld -> refunded to challenger.
    // Completion 1: challenge rejected -> forfeited to treasury.
    env.attest(&agent, task, "ipfs://r0", 0).assert_success();
    env.attest(&agent, task, "ipfs://r1", 1).assert_success();
    let c0 = completion_pda(&agent.pubkey(), 0);
    let c1 = completion_pda(&agent.pubkey(), 1);

    let treasury_before = env.lamports(&env.treasury);

    env.challenge(&c0, &challenger, "ipfs://fraud")
        .assert_success();
    env.challenge(&c1, &other, "ipfs://wrong").assert_success();
    assert_eq!(env.lamports(&challenge_vault_pda(&c0)), DEFAULT_BOND);
    assert_eq!(env.lamports(&challenge_vault_pda(&c1)), DEFAULT_BOND);

    // Record the challenger balance after posting the bond: resolution must
    // return exactly the bond on top of this amount.
    let challenger_before = env.lamports(&challenger.pubkey());

    let admin = env.admin.insecure_clone();
    env.resolve(&admin, &c0, true).assert_success();
    env.resolve(&admin, &c1, false).assert_success();

    // Upheld bond returned to the original challenger.
    assert_eq!(
        env.lamports(&challenger.pubkey()) - challenger_before,
        DEFAULT_BOND
    );
    // Rejected bond forfeited to treasury.
    assert_eq!(env.lamports(&env.treasury) - treasury_before, DEFAULT_BOND);
    // Both vaults drained and closed.
    assert!(!env.exists(&challenge_vault_pda(&c0)));
    assert!(!env.exists(&challenge_vault_pda(&c1)));
}

#[test]
fn capability_payouts_never_exceed_the_bond() {
    let mut env = setup();
    let creator = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);
    let bond = 10_000_000;
    env.register_capability(&creator, capability_type, "ipfs://cap", 1, bond)
        .assert_success();

    let treasury_before = env.lamports(&env.treasury);
    let certifier = env.certifier.insecure_clone();
    env.slash(&certifier, &capability, 4_000_000)
        .assert_success();
    env.withdraw_bond(&creator, &capability).assert_success();

    let paid_out = env.lamports(&env.treasury) - treasury_before + 6_000_000;
    assert_eq!(paid_out, bond);
    assert!(!env.exists(&capability_vault_pda(&capability)));
    assert!(!env.exists(&capability));
}

#[test]
fn empty_vaults_are_not_reused_after_resolution() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    let other = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);

    env.challenge(&completion, &challenger, "ipfs://fraud")
        .assert_success();
    let admin = env.admin.insecure_clone();
    env.resolve(&admin, &completion, false).assert_success();

    // The challenge record persists (resolved) and the completion stays challenged,
    // so no second bond can be posted for the same completion. The second attempt
    // fails at account initialization before any lamports move.
    let challenge = env.challenge_account(&completion);
    assert!(challenge.resolved);
    assert_eq!(env.lamports(&challenge_vault_pda(&completion)), 0);
    env.challenge(&completion, &other, "ipfs://again")
        .assert_failure();
    assert_eq!(env.lamports(&challenge_vault_pda(&completion)), 0);
}
