//! Parsing of the BPF Loader Upgradeable `ProgramData` metadata.
//!
//! The typed Anchor `ProgramData` account deserializes through `bincode`;
//! linking that path into the program added ~58 KB to the binary. The metadata
//! prefix is a fixed, documented layout, so it is parsed here by hand and
//! covered by example-based and property tests.

use anchor_lang::prelude::*;

use crate::errors::TaopError;

/// `UpgradeableLoaderState::ProgramData` bincode layout:
/// `[u32 tag = 3][u64 slot][u8 option][32-byte authority]` followed by the ELF.
pub const PROGRAMDATA_TAG: u32 = 3;
pub const PROGRAMDATA_METADATA_LEN: usize = 4 + 8 + 1 + 32;
pub const AUTHORITY_PRESENT: u8 = 1;
const AUTHORITY_OFFSET: usize = 13;

/// Extract the upgrade authority from raw `ProgramData` account bytes.
///
/// Returns `InvalidAuthority` when the data is too short, is not a
/// `ProgramData` account, or has no upgrade authority (an immutable program
/// cannot prove a deployer, so initialization is rejected rather than left open
/// to anyone).
pub fn parse_upgrade_authority(data: &[u8]) -> Result<Pubkey> {
    require!(
        data.len() >= PROGRAMDATA_METADATA_LEN,
        TaopError::InvalidAuthority
    );
    let tag = u32::from_le_bytes(
        data[0..4]
            .try_into()
            .map_err(|_| TaopError::InvalidAuthority)?,
    );
    require!(tag == PROGRAMDATA_TAG, TaopError::InvalidAuthority);
    require!(data[12] == AUTHORITY_PRESENT, TaopError::InvalidAuthority);
    let authority_bytes: [u8; 32] = data[AUTHORITY_OFFSET..AUTHORITY_OFFSET + 32]
        .try_into()
        .map_err(|_| TaopError::InvalidAuthority)?;
    Ok(Pubkey::new_from_array(authority_bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn programdata_bytes(authority: Option<Pubkey>, tag: u32, extra: usize) -> Vec<u8> {
        let mut data = Vec::with_capacity(PROGRAMDATA_METADATA_LEN + extra);
        data.extend_from_slice(&tag.to_le_bytes());
        data.extend_from_slice(&7u64.to_le_bytes()); // slot
        match authority {
            Some(pubkey) => {
                data.push(AUTHORITY_PRESENT);
                data.extend_from_slice(pubkey.as_ref());
            }
            None => {
                data.push(0);
                data.extend_from_slice(&[0u8; 32]);
            }
        }
        data.extend(std::iter::repeat(0xAB).take(extra));
        data
    }

    #[test]
    fn extracts_a_present_authority() {
        let authority = Pubkey::new_unique();
        let data = programdata_bytes(Some(authority), PROGRAMDATA_TAG, 64);
        assert_eq!(parse_upgrade_authority(&data).unwrap(), authority);
    }

    #[test]
    fn rejects_a_revoked_authority() {
        let data = programdata_bytes(None, PROGRAMDATA_TAG, 0);
        assert!(parse_upgrade_authority(&data).is_err());
    }

    #[test]
    fn rejects_a_wrong_tag() {
        let data = programdata_bytes(Some(Pubkey::new_unique()), 2, 0);
        assert!(parse_upgrade_authority(&data).is_err());
    }

    #[test]
    fn rejects_short_data() {
        for len in 0..PROGRAMDATA_METADATA_LEN {
            let data = vec![0u8; len];
            assert!(
                parse_upgrade_authority(&data).is_err(),
                "length {len} must be rejected"
            );
        }
    }

    #[test]
    fn accepts_exact_metadata_length() {
        let authority = Pubkey::new_unique();
        let data = programdata_bytes(Some(authority), PROGRAMDATA_TAG, 0);
        assert_eq!(data.len(), PROGRAMDATA_METADATA_LEN);
        assert_eq!(parse_upgrade_authority(&data).unwrap(), authority);
    }

    proptest! {
        /// Arbitrary bytes never panic and, when accepted, the returned key is
        /// exactly the 32 bytes at the documented offset.
        #[test]
        fn never_panics_and_reads_the_documented_offset(data in proptest::collection::vec(any::<u8>(), 0..256)) {
            match parse_upgrade_authority(&data) {
                Ok(pubkey) => {
                    prop_assert!(data.len() >= PROGRAMDATA_METADATA_LEN);
                    prop_assert_eq!(u32::from_le_bytes(data[0..4].try_into().unwrap()), PROGRAMDATA_TAG);
                    prop_assert_eq!(data[12], AUTHORITY_PRESENT);
                    prop_assert_eq!(pubkey.as_ref(), &data[13..45]);
                }
                Err(_) => {}
            }
        }

        /// Any tagged ProgramData payload with an authority round-trips.
        #[test]
        fn round_trips_any_authority(bytes in proptest::array::uniform32(any::<u8>())) {
            let authority = Pubkey::new_from_array(bytes);
            let data = programdata_bytes(Some(authority), PROGRAMDATA_TAG, 32);
            prop_assert_eq!(parse_upgrade_authority(&data).unwrap(), authority);
        }
    }
}
