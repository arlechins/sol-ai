#![no_main]
//! Fuzz the pure score function: it must never panic, never exceed the net
//! completions, and only report decay when the inputs allow it.

use libfuzzer_sys::fuzz_target;
use taop_reputation::state::compute_score;

fuzz_target!(|data: &[u8]| {
    if data.len() < 41 {
        return;
    }
    let completions = u64::from_le_bytes(data[0..8].try_into().unwrap());
    let disputes = u64::from_le_bytes(data[8..16].try_into().unwrap());
    let last_activity = i64::from_le_bytes(data[16..24].try_into().unwrap());
    let now = i64::from_le_bytes(data[24..32].try_into().unwrap());
    let raw_period = i64::from_le_bytes(data[32..40].try_into().unwrap());
    // Half the cases use a zero period to exercise the defensive branch.
    let period = if data[40] % 2 == 0 {
        0
    } else {
        raw_period.max(1)
    };

    let (score, decayed) = compute_score(completions, disputes, last_activity, now, period);
    let net = completions.saturating_sub(disputes);

    assert!(score <= net, "score {score} exceeded net {net}");
    if decayed {
        assert!(net > 0);
        assert!(last_activity > 0);
        assert!(period > 0);
        assert!(now > last_activity);
    }
});
