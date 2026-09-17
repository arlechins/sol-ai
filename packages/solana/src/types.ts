import type { PublicKey } from "@solana/web3.js";

export interface SolanaDeployment {
  cluster: "localnet" | "devnet" | "mainnet-beta" | string;
  programId: string;
  config?: string;
  authority?: string;
  certifier?: string;
  treasury?: string;
  deployedAt?: string;
}

export interface AgentRecord {
  authority: PublicKey;
  completions: number;
  disputes: number;
  lastActivity: number;
  metadataUri: string;
}

export interface CompletionRecord {
  id: number;
  agent: PublicKey;
  taskType: number[];
  resultUri: string;
  timestamp: number;
  challenged: boolean;
  disputed: boolean;
}

export interface ChallengeRecord {
  completion: PublicKey;
  challenger: PublicKey;
  evidenceUri: string;
  timestamp: number;
  resolved: boolean;
  upheld: boolean;
  bondLamports: number;
}

export interface CapabilityRecord {
  id: number;
  creator: PublicKey;
  capabilityType: number[];
  metadataUri: string;
  bondRemaining: number;
  certified: boolean;
  slashed: boolean;
  active: boolean;
}

export interface ScoreView {
  completions: number;
  disputes: number;
  score: number;
  lastActivity: number;
  decayed: boolean;
}

export interface AttestInput {
  taskType: string | number[] | Uint8Array;
  resultUri: string;
  /** Agent completion sequence; derived from chain state when omitted. */
  seq?: number | bigint;
}

export interface AttestResult {
  signature: string;
  completion: PublicKey;
  completionId: number;
}

export interface ChallengeInput {
  completion: PublicKey;
  evidenceUri: string;
}

export interface ResolveInput {
  completion: PublicKey;
  upheld: boolean;
}

export interface RegisterCapabilityInput {
  capabilityType: string | number[] | Uint8Array;
  metadataUri: string;
  bondLamports: number | bigint;
  /** Global capability id; derived from config when omitted. */
  id?: number | bigint;
}

export interface DiscoverInput {
  capabilityType: string | number[] | Uint8Array;
  minScore?: number;
  /** Include capabilities that have not been certified yet (default false). */
  includeUncertified?: boolean;
}

export interface DiscoveryItem {
  agent: string;
  capability: string;
  capabilityId: number;
  capabilityType: string;
  certified: boolean;
  slashed: boolean;
  bondLamports: number;
  metadataUri: string;
  completions: number;
  disputes: number;
  score: number;
  decayed: boolean;
}
