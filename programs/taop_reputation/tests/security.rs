mod common;

use common::*;

/// A griefer cannot create the vault below the rent-exempt minimum, so the
/// smallest possible donation is `rent.minimum_balance(0)`. Such a donation must
/// neither block the challenge nor be stranded.
#[test]
fn challenge_is_not_blocked_by_vault_donation() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    let donor = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);
    let vault = challenge_vault_pda(&completion);
    let donation = env.rent_min();

    env.donate(&donor, &vault, donation).assert_success();
    assert_eq!(env.lamports(&vault), donation);

    env.challenge(&completion, &challenger, "ipfs://fraud")
        .assert_success();
    assert_eq!(env.lamports(&vault), DEFAULT_BOND + donation);

    let before = env.lamports(&challenger.pubkey());
    let admin = env.admin.insecure_clone();
    env.resolve(&admin, &completion, true).assert_success();
    let after = env.lamports(&challenger.pubkey());

    // Refund sweeps the bond and the donation; the admin pays the fee.
    assert_eq!(after - before, DEFAULT_BOND + donation);
    assert!(!env.exists(&vault));
}

#[test]
fn rejected_challenge_sweeps_donations_to_treasury() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    let donor = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);
    let vault = challenge_vault_pda(&completion);
    let donation = env.rent_min();

    env.donate(&donor, &vault, donation).assert_success();
    env.challenge(&completion, &challenger, "ipfs://wrong")
        .assert_success();

    let before = env.lamports(&env.treasury);
    let admin = env.admin.insecure_clone();
    env.resolve(&admin, &completion, false).assert_success();
    let after = env.lamports(&env.treasury);

    assert_eq!(after - before, DEFAULT_BOND + donation);
    assert!(!env.exists(&vault));
}

#[test]
fn capability_vault_donations_are_swept_to_the_creator() {
    let mut env = setup();
    let creator = funded(&mut env.ctx, 5);
    let donor = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);
    let vault = capability_vault_pda(&capability);
    env.register_capability(&creator, capability_type, "ipfs://cap", 1, DEFAULT_BOND)
        .assert_success();

    env.donate(&donor, &vault, 9_999).assert_success();
    assert_eq!(env.lamports(&vault), DEFAULT_BOND + 9_999);

    let before = env.lamports(&creator.pubkey());
    env.withdraw_bond(&creator, &capability).assert_success();
    let after = env.lamports(&creator.pubkey());

    assert!(!env.exists(&vault));
    assert!(!env.exists(&capability));
    // Creator receives bond + donation + account rent, minus the transaction fee.
    assert!(after - before > DEFAULT_BOND + 9_999);
}

#[test]
fn donations_do_not_change_scores() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let donor = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);

    let before = env.get_score(&agent.pubkey());
    env.donate(&donor, &challenge_vault_pda(&completion), 1_000_000)
        .assert_success();
    let after = env.get_score(&agent.pubkey());

    assert_eq!(before, after);
}

#[test]
fn resolve_rejects_substituted_treasury() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    let attacker = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);
    env.challenge(&completion, &challenger, "ipfs://fraud")
        .assert_success();

    let challenge = env.challenge_account(&completion);
    let ix = env
        .ctx
        .program()
        .accounts(taop_reputation::client::accounts::ResolveChallenge {
            config: env.config,
            completion,
            agent: agent_pda(&agent.pubkey()),
            challenge: challenge_pda(&completion),
            challenge_vault: challenge_vault_pda(&completion),
            challenger: challenge.challenger,
            treasury: attacker.pubkey(),
            authority: env.admin.pubkey(),
            system_program: anchor_lang::system_program::ID,
        })
        .args(taop_reputation::client::args::ResolveChallenge { upheld: false })
        .instruction()
        .unwrap();
    let admin = env.admin.insecure_clone();
    env.send_instruction(ix, &[&admin]).assert_failure();
    assert_eq!(
        env.lamports(&challenge_vault_pda(&completion)),
        DEFAULT_BOND
    );
}

#[test]
fn resolve_rejects_substituted_challenger() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    let attacker = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);
    env.challenge(&completion, &challenger, "ipfs://fraud")
        .assert_success();

    let ix = env
        .ctx
        .program()
        .accounts(taop_reputation::client::accounts::ResolveChallenge {
            config: env.config,
            completion,
            agent: agent_pda(&agent.pubkey()),
            challenge: challenge_pda(&completion),
            challenge_vault: challenge_vault_pda(&completion),
            challenger: attacker.pubkey(),
            treasury: env.treasury,
            authority: env.admin.pubkey(),
            system_program: anchor_lang::system_program::ID,
        })
        .args(taop_reputation::client::args::ResolveChallenge { upheld: true })
        .instruction()
        .unwrap();
    let admin = env.admin.insecure_clone();
    env.send_instruction(ix, &[&admin]).assert_failure();
    assert_eq!(
        env.lamports(&challenge_vault_pda(&completion)),
        DEFAULT_BOND
    );
}

#[test]
fn attacker_cannot_reinitialize_an_existing_agent() {
    let mut env = setup();
    let victim = funded(&mut env.ctx, 5);
    let attacker = funded(&mut env.ctx, 5);
    env.register_agent(&victim, "ipfs://victim")
        .assert_success();
    env.attest(&victim, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();

    // The attacker cannot touch the victim's agent PDA: the seeds require the
    // victim's signer. Registering with the victim's PDA and the attacker signer
    // must fail, and the victim's state must be untouched.
    let ix = env
        .ctx
        .program()
        .accounts(taop_reputation::client::accounts::RegisterAgent {
            agent: agent_pda(&victim.pubkey()),
            authority: attacker.pubkey(),
            system_program: anchor_lang::system_program::ID,
        })
        .args(taop_reputation::client::args::RegisterAgent {
            metadata_uri: "ipfs://hijack".to_string(),
        })
        .instruction()
        .unwrap();
    env.send_instruction(ix, &[&attacker]).assert_failure();

    let record = env.agent(&victim.pubkey());
    assert_eq!(record.authority, victim.pubkey());
    assert_eq!(record.metadata_uri, "ipfs://victim");
    assert_eq!(record.completions, 1);
}

#[test]
fn privileged_operations_reject_non_authority() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    let creator = funded(&mut env.ctx, 5);
    let intruder = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");

    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);
    env.challenge(&completion, &challenger, "ipfs://fraud")
        .assert_success();
    env.register_capability(&creator, capability_type, "ipfs://cap", 1, DEFAULT_BOND)
        .assert_success();
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);

    env.resolve(&intruder, &completion, true)
        .assert_anchor_error("Unauthorized");
    env.certify(&intruder, &capability)
        .assert_anchor_error("Unauthorized");
    env.slash(&intruder, &capability, 1_000)
        .assert_anchor_error("Unauthorized");
    env.set_certifier(&intruder, &intruder.pubkey())
        .assert_anchor_error("Unauthorized");
    env.update_config(&intruder, Some(9_999), None, None)
        .assert_anchor_error("Unauthorized");

    // Nothing changed.
    assert_eq!(
        env.lamports(&challenge_vault_pda(&completion)),
        DEFAULT_BOND
    );
    assert_eq!(env.capability(&capability).bond_remaining, DEFAULT_BOND);
    assert!(!env.capability(&capability).certified);
    assert_eq!(env.config_account().certifier, env.certifier.pubkey());
}

#[test]
fn resolve_rejects_wrong_agent_account() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let other = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    env.attest(&agent, task_type("summarization"), "ipfs://r0", 0)
        .assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);
    env.challenge(&completion, &challenger, "ipfs://fraud")
        .assert_success();

    let challenge = env.challenge_account(&completion);
    let ix = env
        .ctx
        .program()
        .accounts(taop_reputation::client::accounts::ResolveChallenge {
            config: env.config,
            completion,
            agent: agent_pda(&other.pubkey()),
            challenge: challenge_pda(&completion),
            challenge_vault: challenge_vault_pda(&completion),
            challenger: challenge.challenger,
            treasury: env.treasury,
            authority: env.admin.pubkey(),
            system_program: anchor_lang::system_program::ID,
        })
        .args(taop_reputation::client::args::ResolveChallenge { upheld: true })
        .instruction()
        .unwrap();
    let admin = env.admin.insecure_clone();
    env.send_instruction(ix, &[&admin]).assert_failure();

    assert_eq!(env.agent(&agent.pubkey()).disputes, 0);
    assert_eq!(
        env.lamports(&challenge_vault_pda(&completion)),
        DEFAULT_BOND
    );
}
