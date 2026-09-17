import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  TaopSolanaClient,
  clientFromDeployment,
  loadDeployment,
  type SolanaDeployment,
} from "@taopp/solana";

import {
  requiredSignerError,
  type ChainAdapter,
  type DiscoveryResult,
  type ScoreResult,
} from "./types";

const LAMPORTS_PER_SOL = 1_000_000_000;
const DEFAULT_BOND_SOL = "0.005";

function expandHome(value: string): string {
  if (!value.startsWith("~")) return value;
  return path.join(os.homedir(), value.slice(2));
}

export function loadKeypair(value: string): Keypair {
  const expanded = expandHome(value);
  if (expanded.endsWith(".json") || fs.existsSync(expanded)) {
    const secret = JSON.parse(fs.readFileSync(expanded, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }
  return Keypair.fromSecretKey(bs58.decode(value));
}

export class SolanaAdapter implements ChainAdapter {
  readonly chain = "solana" as const;
  private readonly client: TaopSolanaClient;
  private readonly deployment?: SolanaDeployment;
  private readonly rpcUrl: string;

  constructor() {
    this.rpcUrl =
      process.env.SOLANA_RPC_URL ??
      process.env.TAOP_SOLANA_RPC_URL ??
      "https://api.devnet.solana.com";

    const deploymentsPath = process.env.SOLANA_DEPLOYMENTS_PATH;
    if (deploymentsPath && fs.existsSync(expandHome(deploymentsPath))) {
      this.deployment = loadDeployment(expandHome(deploymentsPath));
    }

    const keypairValue =
      process.env.SOLANA_KEYPAIR ??
      process.env.SOLANA_PRIVATE_KEY ??
      process.env.ANCHOR_WALLET;
    const wallet = keypairValue ? loadKeypair(keypairValue) : undefined;

    const connection = new Connection(this.rpcUrl, "confirmed");
    const programIdValue =
      process.env.SOLANA_PROGRAM_ID ?? this.deployment?.programId;
    const programId = programIdValue ? new PublicKey(programIdValue) : undefined;

    this.client = new TaopSolanaClient({ connection, wallet, programId });
  }

  private requireWallet(): void {
    if (!this.client.walletPublicKey) {
      throw requiredSignerError("solana", "SOLANA_KEYPAIR");
    }
  }

  async deploymentInfo(): Promise<Record<string, unknown>> {
    return {
      chain: this.chain,
      rpcUrl: this.rpcUrl,
      programId: this.client.programId.toBase58(),
      config: this.client.pdas.config.toBase58(),
      wallet: this.client.walletPublicKey?.toBase58() ?? null,
      deploymentsPath: this.deployment?.deployedAt ?? null,
    };
  }

  async getAgentScore(agent: string): Promise<ScoreResult> {
    const score = await this.client.getScore(new PublicKey(agent));
    return {
      agent,
      completions: score.completions,
      disputes: score.disputes,
      score: score.score,
      decayed: score.decayed,
      lastActivity: score.lastActivity,
    };
  }

  async discoverCapabilities(input: {
    capabilityType: string;
    minScore?: number;
  }): Promise<DiscoveryResult[]> {
    const items = await this.client.discover(input);
    return items.map((item) => ({
      agent: item.agent,
      capabilityId: item.capability,
      capabilityType: input.capabilityType,
      certified: item.certified,
      slashed: item.slashed,
      bond: `${(item.bondLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`,
      metadataUri: item.metadataUri,
      completions: item.completions,
      disputes: item.disputes,
      score: item.score,
    }));
  }

  async getCapability(id: string): Promise<Record<string, unknown>> {
    const capability = await this.client.getCapability(new PublicKey(id));
    if (!capability) return { capabilityId: id, exists: false };
    return {
      capabilityId: id,
      creator: capability.creator.toBase58(),
      capabilityType: Buffer.from(capability.capabilityType).toString("hex"),
      certified: capability.certified,
      slashed: capability.slashed,
      active: capability.active,
      bondRemaining: `${capability.bondRemaining / LAMPORTS_PER_SOL} SOL`,
      metadataUri: capability.metadataUri,
    };
  }

  async getCompletion(id: string): Promise<Record<string, unknown>> {
    const completion = await this.client.getCompletion(new PublicKey(id));
    if (!completion) return { completionId: id, exists: false };
    return {
      completionId: id,
      agent: completion.agent.toBase58(),
      taskType: Buffer.from(completion.taskType).toString("hex"),
      resultUri: completion.resultUri,
      timestamp: completion.timestamp,
      challenged: completion.challenged,
      disputed: completion.disputed,
    };
  }

  async attestCompletion(input: {
    taskType: string;
    resultUri: string;
  }): Promise<Record<string, unknown>> {
    this.requireWallet();
    const result = await this.client.attest({
      taskType: input.taskType,
      resultUri: input.resultUri,
    });
    return {
      success: true,
      chain: this.chain,
      completion: result.completion.toBase58(),
      completionId: result.completionId,
      signature: result.signature,
      agent: this.client.walletPublicKey?.toBase58(),
    };
  }

  async challengeCompletion(input: {
    completion: string;
    evidenceUri: string;
  }): Promise<Record<string, unknown>> {
    this.requireWallet();
    const completion = new PublicKey(input.completion);
    const signature = await this.client.challenge({
      completion,
      evidenceUri: input.evidenceUri,
    });
    const challenge = await this.client.getChallenge(completion);
    return {
      success: true,
      chain: this.chain,
      completion: input.completion,
      signature,
      bondLamports: challenge?.bondLamports,
      challenger: this.client.walletPublicKey?.toBase58(),
    };
  }

  async registerCapability(input: {
    capabilityType: string;
    metadataUri: string;
    bond: string;
  }): Promise<Record<string, unknown>> {
    this.requireWallet();
    const bondSol = input.bond || DEFAULT_BOND_SOL;
    const bondLamports = Math.round(Number.parseFloat(bondSol) * LAMPORTS_PER_SOL);
    const result = await this.client.registerCapability({
      capabilityType: input.capabilityType,
      metadataUri: input.metadataUri,
      bondLamports,
    });
    return {
      success: true,
      chain: this.chain,
      capability: result.capability.toBase58(),
      capabilityId: result.capabilityId,
      signature: result.signature,
      bond: `${bondSol} SOL`,
    };
  }

  async resolveChallenge(input: {
    completion: string;
    upheld: boolean;
  }): Promise<Record<string, unknown>> {
    this.requireWallet();
    const signature = await this.client.resolveChallenge({
      completion: new PublicKey(input.completion),
      upheld: input.upheld,
    });
    return {
      success: true,
      chain: this.chain,
      completion: input.completion,
      upheld: input.upheld,
      signature,
    };
  }
}
