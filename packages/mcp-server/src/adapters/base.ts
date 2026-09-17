import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import {
  CapabilityRegistryClient,
  ReputationOracleNetworkClient,
  type Deployment,
} from "@taopp/sdk";

import {
  requiredSignerError,
  type ChainAdapter,
  type DiscoveryResult,
  type ScoreResult,
} from "./types";

function expandHome(value: string): string {
  if (!value.startsWith("~")) return value;
  return path.join(process.env.HOME ?? "", value.slice(2));
}

export class BaseAdapter implements ChainAdapter {
  readonly chain = "base" as const;
  private readonly rpcUrl: string;
  private readonly provider: ethers.JsonRpcProvider;
  private readonly deployment: Deployment;
  private readonly signer?: ethers.Wallet;

  constructor() {
    this.rpcUrl =
      process.env.BASE_RPC_URL ??
      process.env.RPC_URL ??
      "https://sepolia.base.org";

    const deploymentsPath =
      process.env.DEPLOYMENTS_PATH ??
      path.resolve(process.cwd(), "deployments.json");

    if (!fs.existsSync(expandHome(deploymentsPath))) {
      throw new Error(
        `Base adapter: deployments file not found at ${deploymentsPath}. Set DEPLOYMENTS_PATH.`,
      );
    }
    const raw = JSON.parse(
      fs.readFileSync(expandHome(deploymentsPath), "utf8"),
    ) as Deployment;
    this.deployment = raw;

    this.provider = new ethers.JsonRpcProvider(this.rpcUrl, raw.chainId);
    const pk =
      process.env.BASE_PRIVATE_KEY ??
      process.env.PRIVATE_KEY ??
      process.env.DEPLOYER_PK;
    if (pk) this.signer = new ethers.Wallet(pk, this.provider);
  }

  private requireSigner(): ethers.Wallet {
    if (!this.signer) {
      throw requiredSignerError("base", "PRIVATE_KEY");
    }
    return this.signer;
  }

  private readRon(): ReputationOracleNetworkClient {
    return new ReputationOracleNetworkClient(this.deployment.ron, this.provider);
  }

  private readRegistry(): CapabilityRegistryClient {
    return new CapabilityRegistryClient(
      this.deployment.registry,
      this.provider,
    );
  }

  async deploymentInfo(): Promise<Record<string, unknown>> {
    return {
      chain: this.chain,
      chainId: this.deployment.chainId,
      network: this.deployment.network ?? "unknown",
      rpcUrl: this.rpcUrl,
      ron: this.deployment.ron,
      registry: this.deployment.registry,
      timelock: this.deployment.timelock ?? null,
      wallet: this.signer ? await this.signer.getAddress() : null,
    };
  }

  async getAgentScore(agent: string): Promise<ScoreResult> {
    const score = await this.readRon().getSelfAttestScore(agent);
    return {
      agent,
      completions: Number(score.completions),
      disputes: Number(score.disputes),
      score: Number(score.score),
    };
  }

  async discoverCapabilities(input: {
    capabilityType: string;
    minScore?: number;
  }): Promise<DiscoveryResult[]> {
    const registry = this.readRegistry();
    const ron = this.readRon();
    const minScore = BigInt(input.minScore ?? 0);
    const expectedType = ethers.id(input.capabilityType).toLowerCase();

    // The published @taopp/sdk exposes totalSupply/tokenByIndex, not the
    // indexed lookup, so enumerate and filter by type.
    const total = await registry.totalSupply();
    const ids: bigint[] = [];
    for (let i = 0n; i < total; i += 1n) {
      ids.push(await registry.tokenByIndex(i));
    }

    const out: DiscoveryResult[] = [];
    for (const id of ids) {
      const capability = await registry.getCapability(id);
      if (capability.capabilityType.toLowerCase() !== expectedType) continue;
      if (!capability.certified || capability.slashed) continue;
      const score = await ron.getSelfAttestScore(capability.creator);
      if (BigInt(score.score) < minScore) continue;
      out.push({
        agent: capability.creator,
        capabilityId: id.toString(),
        capabilityType: input.capabilityType,
        certified: capability.certified,
        slashed: capability.slashed,
        bond: `${ethers.formatEther(capability.bond)} ETH`,
        metadataUri: capability.metadataCID,
        completions: Number(score.completions),
        disputes: Number(score.disputes),
        score: Number(score.score),
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  async getCapability(id: string): Promise<Record<string, unknown>> {
    const capability = await this.readRegistry().getCapability(BigInt(id));
    return {
      capabilityId: id,
      creator: capability.creator,
      capabilityType: capability.capabilityType,
      certified: capability.certified,
      slashed: capability.slashed,
      bond: `${ethers.formatEther(capability.bond)} ETH`,
      metadataUri: capability.metadataCID,
    };
  }

  async getCompletion(id: string): Promise<Record<string, unknown>> {
    const completion = await this.readRon().getCompletion(BigInt(id));
    return {
      completionId: id,
      agent: completion.agent,
      taskType: completion.taskType,
      resultUri: completion.resultCID,
      timestamp: Number(completion.timestamp),
      challenged: completion.challenged,
      disputed: completion.disputed,
    };
  }

  async attestCompletion(input: {
    taskType: string;
    resultUri: string;
  }): Promise<Record<string, unknown>> {
    const signer = this.requireSigner();
    const client = new ReputationOracleNetworkClient(
      this.deployment.ron,
      signer,
    );
    const { completionId, receipt } = await client.attestCompletion(
      input.taskType,
      input.resultUri,
    );
    return {
      success: true,
      chain: this.chain,
      completionId: completionId.toString(),
      signature: receipt?.hash,
      agent: await signer.getAddress(),
    };
  }

  async challengeCompletion(input: {
    completion: string;
    evidenceUri: string;
  }): Promise<Record<string, unknown>> {
    const signer = this.requireSigner();
    const client = new ReputationOracleNetworkClient(
      this.deployment.ron,
      signer,
    );
    const bond = await client.challengeBond();
    const receipt = await client.challengeCompletion(
      Number(input.completion),
      input.evidenceUri,
      bond,
    );
    return {
      success: true,
      chain: this.chain,
      completionId: input.completion,
      bondWei: bond.toString(),
      signature: receipt?.hash,
      challenger: await signer.getAddress(),
    };
  }

  async registerCapability(input: {
    capabilityType: string;
    metadataUri: string;
    bond: string;
  }): Promise<Record<string, unknown>> {
    const signer = this.requireSigner();
    const client = new CapabilityRegistryClient(
      this.deployment.registry,
      signer,
    );
    const bond = ethers.parseEther(input.bond || "0.01");
    const { capabilityId, receipt } = await client.registerCapabilityEth(
      input.capabilityType,
      input.metadataUri,
      bond,
    );
    return {
      success: true,
      chain: this.chain,
      capabilityId: capabilityId.toString(),
      signature: receipt?.hash,
      creator: await signer.getAddress(),
      bond: `${input.bond || "0.01"} ETH`,
    };
  }

  async resolveChallenge(input: {
    completion: string;
    upheld: boolean;
  }): Promise<Record<string, unknown>> {
    const signer = this.requireSigner();
    const client = new ReputationOracleNetworkClient(
      this.deployment.ron,
      signer,
    );
    const receipt = await client.resolveChallenge(
      Number(input.completion),
      input.upheld,
    );
    return {
      success: true,
      chain: this.chain,
      completionId: input.completion,
      upheld: input.upheld,
      signature: receipt?.hash,
    };
  }
}
