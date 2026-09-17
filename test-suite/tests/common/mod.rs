#![allow(dead_code)]

use anchor_lang::declare_program;
use anchor_lang::prelude::*;
use anchor_lang::AnchorDeserialize;
use anchor_litesvm::{AnchorContext, AnchorLiteSVM, TransactionResult};
use solana_clock::Clock;
use solana_transaction::Transaction;

pub use anchor_lang::prelude::Pubkey;
pub use solana_keypair::Keypair;
pub use solana_signer::Signer;

use ::taop_reputation::state::{Agent, Capability, Challenge, Completion, Config, ScoreView};

declare_program!(taop_reputation);

pub const PROGRAM_ID: Pubkey = pubkey!("8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE");
pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
pub const DEFAULT_BOND: u64 = 5_000_000; // 0.005 SOL
pub const DECAY_PERIOD_SECS: i64 = 30 * 24 * 60 * 60;
pub const T0: i64 = 1_750_000_000;

pub fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &PROGRAM_ID).0
}

pub fn config_pda() -> Pubkey {
    pda(&[b"config"])
}

pub fn agent_pda(authority: &Pubkey) -> Pubkey {
    pda(&[b"agent", authority.as_ref()])
}

pub fn completion_pda(agent: &Pubkey, seq: u64) -> Pubkey {
    pda(&[b"completion", agent.as_ref(), &seq.to_le_bytes()])
}

pub fn challenge_pda(completion: &Pubkey) -> Pubkey {
    pda(&[b"challenge", completion.as_ref()])
}

pub fn challenge_vault_pda(completion: &Pubkey) -> Pubkey {
    pda(&[b"challenge_vault", completion.as_ref()])
}

pub fn capability_pda(capability_type: &[u8; 32], creator: &Pubkey, id: u64) -> Pubkey {
    pda(&[
        b"capability",
        capability_type.as_ref(),
        creator.as_ref(),
        &id.to_le_bytes(),
    ])
}

pub fn capability_vault_pda(capability: &Pubkey) -> Pubkey {
    pda(&[b"capability_vault", capability.as_ref()])
}

pub fn cap_index_pda(capability_type: &[u8; 32]) -> Pubkey {
    pda(&[b"cap-index", capability_type.as_ref()])
}

pub fn pending_admin_pda() -> Pubkey {
    pda(&[b"pending-admin"])
}

pub const BPF_LOADER_UPGRADEABLE_ID: Pubkey =
    anchor_lang::solana_program::bpf_loader_upgradeable::ID;

pub fn program_data_pda() -> Pubkey {
    Pubkey::find_program_address(&[PROGRAM_ID.as_ref()], &BPF_LOADER_UPGRADEABLE_ID).0
}

/// LiteSVM deploys programs with no upgrade authority; the on-chain
/// `initialize_config` guard requires the signer to be the upgrade authority.
/// Rewrite the ProgramData metadata so tests exercise the same constraint as a
/// real deployment.
pub fn set_upgrade_authority(ctx: &mut AnchorContext, authority: &Pubkey) {
    use solana_loader_v3_interface::state::UpgradeableLoaderState;

    let address = program_data_pda();
    let mut account = ctx
        .svm
        .get_account(&address)
        .expect("programdata account exists after deploy");
    let metadata_len = UpgradeableLoaderState::size_of_programdata_metadata();
    let state = UpgradeableLoaderState::ProgramData {
        slot: 0,
        upgrade_authority_address: Some(*authority),
    };
    bincode::serialize_into(&mut account.data[..metadata_len], &state)
        .expect("programdata metadata serializes");
    ctx.svm
        .set_account(address, account)
        .expect("programdata account updates");
}

pub fn task_type(name: &str) -> [u8; 32] {
    let digest = <sha2::Sha256 as sha2::Digest>::digest(name.as_bytes());
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest);
    out
}

pub struct Env {
    pub ctx: AnchorContext,
    pub admin: Keypair,
    pub certifier: Keypair,
    pub treasury: Pubkey,
    pub config: Pubkey,
}

pub fn setup() -> Env {
    setup_with(DEFAULT_BOND, DECAY_PERIOD_SECS)
}

/// A fresh LiteSVM context with the program deployed but no config initialized.
pub fn fresh_ctx() -> AnchorContext {
    AnchorLiteSVM::build_with_program(
        PROGRAM_ID,
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../target/deploy/taop_reputation.so"
        )),
    )
}

/// A fresh context with a funded admin that is also the program's upgrade
/// authority (mirroring a real deployment), ready for `initialize_config`.
pub fn fresh_ctx_with_admin(sol: u64) -> (AnchorContext, Keypair) {
    let mut ctx = fresh_ctx();
    let admin = funded(&mut ctx, sol);
    set_upgrade_authority(&mut ctx, &admin.pubkey());
    (ctx, admin)
}

pub fn initialize_config_ix(
    ctx: &AnchorContext,
    admin: &Pubkey,
    treasury: &Pubkey,
    certifier: &Pubkey,
    bond: u64,
    decay_period_secs: i64,
) -> solana_program::instruction::Instruction {
    ctx.program()
        .accounts(taop_reputation::client::accounts::InitializeConfig {
            config: config_pda(),
            admin: *admin,
            treasury: *treasury,
            program_data: program_data_pda(),
            system_program: anchor_lang::system_program::ID,
        })
        .args(taop_reputation::client::args::InitializeConfig {
            certifier: *certifier,
            challenge_bond_lamports: bond,
            decay_period_secs,
        })
        .instruction()
        .unwrap()
}

pub fn setup_with(bond: u64, decay_period_secs: i64) -> Env {
    let mut ctx = AnchorLiteSVM::build_with_program(
        PROGRAM_ID,
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../target/deploy/taop_reputation.so"
        )),
    );

    let admin = ctx.create_funded_account(100 * LAMPORTS_PER_SOL).unwrap();
    let certifier = ctx.create_funded_account(10 * LAMPORTS_PER_SOL).unwrap();
    let treasury = Keypair::new().pubkey();
    let config = config_pda();

    // Real deployments have the deployer as upgrade authority; initialize_config
    // requires that signer, so give the programdata account the same authority.
    set_upgrade_authority(&mut ctx, &admin.pubkey());

    let ix = ctx
        .program()
        .accounts(taop_reputation::client::accounts::InitializeConfig {
            config,
            admin: admin.pubkey(),
            treasury,
            program_data: program_data_pda(),
            system_program: anchor_lang::system_program::ID,
        })
        .args(taop_reputation::client::args::InitializeConfig {
            certifier: certifier.pubkey(),
            challenge_bond_lamports: bond,
            decay_period_secs,
        })
        .instruction()
        .unwrap();
    ctx.execute_instruction(ix, &[&admin])
        .unwrap()
        .assert_success();

    set_clock(&mut ctx, T0);

    Env {
        ctx,
        admin,
        certifier,
        treasury,
        config,
    }
}

pub fn set_clock(ctx: &mut AnchorContext, unix_timestamp: i64) {
    let mut clock: Clock = ctx.svm.get_sysvar();
    clock.unix_timestamp = unix_timestamp;
    ctx.svm.set_sysvar(&clock);
}

pub fn funded(ctx: &mut AnchorContext, sol: u64) -> Keypair {
    ctx.create_funded_account(sol * LAMPORTS_PER_SOL).unwrap()
}

impl Env {
    /// Execute an instruction with a fresh blockhash so that repeated calls with
    /// identical data are not rejected by LiteSVM as `AlreadyProcessed`.
    fn send(
        &mut self,
        ix: solana_program::instruction::Instruction,
        signers: &[&Keypair],
    ) -> TransactionResult {
        self.ctx.svm.expire_blockhash();
        self.ctx.execute_instruction(ix, signers).unwrap()
    }

    /// Execute an arbitrary instruction (e.g. a system transfer) through the harness.
    pub fn send_instruction(
        &mut self,
        ix: solana_program::instruction::Instruction,
        signers: &[&Keypair],
    ) -> TransactionResult {
        self.send(ix, signers)
    }

    /// Send lamports directly to any address, bypassing the program.
    pub fn donate(
        &mut self,
        donor: &Keypair,
        destination: &Pubkey,
        lamports: u64,
    ) -> TransactionResult {
        let ix =
            solana_system_interface::instruction::transfer(&donor.pubkey(), destination, lamports);
        self.send(ix, &[donor])
    }

    pub fn config_account(&self) -> Config {
        self.ctx.get_account(&self.config).unwrap()
    }

    pub fn agent(&self, authority: &Pubkey) -> Agent {
        self.ctx.get_account(&agent_pda(authority)).unwrap()
    }

    pub fn completion(&self, agent_authority: &Pubkey, seq: u64) -> Completion {
        self.ctx
            .get_account(&completion_pda(agent_authority, seq))
            .unwrap()
    }

    pub fn challenge_account(&self, completion: &Pubkey) -> Challenge {
        self.ctx.get_account(&challenge_pda(completion)).unwrap()
    }

    pub fn capability(&self, capability: &Pubkey) -> Capability {
        self.ctx.get_account(capability).unwrap()
    }

    pub fn lamports(&self, address: &Pubkey) -> u64 {
        self.ctx
            .svm
            .get_account(address)
            .map(|a| a.lamports)
            .unwrap_or(0)
    }

    pub fn exists(&self, address: &Pubkey) -> bool {
        self.ctx.svm.get_account(address).is_some()
    }

    pub fn rent_min(&self) -> u64 {
        self.ctx
            .svm
            .get_sysvar::<solana_program::rent::Rent>()
            .minimum_balance(0)
    }

    pub fn update_config(
        &mut self,
        authority: &Keypair,
        bond: Option<u64>,
        decay: Option<i64>,
        paused: Option<bool>,
    ) -> TransactionResult {
        let ix = self
            .ctx
            .program()
            .accounts(taop_reputation::client::accounts::UpdateConfig {
                config: self.config,
                admin: authority.pubkey(),
            })
            .args(taop_reputation::client::args::UpdateConfig {
                challenge_bond_lamports: bond,
                decay_period_secs: decay,
                paused,
            })
            .instruction()
            .unwrap();
        self.send(ix, &[authority])
    }

    pub fn set_certifier(&mut self, authority: &Keypair, certifier: &Pubkey) -> TransactionResult {
        let ix = self
            .ctx
            .program()
            .accounts(taop_reputation::client::accounts::SetCertifier {
                config: self.config,
                admin: authority.pubkey(),
            })
            .args(taop_reputation::client::args::SetCertifier {
                certifier: *certifier,
            })
            .instruction()
            .unwrap();
        self.send(ix, &[authority])
    }

    pub fn transfer_admin(&mut self, admin: &Keypair, new_admin: &Pubkey) -> TransactionResult {
        let ix = self
            .ctx
            .program()
            .accounts(taop_reputation::client::accounts::TransferAdmin {
                config: self.config,
                pending: pending_admin_pda(),
                admin: admin.pubkey(),
                system_program: anchor_lang::system_program::ID,
            })
            .args(taop_reputation::client::args::TransferAdmin {
                new_admin: *new_admin,
            })
            .instruction()
            .unwrap();
        self.send(ix, &[admin])
    }

    pub fn accept_admin(&mut self, new_admin: &Keypair) -> TransactionResult {
        let ix = self
            .ctx
            .program()
            .accounts(taop_reputation::client::accounts::AcceptAdmin {
                config: self.config,
                pending: pending_admin_pda(),
                new_admin: new_admin.pubkey(),
            })
            .args(taop_reputation::client::args::AcceptAdmin {})
            .instruction()
            .unwrap();
        self.send(ix, &[new_admin])
    }

    pub fn register_agent(&mut self, authority: &Keypair, metadata_uri: &str) -> TransactionResult {
        let ix = self
            .ctx
            .program()
            .accounts(taop_reputation::client::accounts::RegisterAgent {
                agent: agent_pda(&authority.pubkey()),
                authority: authority.pubkey(),
                system_program: anchor_lang::system_program::ID,
            })
            .args(taop_reputation::client::args::RegisterAgent {
                metadata_uri: metadata_uri.to_string(),
            })
            .instruction()
            .unwrap();
        self.send(ix, &[authority])
    }

    pub fn attest(
        &mut self,
        authority: &Keypair,
        task: [u8; 32],
        result_uri: &str,
        seq: u64,
    ) -> TransactionResult {
        let ix = self
            .ctx
            .program()
            .accounts(taop_reputation::client::accounts::AttestCompletion {
                config: self.config,
                agent: agent_pda(&authority.pubkey()),
                completion: completion_pda(&authority.pubkey(), seq),
                authority: authority.pubkey(),
                system_program: anchor_lang::system_program::ID,
            })
            .args(taop_reputation::client::args::AttestCompletion {
                task_type: task,
                result_uri: result_uri.to_string(),
                completion_seq: seq,
            })
            .instruction()
            .unwrap();
        self.send(ix, &[authority])
    }

    pub fn challenge(
        &mut self,
        completion: &Pubkey,
        challenger: &Keypair,
        evidence_uri: &str,
    ) -> TransactionResult {
        let ix = self
            .ctx
            .program()
            .accounts(taop_reputation::client::accounts::ChallengeCompletion {
                config: self.config,
                completion: *completion,
                challenge: challenge_pda(completion),
                challenge_vault: challenge_vault_pda(completion),
                challenger: challenger.pubkey(),
                system_program: anchor_lang::system_program::ID,
            })
            .args(taop_reputation::client::args::ChallengeCompletion {
                evidence_uri: evidence_uri.to_string(),
            })
            .instruction()
            .unwrap();
        self.send(ix, &[challenger])
    }

    pub fn resolve(
        &mut self,
        authority: &Keypair,
        completion: &Pubkey,
        upheld: bool,
    ) -> TransactionResult {
        let completion_account = self.ctx.get_account::<Completion>(completion).unwrap();
        // Missing challenge accounts fall back to a dummy recipient so the
        // transaction fails on-chain (instead of panicking in the harness).
        let challenger = self
            .ctx
            .get_account::<Challenge>(&challenge_pda(completion))
            .map(|c| c.challenger)
            .unwrap_or_else(|_| Pubkey::new_unique());
        let ix = self
            .ctx
            .program()
            .accounts(taop_reputation::client::accounts::ResolveChallenge {
                config: self.config,
                completion: *completion,
                agent: agent_pda(&completion_account.agent),
                challenge: challenge_pda(completion),
                challenge_vault: challenge_vault_pda(completion),
                challenger,
                treasury: self.treasury,
                authority: authority.pubkey(),
                system_program: anchor_lang::system_program::ID,
            })
            .args(taop_reputation::client::args::ResolveChallenge { upheld })
            .instruction()
            .unwrap();
        self.send(ix, &[authority])
    }

    pub fn register_capability(
        &mut self,
        creator: &Keypair,
        capability_type: [u8; 32],
        metadata_uri: &str,
        id: u64,
        bond_lamports: u64,
    ) -> TransactionResult {
        let capability = capability_pda(&capability_type, &creator.pubkey(), id);
        let ix = self
            .ctx
            .program()
            .accounts(taop_reputation::client::accounts::RegisterCapability {
                config: self.config,
                index: cap_index_pda(&capability_type),
                capability,
                capability_vault: capability_vault_pda(&capability),
                creator: creator.pubkey(),
                system_program: anchor_lang::system_program::ID,
            })
            .args(taop_reputation::client::args::RegisterCapability {
                capability_type,
                metadata_uri: metadata_uri.to_string(),
                capability_id: id,
                bond_lamports,
            })
            .instruction()
            .unwrap();
        self.send(ix, &[creator])
    }

    pub fn certify(&mut self, authority: &Keypair, capability: &Pubkey) -> TransactionResult {
        let ix = self
            .ctx
            .program()
            .accounts(taop_reputation::client::accounts::CertifyCapability {
                config: self.config,
                capability: *capability,
                authority: authority.pubkey(),
            })
            .args(taop_reputation::client::args::CertifyCapability {})
            .instruction()
            .unwrap();
        self.send(ix, &[authority])
    }

    pub fn slash(
        &mut self,
        authority: &Keypair,
        capability: &Pubkey,
        penalty_lamports: u64,
    ) -> TransactionResult {
        let ix = self
            .ctx
            .program()
            .accounts(taop_reputation::client::accounts::SlashCapability {
                config: self.config,
                capability: *capability,
                capability_vault: capability_vault_pda(capability),
                treasury: self.treasury,
                authority: authority.pubkey(),
                system_program: anchor_lang::system_program::ID,
            })
            .args(taop_reputation::client::args::SlashCapability { penalty_lamports })
            .instruction()
            .unwrap();
        self.send(ix, &[authority])
    }

    pub fn withdraw_bond(&mut self, creator: &Keypair, capability: &Pubkey) -> TransactionResult {
        let ix = self
            .ctx
            .program()
            .accounts(taop_reputation::client::accounts::WithdrawCapabilityBond {
                config: self.config,
                capability: *capability,
                capability_vault: capability_vault_pda(capability),
                creator: creator.pubkey(),
                system_program: anchor_lang::system_program::ID,
            })
            .args(taop_reputation::client::args::WithdrawCapabilityBond {})
            .instruction()
            .unwrap();
        self.send(ix, &[creator])
    }

    /// Read the score via the on-chain `get_score` instruction (simulated).
    pub fn get_score(&self, agent_authority: &Pubkey) -> ScoreView {
        let ix = self
            .ctx
            .program()
            .accounts(taop_reputation::client::accounts::GetScore {
                config: self.config,
                agent: agent_pda(agent_authority),
            })
            .args(taop_reputation::client::args::GetScore {})
            .instruction()
            .unwrap();
        let payer = self.ctx.payer();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&payer.pubkey()),
            &[payer],
            self.ctx.svm.latest_blockhash(),
        );
        let simulated = self.ctx.svm.simulate_transaction(tx).unwrap();
        ScoreView::try_from_slice(&simulated.meta.return_data.data).unwrap()
    }
}
