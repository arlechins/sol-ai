#![no_main]
//! Fuzz the hand-rolled ProgramData metadata parser: arbitrary bytes must never
//! panic, and any accepted value must come from the documented layout.

use libfuzzer_sys::fuzz_target;
use taop_reputation::programdata::{
    parse_upgrade_authority, AUTHORITY_PRESENT, PROGRAMDATA_METADATA_LEN, PROGRAMDATA_TAG,
};

fuzz_target!(|data: &[u8]| {
    if let Ok(pubkey) = parse_upgrade_authority(data) {
        assert!(data.len() >= PROGRAMDATA_METADATA_LEN);
        assert_eq!(
            u32::from_le_bytes(data[0..4].try_into().unwrap()),
            PROGRAMDATA_TAG
        );
        assert_eq!(data[12], AUTHORITY_PRESENT);
        assert_eq!(pubkey.as_ref(), &data[13..45]);
    }
});
