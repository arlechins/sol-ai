use anchor_lang::prelude::*;

#[error_code]
pub enum TaopError {
    #[msg("Caller is not authorized for this action")]
    Unauthorized,
    #[msg("Config is paused")]
    Paused,
    #[msg("URI exceeds the maximum length of 200 bytes")]
    UriTooLong,
    #[msg("Challenge bond must be at least the rent-exempt minimum")]
    BondBelowRentExempt,
    #[msg("Completion has already been challenged")]
    AlreadyChallenged,
    #[msg("Challenge is not pending resolution")]
    ChallengeNotPending,
    #[msg("Completion sequence does not match the agent's completion count")]
    InvalidCompletionSeq,
    #[msg("Decay period must be greater than zero")]
    InvalidDecayPeriod,
    #[msg("Capability bond must be greater than zero")]
    ZeroBond,
    #[msg("Penalty exceeds the remaining bond")]
    PenaltyExceedsBond,
    #[msg("Partial slash would leave the bond below the rent-exempt minimum; slash the full bond instead")]
    InvalidPenalty,
    #[msg("Capability is not active")]
    CapabilityNotActive,
    #[msg("Bond was fully slashed; nothing to withdraw")]
    BondStillSlashed,
    #[msg("Capability index for this type is full")]
    IndexFull,
    #[msg("Challenge vault balance does not match the recorded bond")]
    VaultBalanceMismatch,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Capability id does not match the next expected id")]
    InvalidCapabilityId,
    #[msg("Authority must not be the default (all-zero) pubkey")]
    InvalidAuthority,
}
