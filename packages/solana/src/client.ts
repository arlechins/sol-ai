import fs from "node:fs";
import * as anchor from "@anchor-lang/core";
import type { Wallet } from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";

import idlJson from "./idl/taop_reputation.json";
import type { TaopReputation } from "./idl/taop_reputation";
import { mapError, TaopSolanaError } from "./errors";
import { computeScore, createPdas, hashType, typeToHex, type Pdas } from "./pda";
import type {
  AgentRecord,
  AttestInput,
  AttestResult,
  CapabilityRecord,
  ChallengeInput,
  ChallengeRecord,
  CompletionRecord,
  DiscoverInput,
  DiscoveryItem,
  RegisterCapabilityInput,
  ResolveInput,
  ScoreView,
  SolanaDeployment,
} from "./types";

export const TAOP_PROGRAM_ID = new PublicKey(idlJson.address);

export interface TaopSolanaClientConfig {
  connection: Connection;
  /** Wallet used for writes; omit for read-only usage. */
  wallet?: Wallet | Keypair;
  programId?: PublicKey;
}

export interface TaopConfigRecord {
  admin: PublicKey;
  certifier: PublicKey;
  treasury: PublicKey;
  challengeBondLamports: number;
  decayPeriodSecs: number;
  paused: boolean;
  nextCompletionId: number;
  nextCapabilityId: number;
}

export class TaopSolanaClient {
  readonly connection: Connection;
  readonly programId: PublicKey;
  readonly pdas: Pdas;
  readonly provider: anchor.AnchorProvider;
  readonly program: anchor.Program<TaopReputation>;
  private readonly wallet?: Wallet;

  constructor(config: TaopSolanaClientConfig) {
    this.connection = config.connection;
    this.programId = config.programId ?? TAOP_PROGRAM_ID;
    this.pdas = createPdas(this.programId);
    this.wallet = config.wallet ? normalizeWallet(config.wallet) : undefined;
    this.provider = new anchor.AnchorProvider(
      this.connection,
      this.wallet ?? READONLY_WALLET,
      { commitment: "confirmed" },
    );
    this.program = new anchor.Program(idlJson as unknown as TaopReputation, this.provider);
  }

  get walletPublicKey(): PublicKey | undefined {
    return this.wallet?.publicKey;
  }

  private requireWallet(): PublicKey {
    const pk = this.walletPublicKey;
    if (!pk) {
      throw new Error(
        "This operation requires a wallet. Construct TaopSolanaClient with { wallet }.",
      );
    }
    return pk;
  }

  async clusterTime(): Promise<number> {
    const slot = await this.connection.getSlot("confirmed");
    const blockTime = await this.connection.getBlockTime(slot);
    return blockTime ?? Math.floor(Date.now() / 1000);
  }

  async getConfig(): Promise<TaopConfigRecord> {
    const raw = await this.program.account.config.fetch(this.pdas.config);
    return {
      admin: raw.admin,
      certifier: raw.certifier,
      treasury: raw.treasury,
      challengeBondLamports: bnToNumber(raw.challengeBondLamports),
      decayPeriodSecs: bnToNumber(raw.decayPeriodSecs),
      paused: raw.paused,
      nextCompletionId: bnToNumber(raw.nextCompletionId),
      nextCapabilityId: bnToNumber(raw.nextCapabilityId),
    };
  }

  async getAgent(authority: PublicKey): Promise<AgentRecord | null> {
    const agents = await this.fetchAgents([authority]);
    return agents.get(authority.toBase58()) ?? null;
  }

  /** Batch-fetch agent records via a single getMultipleAccounts call. */
  async fetchAgents(authorities: PublicKey[]): Promise<Map<string, AgentRecord>> {
    const unique = new Map<string, PublicKey>();
    for (const authority of authorities) unique.set(authority.toBase58(), authority);
    const keys = [...unique.values()];
    const pdas = keys.map((key) => this.pdas.agent(key));
    const infos = pdas.length
      ? await this.connection.getMultipleAccountsInfo(pdas)
      : [];

    const out = new Map<string, AgentRecord>();
    for (let i = 0; i < keys.length; i += 1) {
      const info = infos[i];
      if (!info) continue;
      const raw = this.program.coder.accounts.decode("agent", info.data) as {
        authority: PublicKey;
        completions: anchor.BN;
        disputes: anchor.BN;
        lastActivity: anchor.BN;
        metadataUri: string;
      };
      out.set(keys[i].toBase58(), {
        authority: raw.authority,
        completions: bnToNumber(raw.completions),
        disputes: bnToNumber(raw.disputes),
        lastActivity: bnToNumber(raw.lastActivity),
        metadataUri: raw.metadataUri,
      });
    }
    return out;
  }

  async getCompletion(completion: PublicKey): Promise<CompletionRecord | null> {
    const raw = await this.program.account.completion
      .fetchNullable(completion)
      .catch(() => null);
    if (!raw) return null;
    return {
      id: bnToNumber(raw.id),
      agent: raw.agent,
      taskType: Array.from(raw.taskType as number[]),
      resultUri: raw.resultUri,
      timestamp: bnToNumber(raw.timestamp),
      challenged: raw.challenged,
      disputed: raw.disputed,
    };
  }

  async getChallenge(completion: PublicKey): Promise<ChallengeRecord | null> {
    const raw = await this.program.account.challenge
      .fetchNullable(this.pdas.challenge(completion))
      .catch(() => null);
    if (!raw) return null;
    return {
      completion: raw.completion,
      challenger: raw.challenger,
      evidenceUri: raw.evidenceUri,
      timestamp: bnToNumber(raw.timestamp),
      resolved: raw.resolved,
      upheld: raw.upheld,
      bondLamports: bnToNumber(raw.bondLamports),
    };
  }

  async getCapability(capability: PublicKey): Promise<CapabilityRecord | null> {
    const raw = await this.program.account.capability
      .fetchNullable(capability)
      .catch(() => null);
    if (!raw) return null;
    return decodeCapability(raw);
  }

  /**
   * Score with inactivity decay applied, computed locally from chain state.
   * The same value is returned by the on-chain `get_score` instruction.
   */
  async getScore(agent: PublicKey): Promise<ScoreView> {
    const [record, config, now] = await Promise.all([
      this.getAgent(agent),
      this.getConfig(),
      this.clusterTime(),
    ]);
    if (!record) {
      return {
        completions: 0,
        disputes: 0,
        score: 0,
        lastActivity: 0,
        decayed: false,
      };
    }
    const breakdown = computeScore({
      completions: record.completions,
      disputes: record.disputes,
      lastActivity: record.lastActivity,
      now,
      decayPeriodSecs: config.decayPeriodSecs,
    });
    return {
      completions: breakdown.completions,
      disputes: breakdown.disputes,
      score: breakdown.score,
      lastActivity: record.lastActivity,
      decayed: breakdown.decayed,
    };
  }

  /**
   * Read the score via the on-chain `get_score` instruction (simulated).
   * Requires a wallet: the simulation needs a fee payer that exists on-chain
   * and can cover fees. Read-only clients should use `getScore`, which computes
   * the same decayed value from account data.
   */
  async getScoreOnChain(agent: PublicKey): Promise<ScoreView> {
    const feePayer = this.walletPublicKey;
    if (!feePayer) {
      throw new TaopSolanaError(
        "WalletRequired",
        "getScoreOnChain requires a wallet as the simulation fee payer; use getScore for read-only clients",
      );
    }
    const ix = await this.program.methods
      .getScore()
      .accountsStrict({ config: this.pdas.config, agent: this.pdas.agent(agent) })
      .instruction();
    const tx = new Transaction().add(ix);
    tx.feePayer = feePayer;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    const simulation = await this.connection.simulateTransaction(tx);
    if (simulation.value.err) {
      throw mapError(
        new Error(
          `get_score simulation failed: ${JSON.stringify(simulation.value.err)}`,
        ),
      );
    }
    const encoded = simulation.value.returnData?.data?.[0];
    if (!encoded) {
      throw new TaopSolanaError(
        "AccountNotFound",
        "get_score returned no data (has the agent attested yet?)",
      );
    }
    return decodeScoreView(Buffer.from(encoded, "base64"));
  }

  /** Discover certified, non-slashed capabilities ranked by creator score. */
  async discover(input: DiscoverInput): Promise<DiscoveryItem[]> {
    const typeBytes = toBytes(input.capabilityType);
    const minScore = input.minScore ?? 0;

    let capabilityKeys: PublicKey[] = [];
    const indexPda = this.pdas.capabilityIndex(typeBytes);
    const index = await this.program.account.capabilityIndex
      .fetchNullable(indexPda)
      .catch(() => null);
    if (index) {
      capabilityKeys = (index.capabilities as PublicKey[]).slice();
    } else if (this.hasAccountType("capabilityIndex")) {
      capabilityKeys = await this.discoverByAccountScan(typeBytes);
    }

    const infos = capabilityKeys.length
      ? await this.connection.getMultipleAccountsInfo(capabilityKeys)
      : [];

    const decodedCapabilities = capabilityKeys.map((key, i) => {
      const info = infos[i];
      if (!info) return null;
      const decoded = decodeCapabilityByCoder(this.program, info.data);
      if (!decoded || !decoded.active || decoded.slashed) return null;
      if (!input.includeUncertified && !decoded.certified) return null;
      return { key, decoded };
    });

    const creators = decodedCapabilities
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .map((entry) => entry.decoded.creator);
    const [agents, config, now] = await Promise.all([
      this.fetchAgents(creators),
      this.getConfig(),
      this.clusterTime(),
    ]);

    const items: DiscoveryItem[] = [];
    for (const entry of decodedCapabilities) {
      if (!entry) continue;
      const { key, decoded } = entry;
      const agent = agents.get(decoded.creator.toBase58());
      const breakdown = computeScore({
        completions: agent?.completions ?? 0,
        disputes: agent?.disputes ?? 0,
        lastActivity: agent?.lastActivity ?? 0,
        now,
        decayPeriodSecs: config.decayPeriodSecs,
      });
      if (breakdown.score < minScore) continue;

      items.push({
        agent: decoded.creator.toBase58(),
        capability: key.toBase58(),
        capabilityId: decoded.id,
        capabilityType: typeToHex(decoded.capabilityType),
        certified: decoded.certified,
        slashed: decoded.slashed,
        bondLamports: decoded.bondRemaining,
        metadataUri: decoded.metadataUri,
        completions: breakdown.completions,
        disputes: breakdown.disputes,
        score: breakdown.score,
        decayed: breakdown.decayed,
      });
    }

    items.sort((a, b) => b.score - a.score);
    return items;
  }

  private hasAccountType(name: string): boolean {
    return Boolean((this.program.account as Record<string, unknown>)[name]);
  }

  private async discoverByAccountScan(
    typeBytes: number[],
  ): Promise<PublicKey[]> {
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: [
        {
          memcmp: {
            offset: 8 + 8 + 32,
            bytes: bs58.encode(Buffer.from(typeBytes)),
          },
        },
      ],
    });
    return accounts.map((entry) => entry.pubkey);
  }

  /** Initialize protocol config (one-time; the caller becomes admin). */
  async initializeConfig(input: {
    certifier: PublicKey;
    treasury: PublicKey;
    challengeBondLamports: number | bigint;
    decayPeriodSecs: number | bigint;
  }): Promise<string> {
    const admin = this.requireWallet();
    const signature = await this.program.methods
      .initializeConfig(
        input.certifier,
        new anchor.BN(input.challengeBondLamports.toString()),
        new anchor.BN(input.decayPeriodSecs.toString()),
      )
      .accountsStrict({
        config: this.pdas.config,
        admin,
        treasury: input.treasury,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
      .catch((error) => {
        throw mapError(error);
      });
    return signature;
  }

  /** Update bond/decay/pause parameters (admin only). */
  async updateConfig(input: {
    challengeBondLamports?: number | bigint;
    decayPeriodSecs?: number | bigint;
    paused?: boolean;
  }): Promise<string> {
    const admin = this.requireWallet();
    const signature = await this.program.methods
      .updateConfig(
        input.challengeBondLamports !== undefined
          ? new anchor.BN(input.challengeBondLamports.toString())
          : null,
        input.decayPeriodSecs !== undefined
          ? new anchor.BN(input.decayPeriodSecs.toString())
          : null,
        input.paused ?? null,
      )
      .accountsStrict({ config: this.pdas.config, admin })
      .rpc()
      .catch((error) => {
        throw mapError(error);
      });
    return signature;
  }

  /** Update the certifier authority (admin only). */
  async setCertifier(certifier: PublicKey): Promise<string> {
    const admin = this.requireWallet();
    const signature = await this.program.methods
      .setCertifier(certifier)
      .accountsStrict({ config: this.pdas.config, admin })
      .rpc()
      .catch((error) => {
        throw mapError(error);
      });
    return signature;
  }

  /** Register or update the caller's agent profile. */
  async registerAgent(metadataUri: string): Promise<string> {
    const authority = this.requireWallet();
    const signature = await this.program.methods
      .registerAgent(metadataUri)
      .accountsStrict({
        agent: this.pdas.agent(authority),
        authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
      .catch((error) => {
        throw mapError(error);
      });
    return signature;
  }

  /** Self-attest a completion. Creates the agent profile on first use. */
  async attest(input: AttestInput): Promise<AttestResult> {
    const authority = this.requireWallet();
    const seq =
      input.seq !== undefined
        ? Number(input.seq)
        : (await this.getAgent(authority))?.completions ?? 0;
    const completion = this.pdas.completion(authority, seq);

    const signature = await this.program.methods
      .attestCompletion(toBytes(input.taskType), input.resultUri, new anchor.BN(seq))
      .accountsStrict({
        config: this.pdas.config,
        agent: this.pdas.agent(authority),
        completion,
        authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
      .catch((error) => {
        throw mapError(error);
      });

    const record = await this.getCompletion(completion);
    return { signature, completion, completionId: record?.id ?? -1 };
  }

  /** Challenge a completion with the configured native SOL bond. */
  async challenge(input: ChallengeInput): Promise<string> {
    const challenger = this.requireWallet();
    const completion = await this.program.account.completion.fetch(input.completion);
    if (completion.challenged) {
      throw new TaopSolanaError(
        "AlreadyChallenged",
        "Completion has already been challenged",
      );
    }
    return this.program.methods
      .challengeCompletion(input.evidenceUri)
      .accountsStrict({
        config: this.pdas.config,
        completion: input.completion,
        challenge: this.pdas.challenge(input.completion),
        challengeVault: this.pdas.challengeVault(input.completion),
        challenger,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
      .catch((error) => {
        throw mapError(error);
      });
  }

  /** Resolve a pending challenge (admin or certifier only). */
  async resolveChallenge(input: ResolveInput): Promise<string> {
    const authority = this.requireWallet();
    const [completion, challenge, config] = await Promise.all([
      this.program.account.completion.fetch(input.completion),
      this.getChallenge(input.completion),
      this.getConfig(),
    ]);
    if (!challenge) throw new Error("No challenge recorded for this completion");

    return this.program.methods
      .resolveChallenge(input.upheld)
      .accountsStrict({
        config: this.pdas.config,
        completion: input.completion,
        agent: this.pdas.agent(completion.agent),
        challenge: this.pdas.challenge(input.completion),
        challengeVault: this.pdas.challengeVault(input.completion),
        challenger: challenge.challenger,
        treasury: config.treasury,
        authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
      .catch((error) => {
        throw mapError(error);
      });
  }

  /** Register a capability with a slashable native SOL bond. */
  async registerCapability(
    input: RegisterCapabilityInput,
  ): Promise<{ signature: string; capability: PublicKey; capabilityId: number }> {
    const creator = this.requireWallet();
    const id =
      input.id !== undefined
        ? Number(input.id)
        : (await this.getConfig()).nextCapabilityId;
    const typeBytes = toBytes(input.capabilityType);
    const capability = this.pdas.capability(typeBytes, creator, id);

    const signature = await this.program.methods
      .registerCapability(
        typeBytes,
        input.metadataUri,
        new anchor.BN(id),
        new anchor.BN(input.bondLamports.toString()),
      )
      .accountsStrict({
        config: this.pdas.config,
        index: this.pdas.capabilityIndex(typeBytes),
        capability,
        capabilityVault: this.pdas.capabilityVault(capability),
        creator,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
      .catch((error) => {
        throw mapError(error);
      });

    return { signature, capability, capabilityId: id };
  }

  /** Certify a capability (admin or certifier only). */
  async certifyCapability(capability: PublicKey): Promise<string> {
    const authority = this.requireWallet();
    return this.program.methods
      .certifyCapability()
      .accountsStrict({ config: this.pdas.config, capability, authority })
      .rpc()
      .catch((error) => {
        throw mapError(error);
      });
  }

  /** Slash a capability bond (admin or certifier only). */
  async slashCapability(
    capability: PublicKey,
    penaltyLamports: number | bigint,
  ): Promise<string> {
    const authority = this.requireWallet();
    const config = await this.getConfig();
    return this.program.methods
      .slashCapability(new anchor.BN(penaltyLamports.toString()))
      .accountsStrict({
        config: this.pdas.config,
        capability,
        capabilityVault: this.pdas.capabilityVault(capability),
        treasury: config.treasury,
        authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
      .catch((error) => {
        throw mapError(error);
      });
  }

  /** Withdraw the remaining capability bond and close the record (creator only). */
  async withdrawCapabilityBond(capability: PublicKey): Promise<string> {
    const creator = this.requireWallet();
    return this.program.methods
      .withdrawCapabilityBond()
      .accountsStrict({
        config: this.pdas.config,
        capability,
        capabilityVault: this.pdas.capabilityVault(capability),
        creator,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
      .catch((error) => {
        throw mapError(error);
      });
  }
}

/** Placeholder used only to satisfy AnchorProvider for read-only clients. */
const READONLY_WALLET: Wallet = {
  publicKey: PublicKey.default,
  signTransaction: async (tx) => tx,
  signAllTransactions: async (txs) => txs,
} as Wallet;

export function normalizeWallet(wallet: Wallet | Keypair): Wallet {
  if (wallet instanceof Keypair) return walletFromKeypair(wallet);
  return wallet;
}

/** Minimal Wallet implementation over a Keypair (no runtime import from Anchor). */
function walletFromKeypair(keypair: Keypair): Wallet {
  return {
    publicKey: keypair.publicKey,
    payer: keypair,
    signTransaction: async <T>(transaction: T): Promise<T> => {
      (transaction as unknown as { partialSign(kp: Keypair): void }).partialSign(keypair);
      return transaction;
    },
    signAllTransactions: async <T>(transactions: T[]): Promise<T[]> => {
      for (const transaction of transactions) {
        (transaction as unknown as { partialSign(kp: Keypair): void }).partialSign(keypair);
      }
      return transactions;
    },
  } as unknown as Wallet;
}

function toBytes(value: string | number[] | Uint8Array): number[] {
  if (typeof value === "string") return hashType(value);
  return Array.from(value);
}

function bnToNumber(value: anchor.BN | number | bigint): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return Number(value.toString());
}

function decodeCapability(raw: Record<string, unknown>): CapabilityRecord {
  return {
    id: bnToNumber(raw.id as anchor.BN),
    creator: raw.creator as PublicKey,
    capabilityType: Array.from(raw.capabilityType as number[]),
    metadataUri: raw.metadataUri as string,
    bondRemaining: bnToNumber(raw.bondRemaining as anchor.BN),
    certified: Boolean(raw.certified),
    slashed: Boolean(raw.slashed),
    active: Boolean(raw.active),
  };
}

function decodeCapabilityByCoder(
  program: anchor.Program<TaopReputation>,
  data: Buffer,
): CapabilityRecord | null {
  try {
    const raw = program.coder.accounts.decode("capability", data) as Record<
      string,
      unknown
    >;
    return decodeCapability(raw);
  } catch {
    return null;
  }
}

function decodeScoreView(data: Buffer): ScoreView {
  if (data.length < 33) {
    throw new Error(`Unexpected get_score payload length: ${data.length}`);
  }
  return {
    completions: Number(data.readBigUInt64LE(0)),
    disputes: Number(data.readBigUInt64LE(8)),
    score: Number(data.readBigUInt64LE(16)),
    lastActivity: Number(data.readBigInt64LE(24)),
    decayed: data.readUInt8(32) !== 0,
  };
}

/** Load a deployments.solana.json file written by the deploy scripts. */
export function loadDeployment(path: string): SolanaDeployment {
  const raw = fs.readFileSync(path, "utf8");
  return JSON.parse(raw) as SolanaDeployment;
}

export function clientFromDeployment(
  deployment: SolanaDeployment,
  config: Omit<TaopSolanaClientConfig, "programId">,
): TaopSolanaClient {
  return new TaopSolanaClient({
    ...config,
    programId: new PublicKey(deployment.programId),
  });
}
