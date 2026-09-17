mod common;

use common::*;

/// Compute-unit budgets. Bounds are ~2-3x the locally observed usage so that
/// regressions are caught without making the suite brittle across toolchains.
#[test]
fn instructions_stay_within_compute_budgets() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);
    let challenger = funded(&mut env.ctx, 5);
    let creator = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");

    let attest = env.attest(&agent, task_type("summarization"), "ipfs://r0", 0);
    attest.assert_success();
    let completion = completion_pda(&agent.pubkey(), 0);

    let challenge = env.challenge(&completion, &challenger, "ipfs://fraud");
    challenge.assert_success();

    let admin = env.admin.insecure_clone();
    let resolve = env.resolve(&admin, &completion, true);
    resolve.assert_success();

    let register =
        env.register_capability(&creator, capability_type, "ipfs://cap", 1, DEFAULT_BOND);
    register.assert_success();
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);

    let certify = {
        let certifier = env.certifier.insecure_clone();
        env.certify(&certifier, &capability)
    };
    certify.assert_success();

    let slash = {
        let certifier = env.certifier.insecure_clone();
        env.slash(&certifier, &capability, 1_000)
    };
    slash.assert_success();

    // Probe actual usage so budgets can be reviewed from the printed output.
    println!("CU attest={}", attest.compute_units());
    println!("CU challenge={}", challenge.compute_units());
    println!("CU resolve={}", resolve.compute_units());
    println!("CU register_capability={}", register.compute_units());
    println!("CU certify={}", certify.compute_units());
    println!("CU slash={}", slash.compute_units());

    // Observed on litesvm (toolchain 4.2.2 / anchor 1.1.2): attest 21.4K,
    // challenge 16.7K, resolve 16.4K, register 23.8K, certify 5.3K, slash 10.1K.
    // Budgets are ~3x observed so real regressions fail without toolchain noise.
    assert!(attest.compute_units() < 65_000, "attest CU regression");
    assert!(
        challenge.compute_units() < 50_000,
        "challenge CU regression"
    );
    assert!(resolve.compute_units() < 50_000, "resolve CU regression");
    assert!(
        register.compute_units() < 75_000,
        "register_capability CU regression"
    );
    assert!(certify.compute_units() < 25_000, "certify CU regression");
    assert!(slash.compute_units() < 40_000, "slash CU regression");
}

/// Deterministic randomized operation sequence with full accounting checks.
/// Mirrors every state change in the test so the on-chain state can be verified
/// against ground truth: vault balances, treasury inflows, and score inputs.
#[test]
fn randomized_sequence_preserves_accounting_invariants() {
    struct Tracked {
        agent: usize,
        seq: u64,
        challenged: bool,
        challenger: Option<usize>,
        resolved: bool,
        upheld: bool,
    }

    let mut env = setup();
    let agents: Vec<Keypair> = (0..3).map(|_| funded(&mut env.ctx, 20)).collect();
    let capability_type = task_type("LoRA");
    let mut rng_state: u64 = 0x5eed_1234_abcd_9876;

    let mut next = move || {
        // xorshift64*
        let mut x = rng_state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        rng_state = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    };

    let mut completions: Vec<Tracked> = Vec::new();
    let mut capability_ids: Vec<(usize, u64, u64)> = Vec::new(); // (agent, id, bond_remaining)
    let mut expected_treasury: u64 = 0;
    let mut task_seq: [u64; 3] = [0, 0, 0];
    let mut next_capability_id: u64 = 1;

    let treasury_start = env.lamports(&env.treasury);

    for _ in 0..60 {
        let roll = next() % 100;
        if roll < 35 || completions.is_empty() {
            // Attest on a random agent.
            let a = (next() % 3) as usize;
            let seq = task_seq[a];
            env.attest(
                &agents[a],
                task_type("summarization"),
                &format!("ipfs://r{a}-{seq}"),
                seq,
            )
            .assert_success();
            completions.push(Tracked {
                agent: a,
                seq,
                challenged: false,
                challenger: None,
                resolved: false,
                upheld: false,
            });
            task_seq[a] += 1;
        } else if roll < 60 {
            // Challenge an unchallenged completion.
            let idx = (next() as usize) % completions.len();
            if completions[idx].challenged {
                continue;
            }
            let challenger = ((next() % 3) as usize + completions[idx].agent + 1) % 3;
            let completion = completion_pda(
                &agents[completions[idx].agent].pubkey(),
                completions[idx].seq,
            );
            env.challenge(&completion, &agents[challenger], "ipfs://ev")
                .assert_success();
            completions[idx].challenged = true;
            completions[idx].challenger = Some(challenger);
        } else if roll < 80 {
            // Resolve a pending challenge.
            let pending: Vec<usize> = completions
                .iter()
                .enumerate()
                .filter(|(_, c)| c.challenged && !c.resolved)
                .map(|(i, _)| i)
                .collect();
            if pending.is_empty() {
                continue;
            }
            let idx = pending[(next() as usize) % pending.len()];
            let upheld = next() % 2 == 0;
            let completion = completion_pda(
                &agents[completions[idx].agent].pubkey(),
                completions[idx].seq,
            );
            let admin = env.admin.insecure_clone();
            env.resolve(&admin, &completion, upheld).assert_success();
            completions[idx].resolved = true;
            completions[idx].upheld = upheld;
            if !upheld {
                expected_treasury += DEFAULT_BOND;
            }
        } else if roll < 90 {
            // Register a capability.
            let a = (next() % 3) as usize;
            let id = next_capability_id;
            env.register_capability(
                &agents[a],
                capability_type,
                &format!("ipfs://cap-{id}"),
                id,
                DEFAULT_BOND,
            )
            .assert_success();
            capability_ids.push((a, id, DEFAULT_BOND));
            next_capability_id += 1;
        } else {
            // Slash an active capability.
            let active: Vec<usize> = capability_ids
                .iter()
                .enumerate()
                .filter(|(_, (_, _, remaining))| *remaining > 0)
                .map(|(i, _)| i)
                .collect();
            if active.is_empty() {
                continue;
            }
            let idx = active[(next() as usize) % active.len()];
            let (_, id, remaining) = capability_ids[idx];
            let penalty = if next() % 3 == 0 {
                remaining
            } else {
                remaining / 4
            };
            let capability = capability_pda(
                &capability_type,
                &agents[capability_ids[idx].0].pubkey(),
                id,
            );
            let certifier = env.certifier.insecure_clone();
            env.slash(&certifier, &capability, penalty).assert_success();
            capability_ids[idx].2 -= penalty;
            expected_treasury += penalty;
        }
    }

    // Challenge vaults: pending challenges still escrow the bond; resolved ones are empty.
    for tracked in &completions {
        let completion = completion_pda(&agents[tracked.agent].pubkey(), tracked.seq);
        let vault = challenge_vault_pda(&completion);
        if tracked.challenged && !tracked.resolved {
            assert_eq!(
                env.lamports(&vault),
                DEFAULT_BOND,
                "pending challenge must escrow exactly the bond"
            );
        } else if tracked.challenged && tracked.resolved {
            assert!(
                !env.exists(&vault),
                "resolved challenge vault must be closed"
            );
        }
    }

    // Capability vaults hold the remaining bond; fully slashed ones are closed.
    for (a, id, remaining) in &capability_ids {
        let capability = capability_pda(&capability_type, &agents[*a].pubkey(), *id);
        let vault = capability_vault_pda(&capability);
        assert_eq!(env.lamports(&vault), *remaining);
        let record = env.capability(&capability);
        assert_eq!(record.bond_remaining, *remaining);
    }

    // Treasury received exactly the rejected challenge bonds and slashed penalties.
    assert_eq!(
        env.lamports(&env.treasury) - treasury_start,
        expected_treasury,
        "treasury inflows must match rejected challenges plus slashes"
    );

    // Agent counters match ground truth and scores stay consistent.
    for (a, keypair) in agents.iter().enumerate() {
        let expected_completions = completions.iter().filter(|c| c.agent == a).count() as u64;
        let expected_disputes = completions
            .iter()
            .filter(|c| c.agent == a && c.resolved && c.upheld)
            .count() as u64;
        let record = env.agent(&keypair.pubkey());
        assert_eq!(record.completions, expected_completions);
        assert_eq!(record.disputes, expected_disputes);

        let score = env.get_score(&keypair.pubkey());
        assert_eq!(score.completions, expected_completions);
        assert_eq!(score.disputes, expected_disputes);
        assert!(score.score <= expected_completions - expected_disputes);
    }
}

#[test]
fn uri_length_boundary_is_exact() {
    let mut env = setup();
    let agent = funded(&mut env.ctx, 5);

    let max = "x".repeat(200);
    env.attest(&agent, task_type("summarization"), &max, 0)
        .assert_success();

    let too_long = "x".repeat(201);
    env.attest(&agent, task_type("summarization"), &too_long, 1)
        .assert_anchor_error("UriTooLong");

    let creator = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");
    env.register_capability(&creator, capability_type, &max, 1, DEFAULT_BOND)
        .assert_success();
    env.register_capability(&creator, capability_type, &too_long, 2, DEFAULT_BOND)
        .assert_anchor_error("UriTooLong");
}

#[test]
fn zero_pubkeys_are_rejected_for_authorities() {
    let (mut ctx, admin) = fresh_ctx_with_admin(10);
    let treasury = Pubkey::new_unique();

    let ix = initialize_config_ix(
        &ctx,
        &admin.pubkey(),
        &treasury,
        &Pubkey::default(),
        DEFAULT_BOND,
        DECAY_PERIOD_SECS,
    );
    ctx.execute_instruction(ix, &[&admin])
        .unwrap()
        .assert_anchor_error("InvalidAuthority");
}

/// Config initialization must be signed by the program's upgrade authority so
/// nobody can front-run a fresh deployment and claim the admin role.
#[test]
fn initialize_config_requires_upgrade_authority() {
    let (mut ctx, admin) = fresh_ctx_with_admin(10);
    let other = funded(&mut ctx, 10);
    set_upgrade_authority(&mut ctx, &other.pubkey());

    let ix = initialize_config_ix(
        &ctx,
        &admin.pubkey(),
        &Pubkey::new_unique(),
        &admin.pubkey(),
        DEFAULT_BOND,
        DECAY_PERIOD_SECS,
    );
    ctx.execute_instruction(ix, &[&admin])
        .unwrap()
        .assert_anchor_error("Unauthorized");
}

#[test]
fn admin_transfer_is_two_step_and_swaps_authority() {
    let mut env = setup();
    let intruder = funded(&mut env.ctx, 5);
    let new_admin = funded(&mut env.ctx, 5);
    let admin = env.admin.insecure_clone();

    // Only the admin can propose.
    env.transfer_admin(&intruder, &new_admin.pubkey())
        .assert_anchor_error("Unauthorized");

    env.transfer_admin(&admin, &new_admin.pubkey())
        .assert_success();
    assert_eq!(env.config_account().admin, env.admin.pubkey());

    // Only the proposed key can accept.
    env.accept_admin(&intruder).assert_failure();
    env.accept_admin(&new_admin).assert_success();

    assert_eq!(env.config_account().admin, new_admin.pubkey());
    // The pending account is closed and the old admin loses privileges.
    assert!(!env.exists(&pending_admin_pda()));
    env.set_certifier(&admin, &admin.pubkey())
        .assert_anchor_error("Unauthorized");
    let certifier = env.certifier.insecure_clone();
    env.set_certifier(&new_admin, &certifier.pubkey())
        .assert_success();
}

#[test]
fn admin_transfer_rejects_zero_and_allows_reproposal() {
    let mut env = setup();
    let first = funded(&mut env.ctx, 5);
    let second = funded(&mut env.ctx, 5);
    let admin = env.admin.insecure_clone();

    env.transfer_admin(&admin, &Pubkey::default())
        .assert_anchor_error("InvalidAuthority");

    env.transfer_admin(&admin, &first.pubkey()).assert_success();
    env.transfer_admin(&admin, &second.pubkey())
        .assert_success();

    // The first proposal was overwritten; only the second key can accept.
    env.accept_admin(&first).assert_failure();
    env.accept_admin(&second).assert_success();
    assert_eq!(env.config_account().admin, second.pubkey());
}

#[test]
fn decay_period_is_capped() {
    let (mut ctx, admin) = fresh_ctx_with_admin(10);
    let treasury = Pubkey::new_unique();

    let ix = initialize_config_ix(
        &ctx,
        &admin.pubkey(),
        &treasury,
        &admin.pubkey(),
        DEFAULT_BOND,
        ::taop_reputation::state::MAX_DECAY_PERIOD_SECS + 1,
    );
    ctx.execute_instruction(ix, &[&admin])
        .unwrap()
        .assert_anchor_error("DecayPeriodTooLong");

    let ix = initialize_config_ix(
        &ctx,
        &admin.pubkey(),
        &treasury,
        &admin.pubkey(),
        DEFAULT_BOND,
        ::taop_reputation::state::MAX_DECAY_PERIOD_SECS,
    );
    ctx.execute_instruction(ix, &[&admin])
        .unwrap()
        .assert_success();

    let mut env = setup();
    let admin = env.admin.insecure_clone();
    env.update_config(
        &admin,
        None,
        Some(::taop_reputation::state::MAX_DECAY_PERIOD_SECS + 1),
        None,
    )
    .assert_anchor_error("DecayPeriodTooLong");
}

#[test]
fn set_certifier_rejects_zero_pubkey() {
    let mut env = setup();
    let admin = env.admin.insecure_clone();
    env.set_certifier(&admin, &Pubkey::default())
        .assert_anchor_error("InvalidAuthority");
    assert_eq!(env.config_account().certifier, env.certifier.pubkey());
}

/// Init funds the treasury so that a first micro-payout cannot fail with
/// `InsufficientFundsForRent` while creating the treasury account.
#[test]
fn treasury_is_funded_at_init_and_accepts_micro_slashes() {
    let mut env = setup();
    assert!(
        env.exists(&env.treasury),
        "treasury must exist after initialize_config"
    );
    assert_eq!(env.lamports(&env.treasury), env.rent_min());

    let creator = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);
    env.register_capability(&creator, capability_type, "ipfs://cap", 1, DEFAULT_BOND)
        .assert_success();

    // 1 lamport penalty would previously fail while creating the treasury.
    let before = env.lamports(&env.treasury);
    let certifier = env.certifier.insecure_clone();
    env.slash(&certifier, &capability, 1).assert_success();
    assert_eq!(env.lamports(&env.treasury) - before, 1);
}

#[test]
fn stale_index_entries_are_detectable_after_withdrawal() {
    // Documents v0.1 behavior: withdrawing a capability closes its account but
    // leaves the pointer in the type index. Consumers must filter by account
    // existence (the SDK does); this test pins that behavior so it cannot change
    // silently.
    let mut env = setup();
    let creator = funded(&mut env.ctx, 5);
    let capability_type = task_type("LoRA");
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);
    env.register_capability(&creator, capability_type, "ipfs://cap", 1, DEFAULT_BOND)
        .assert_success();
    env.withdraw_bond(&creator, &capability).assert_success();

    let index: ::taop_reputation::state::CapabilityIndex = env
        .ctx
        .get_account(&cap_index_pda(&capability_type))
        .unwrap();
    assert!(index.capabilities.contains(&capability));
    assert!(!env.exists(&capability));
}
