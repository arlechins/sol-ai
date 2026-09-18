mod common;

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use anchor_litesvm::{AnchorContext, TransactionResult};
use common::*;

/// Compute-unit regression guard — the Solana analog of a gas snapshot.
///
/// Records `compute_units_consumed` for the key instructions and fails when an
/// operation exceeds the recorded value by more than `TOLERANCE`. Refresh the
/// snapshot deliberately after reviewing a change:
///
///   UPDATE_CU_SNAPSHOT=1 cargo test -p taop-reputation-tests --test compute
///
/// Accounts with PDA seed constraints use *fixed* keypairs: Anchor re-searches
/// canonical bumps for random addresses, which shifts CU by thousands between
/// runs and would make the snapshot meaningless.
const TOLERANCE: f64 = 1.05;
const SNAPSHOT_FILE: &str = "cu-snapshot.json";

fn snapshot_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(SNAPSHOT_FILE)
}

fn cu(result: TransactionResult) -> u64 {
    result.assert_success().compute_units()
}

macro_rules! record {
    ($map:expr, $name:expr, $value:expr $(,)?) => {
        $map.insert($name.to_string(), $value);
    };
}

fn fixed(seed: u8) -> Keypair {
    Keypair::new_from_array([seed; 32])
}

fn fund(ctx: &mut AnchorContext, keypair: &Keypair, sol: u64) {
    ctx.svm
        .airdrop(&keypair.pubkey(), sol * LAMPORTS_PER_SOL)
        .expect("airdrop succeeds");
}

#[test]
fn instruction_compute_units_stay_within_budget() {
    let mut measured: BTreeMap<String, u64> = BTreeMap::new();

    // initialize_config runs once against a fresh context.
    {
        let mut ctx = fresh_ctx();
        let admin = fixed(90);
        fund(&mut ctx, &admin, 100);
        set_upgrade_authority(&mut ctx, &admin.pubkey());
        let treasury = fixed(91).pubkey();
        let certifier = fixed(92).pubkey();
        let ix = initialize_config_ix(
            &ctx,
            &admin.pubkey(),
            &treasury,
            &certifier,
            DEFAULT_BOND,
            DECAY_PERIOD_SECS,
        );
        record!(
            measured,
            "initialize_config",
            cu(ctx.execute_instruction(ix, &[&admin]).unwrap())
        );
    }

    let mut env = setup();
    let admin = env.admin.insecure_clone();
    let certifier = env.certifier.insecure_clone();
    let agent = fixed(1);
    let challenger = fixed(2);
    let canceller = fixed(3);
    let creator = fixed(4);
    for keypair in [&agent, &challenger, &canceller, &creator] {
        fund(&mut env.ctx, keypair, 5);
    }
    let task = task_type("summarization");
    let capability_type = task_type("LoRA");

    record!(
        measured,
        "register_agent",
        cu(env.register_agent(&agent, "ipfs://profile"))
    );
    record!(
        measured,
        "attest_completion_first",
        cu(env.attest(&agent, task, "ipfs://r0", 0))
    );
    record!(
        measured,
        "attest_completion_next",
        cu(env.attest(&agent, task, "ipfs://r1", 1))
    );

    let challenged = completion_pda(&agent.pubkey(), 0);
    record!(
        measured,
        "challenge_completion",
        cu(env.challenge(&challenged, &challenger, "ipfs://evidence"))
    );
    record!(
        measured,
        "resolve_challenge",
        cu(env.resolve(&certifier, &challenged, true))
    );

    record!(
        measured,
        "register_capability",
        cu(env.register_capability(
            &creator,
            capability_type,
            "ipfs://capability",
            1,
            DEFAULT_BOND,
        )),
    );
    let capability = capability_pda(&capability_type, &creator.pubkey(), 1);
    record!(
        measured,
        "certify_capability",
        cu(env.certify(&certifier, &capability))
    );
    record!(
        measured,
        "slash_capability",
        cu(env.slash(&certifier, &capability, 1))
    );
    record!(
        measured,
        "withdraw_capability_bond",
        cu(env.withdraw_bond(&creator, &capability))
    );

    record!(
        measured,
        "update_config",
        cu(env.update_config(&admin, Some(DEFAULT_BOND), None, Some(false)))
    );

    // cancel_challenge is only valid after the timeout elapses.
    let timed_out = completion_pda(&agent.pubkey(), 1);
    env.challenge(&timed_out, &canceller, "ipfs://timeout")
        .assert_success();
    set_clock(
        &mut env.ctx,
        T0 + ::taop_reputation::state::CHALLENGE_TIMEOUT_SECS + 1,
    );
    record!(
        measured,
        "cancel_challenge",
        cu(env.cancel_challenge(&canceller, &timed_out))
    );

    if std::env::var("UPDATE_CU_SNAPSHOT").as_deref() == Ok("1") {
        let json = serde_json::to_string_pretty(&measured).expect("snapshot serializes");
        fs::write(snapshot_path(), format!("{json}\n")).expect("snapshot writes");
        eprintln!("cu snapshot updated: {}", snapshot_path().display());
        return;
    }

    let raw = fs::read_to_string(snapshot_path()).unwrap_or_else(|_| {
        panic!(
            "{} missing; generate it with UPDATE_CU_SNAPSHOT=1",
            snapshot_path().display()
        )
    });
    let snapshot: BTreeMap<String, u64> =
        serde_json::from_str(&raw).expect("cu-snapshot.json parses");

    let mut failures: Vec<String> = Vec::new();
    for (name, actual) in &measured {
        match snapshot.get(name) {
            None => failures.push(format!("{name}: missing from snapshot")),
            Some(expected) => {
                let budget = (*expected as f64 * TOLERANCE).ceil() as u64;
                if *actual > budget {
                    failures.push(format!(
                        "{name}: {actual} CU exceeds budget {budget} (snapshot {expected})"
                    ));
                }
            }
        }
    }
    for stale in snapshot.keys() {
        if !measured.contains_key(stale) {
            failures.push(format!("{stale}: in snapshot but no longer measured"));
        }
    }

    assert!(
        failures.is_empty(),
        "compute-unit regression:\n  {}",
        failures.join("\n  ")
    );
}
