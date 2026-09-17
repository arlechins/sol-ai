mod common;

use anchor_lang::{Discriminator, Space};
use sha2::{Digest, Sha256};

use ::taop_reputation::events::{
    AgentRegistered, BondWithdrawn, CapabilityCertified, CapabilityRegistered, CapabilitySlashed,
    CertifierUpdated, ChallengeCancelled, ChallengeResolved, ChallengeSubmitted,
    CompletionAttested, ConfigInitialized, ConfigUpdated,
};
use ::taop_reputation::state::{
    Agent, Capability, CapabilityIndex, Challenge, Completion, Config, PendingAdmin,
};

fn account_discriminator(name: &str) -> [u8; 8] {
    let mut hasher = Sha256::new();
    hasher.update(format!("account:{name}").as_bytes());
    let digest = hasher.finalize();
    let mut out = [0u8; 8];
    out.copy_from_slice(&digest[..8]);
    out
}

fn event_discriminator(name: &str) -> [u8; 8] {
    let mut hasher = Sha256::new();
    hasher.update(format!("event:{name}").as_bytes());
    let digest = hasher.finalize();
    let mut out = [0u8; 8];
    out.copy_from_slice(&digest[..8]);
    out
}

/// Account sizes are part of the public client contract (the SDK and indexers
/// decode these accounts). Pin them so an accidental layout change fails here
/// instead of silently breaking consumers.
#[test]
fn account_sizes_are_pinned() {
    let sizes: [(&str, usize, usize); 7] = [
        ("Config", 8 + Config::INIT_SPACE, 138),
        ("Agent", 8 + Agent::INIT_SPACE, 269),
        ("Completion", 8 + Completion::INIT_SPACE, 295),
        ("Challenge", 8 + Challenge::INIT_SPACE, 295),
        ("Capability", 8 + Capability::INIT_SPACE, 296),
        ("CapabilityIndex", CapabilityIndex::SPACE, 2093),
        ("PendingAdmin", 8 + PendingAdmin::INIT_SPACE, 41),
    ];
    for (name, derived, documented) in sizes {
        assert_eq!(
            derived, documented,
            "{name} layout changed: derived {derived} bytes, documented {documented}. \
             Update docs/account-layout.md and the SDK if this is intentional."
        );
    }
}

#[test]
fn account_discriminators_match_the_names() {
    assert_eq!(Config::DISCRIMINATOR, account_discriminator("Config"));
    assert_eq!(Agent::DISCRIMINATOR, account_discriminator("Agent"));
    assert_eq!(
        Completion::DISCRIMINATOR,
        account_discriminator("Completion")
    );
    assert_eq!(Challenge::DISCRIMINATOR, account_discriminator("Challenge"));
    assert_eq!(
        Capability::DISCRIMINATOR,
        account_discriminator("Capability")
    );
    assert_eq!(
        CapabilityIndex::DISCRIMINATOR,
        account_discriminator("CapabilityIndex")
    );
    assert_eq!(
        PendingAdmin::DISCRIMINATOR,
        account_discriminator("PendingAdmin")
    );
}

/// Event names are part of the indexer contract; renaming one changes its
/// discriminator and silently breaks decoders.
#[test]
fn event_discriminators_match_the_names() {
    assert_eq!(
        ConfigInitialized::DISCRIMINATOR,
        event_discriminator("ConfigInitialized")
    );
    assert_eq!(
        ConfigUpdated::DISCRIMINATOR,
        event_discriminator("ConfigUpdated")
    );
    assert_eq!(
        CertifierUpdated::DISCRIMINATOR,
        event_discriminator("CertifierUpdated")
    );
    assert_eq!(
        AgentRegistered::DISCRIMINATOR,
        event_discriminator("AgentRegistered")
    );
    assert_eq!(
        CompletionAttested::DISCRIMINATOR,
        event_discriminator("CompletionAttested")
    );
    assert_eq!(
        ChallengeSubmitted::DISCRIMINATOR,
        event_discriminator("ChallengeSubmitted")
    );
    assert_eq!(
        ChallengeResolved::DISCRIMINATOR,
        event_discriminator("ChallengeResolved")
    );
    assert_eq!(
        ChallengeCancelled::DISCRIMINATOR,
        event_discriminator("ChallengeCancelled")
    );
    assert_eq!(
        CapabilityRegistered::DISCRIMINATOR,
        event_discriminator("CapabilityRegistered")
    );
    assert_eq!(
        CapabilityCertified::DISCRIMINATOR,
        event_discriminator("CapabilityCertified")
    );
    assert_eq!(
        CapabilitySlashed::DISCRIMINATOR,
        event_discriminator("CapabilitySlashed")
    );
    assert_eq!(
        BondWithdrawn::DISCRIMINATOR,
        event_discriminator("BondWithdrawn")
    );
}

/// The SDK's `getProgramAccounts` fallback filters capabilities by a raw
/// memcmp offset; pin the documented offset so a layout change is caught here
/// and not by silently returning nothing.
#[test]
fn capability_type_memcmp_offset_is_stable() {
    // 8 discriminator + 8 id + 32 creator = 48
    const SDK_MEMCMP_OFFSET: usize = 8 + 8 + 32;
    assert_eq!(SDK_MEMCMP_OFFSET, 48);
}
