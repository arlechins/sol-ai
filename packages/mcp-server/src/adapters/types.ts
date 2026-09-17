export type ChainName = "solana" | "base";

export interface ScoreResult {
  agent: string;
  completions: number;
  disputes: number;
  score: number;
  decayed?: boolean;
  lastActivity?: number;
}

export interface DiscoveryResult {
  agent: string;
  capabilityId: string;
  capabilityType: string;
  certified: boolean;
  slashed: boolean;
  bond: string;
  metadataUri: string;
  completions: number;
  disputes: number;
  score: number;
}

export interface ChainAdapter {
  readonly chain: ChainName;
  /** Static deployment info for the active chain. */
  deploymentInfo(): Promise<Record<string, unknown>>;
  getAgentScore(agent: string): Promise<ScoreResult>;
  discoverCapabilities(input: {
    capabilityType: string;
    minScore?: number;
  }): Promise<DiscoveryResult[]>;
  getCapability(id: string): Promise<Record<string, unknown>>;
  getCompletion(id: string): Promise<Record<string, unknown>>;
  attestCompletion(input: {
    taskType: string;
    resultUri: string;
  }): Promise<Record<string, unknown>>;
  challengeCompletion(input: {
    completion: string;
    evidenceUri: string;
  }): Promise<Record<string, unknown>>;
  registerCapability(input: {
    capabilityType: string;
    metadataUri: string;
    bond: string;
  }): Promise<Record<string, unknown>>;
  resolveChallenge(input: {
    completion: string;
    upheld: boolean;
  }): Promise<Record<string, unknown>>;
}

export function requiredSignerError(chain: ChainName, envVar: string): Error {
  return new Error(
    `This write operation requires a signer (chain: ${chain}). Set ${envVar} (see README).`,
  );
}
