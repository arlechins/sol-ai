mod common;

use common::*;

#[test]
fn register_capability_escrows_bond_and_indexes() {
    let mut env = setup();
    let creator = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);

    env.register_capability(
        &creator,
        capability_type,
        "ipfs://cap-card",
        1,
        DEFAULT_BOND,
    )
    .assert_success();

    let record = env.capability(&capability);
    assert_eq!(record.id, 1);
    assert_eq!(record.creator, creator.pubkey());
    assert_eq!(record.capability_type, capability_type);
    assert_eq!(record.metadata_uri, "ipfs://cap-card");
    assert_eq!(record.bond_remaining, DEFAULT_BOND);
    assert!(!record.certified);
    assert!(!record.slashed);
    assert!(record.active);
    assert_eq!(
        env.lamports(&capability_vault_pda(&capability)),
        DEFAULT_BOND
    );
    assert_eq!(env.config_account().next_capability_id, 2);

    let index: ::taop_reputation::state::CapabilityIndex = env
        .ctx
        .get_account(&cap_index_pda(&capability_type))
        .unwrap();
    assert_eq!(index.capability_type, capability_type);
    assert_eq!(index.capabilities, vec![capability]);
}

#[test]
fn register_capability_rejects_invalid_inputs() {
    let mut env = setup();
    let creator = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");

    env.register_capability(&creator, capability_type, "ipfs://cap", 1, 0)
        .assert_anchor_error("ZeroBond");

    let rent_min = env.rent_min();
    env.register_capability(&creator, capability_type, "ipfs://cap", 1, rent_min - 1)
        .assert_anchor_error("BondBelowRentExempt");

    env.register_capability(&creator, capability_type, "ipfs://cap", 2, DEFAULT_BOND)
        .assert_anchor_error("InvalidCapabilityId");

    let long = "x".repeat(201);
    env.register_capability(&creator, capability_type, &long, 1, DEFAULT_BOND)
        .assert_anchor_error("UriTooLong");
}

#[test]
fn certify_capability_requires_authority() {
    let mut env = setup();
    let creator = funded(&mut env.ctx, 5);
    let intruder = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");
    env.register_capability(&creator, capability_type, "ipfs://cap", 1, DEFAULT_BOND)
        .assert_success();
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);

    env.certify(&intruder, &capability)
        .assert_anchor_error("Unauthorized");
    assert!(!env.capability(&capability).certified);

    let certifier = env.certifier.insecure_clone();
    env.certify(&certifier, &capability).assert_success();
    assert!(env.capability(&capability).certified);

    // Admin can also certify.
    let creator2 = funded(&mut env.ctx, 5);
    env.register_capability(&creator2, capability_type, "ipfs://cap2", 2, DEFAULT_BOND)
        .assert_success();
    let capability2 = capability_pda(&capability_type, &creator2.pubkey(), 2);
    let admin = env.admin.insecure_clone();
    env.certify(&admin, &capability2).assert_success();
    assert!(env.capability(&capability2).certified);
}

#[test]
fn slash_partial_moves_penalty_to_treasury() {
    let mut env = setup();
    let creator = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);
    env.register_capability(&creator, capability_type, "ipfs://cap", 1, DEFAULT_BOND)
        .assert_success();

    let treasury_before = env.lamports(&env.treasury);
    let certifier = env.certifier.insecure_clone();
    env.slash(&certifier, &capability, 2_000_000)
        .assert_success();

    let record = env.capability(&capability);
    assert_eq!(record.bond_remaining, DEFAULT_BOND - 2_000_000);
    assert!(record.slashed);
    assert!(record.active);
    assert_eq!(
        env.lamports(&capability_vault_pda(&capability)),
        DEFAULT_BOND - 2_000_000
    );
    assert_eq!(env.lamports(&env.treasury) - treasury_before, 2_000_000);
}

#[test]
fn slash_full_drains_vault_and_zeroes_bond() {
    let mut env = setup();
    let creator = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);
    env.register_capability(&creator, capability_type, "ipfs://cap", 1, DEFAULT_BOND)
        .assert_success();

    let treasury_before = env.lamports(&env.treasury);
    let certifier = env.certifier.insecure_clone();
    env.slash(&certifier, &capability, DEFAULT_BOND)
        .assert_success();

    let record = env.capability(&capability);
    assert_eq!(record.bond_remaining, 0);
    assert!(record.slashed);
    assert!(!env.exists(&capability_vault_pda(&capability)));
    assert_eq!(env.lamports(&env.treasury) - treasury_before, DEFAULT_BOND);
}

#[test]
fn slash_validates_penalty_and_authority() {
    let mut env = setup();
    let creator = funded(&mut env.ctx, 5);
    let intruder = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);
    env.register_capability(&creator, capability_type, "ipfs://cap", 1, DEFAULT_BOND)
        .assert_success();

    let certifier = env.certifier.insecure_clone();
    env.slash(&intruder, &capability, 1_000_000)
        .assert_anchor_error("Unauthorized");
    env.slash(&certifier, &capability, 0)
        .assert_anchor_error("ZeroBond");
    env.slash(&certifier, &capability, DEFAULT_BOND + 1)
        .assert_anchor_error("PenaltyExceedsBond");
    env.slash(&certifier, &capability, DEFAULT_BOND - 1)
        .assert_anchor_error("InvalidPenalty");
}

#[test]
fn slash_leaving_below_rent_exempt_is_rejected() {
    let mut env = setup();
    let creator = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");
    let bond = env.rent_min() + 1_000;
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);
    env.register_capability(&creator, capability_type, "ipfs://cap", 1, bond)
        .assert_success();

    let certifier = env.certifier.insecure_clone();
    // Penalty of 2_000 leaves rent_min - 1_000, below the rent-exempt minimum.
    env.slash(&certifier, &capability, 2_000)
        .assert_anchor_error("InvalidPenalty");
    // Slashing the full bond always works.
    env.slash(&certifier, &capability, bond).assert_success();
}

#[test]
fn withdraw_returns_remaining_bond_and_closes_accounts() {
    let mut env = setup();
    let creator = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);
    env.register_capability(&creator, capability_type, "ipfs://cap", 1, DEFAULT_BOND)
        .assert_success();

    let certifier = env.certifier.insecure_clone();
    env.slash(&certifier, &capability, 2_000_000)
        .assert_success();

    let vault = capability_vault_pda(&capability);
    let before = env.lamports(&creator.pubkey());
    env.withdraw_bond(&creator, &capability).assert_success();
    let after = env.lamports(&creator.pubkey());

    assert!(!env.exists(&capability));
    assert!(!env.exists(&vault));
    // Creator pays the fee, but receives the remaining bond plus account rent.
    assert!(after > before);

    // Cannot withdraw twice or slash a closed record.
    env.withdraw_bond(&creator, &capability).assert_failure();
    env.slash(&certifier, &capability, 1).assert_failure();
}

#[test]
fn withdraw_after_full_slash_fails() {
    let mut env = setup();
    let creator = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);
    env.register_capability(&creator, capability_type, "ipfs://cap", 1, DEFAULT_BOND)
        .assert_success();

    let certifier = env.certifier.insecure_clone();
    env.slash(&certifier, &capability, DEFAULT_BOND)
        .assert_success();
    env.withdraw_bond(&creator, &capability)
        .assert_anchor_error("BondStillSlashed");
}

#[test]
fn withdraw_requires_creator() {
    let mut env = setup();
    let creator = funded(&mut env.ctx, 5);
    let intruder = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);
    env.register_capability(&creator, capability_type, "ipfs://cap", 1, DEFAULT_BOND)
        .assert_success();

    env.withdraw_bond(&intruder, &capability).assert_failure();
    assert_eq!(env.capability(&capability).bond_remaining, DEFAULT_BOND);
}

#[test]
fn capability_index_is_capped() {
    let mut env = setup();
    let creator = funded(&mut env.ctx, 50);
    let capability_type = task_type("LoRA");
    let bond = env.rent_min();

    for id in 1..=64u64 {
        env.register_capability(&creator, capability_type, "ipfs://cap", id, bond)
            .assert_success();
    }
    env.register_capability(&creator, capability_type, "ipfs://cap", 65, bond)
        .assert_anchor_error("IndexFull");
}
