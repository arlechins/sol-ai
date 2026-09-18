#![no_main]
//! Fuzz account deserialization: Borsh decoding of arbitrary bytes must never
//! panic, and any successful decode must fit the account's `INIT_SPACE`.

use anchor_lang::Space;
use libfuzzer_sys::fuzz_target;
use taop_reputation::state::{Agent, Capability, Challenge, Completion, Config, PendingAdmin};

macro_rules! check {
    ($account:ty, $data:expr) => {
        if let Ok(decoded) = <$account>::try_from_slice($data) {
            let reencoded = borsh::to_vec(&decoded).expect("re-encoding succeeds");
            assert!(
                reencoded.len() <= <$account>::INIT_SPACE,
                "{} re-encoded to {} bytes, INIT_SPACE is {}",
                stringify!($account),
                reencoded.len(),
                <$account>::INIT_SPACE
            );
        }
    };
}

use borsh::BorshDeserialize;

fuzz_target!(|data: &[u8]| {
    check!(Config, data);
    check!(Agent, data);
    check!(Completion, data);
    check!(Challenge, data);
    check!(Capability, data);
    check!(PendingAdmin, data);
});
