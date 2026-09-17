import crypto from "node:crypto";
import { PublicKey } from "@solana/web3.js";

export const DEFAULT_DECAY_PERIOD_SECS = 30 * 24 * 60 * 60;

/** Canonical 32-byte tag for a task/capability type string (sha256). */
export function hashType(value: string): number[] {
  return Array.from(crypto.createHash("sha256").update(value, "utf8").digest());
}

export function typeToHex(bytes: number[] | Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

export interface ScoreBreakdown {
  completions: number;
  disputes: number;
  score: number;
  decayed: boolean;
  halvings: number;
}

/**
 * v0.1 score = max(0, completions - disputes), halved for every full decay
 * period of inactivity (capped at 63 halvings). Mirrors the on-chain
 * `get_score` instruction.
 */
export function computeScore(params: {
  completions: number;
  disputes: number;
  lastActivity: number;
  now: number;
  decayPeriodSecs?: number;
}): ScoreBreakdown {
  const { completions, disputes, lastActivity, now } = params;
  const decayPeriodSecs = params.decayPeriodSecs ?? DEFAULT_DECAY_PERIOD_SECS;
  const net = Math.max(0, completions - disputes);

  if (net === 0 || lastActivity <= 0 || decayPeriodSecs <= 0) {
    return { completions, disputes, score: net, decayed: false, halvings: 0 };
  }

  const elapsed = Math.max(0, now - lastActivity);
  if (elapsed <= decayPeriodSecs) {
    return { completions, disputes, score: net, decayed: false, halvings: 0 };
  }

  const halvings = Math.min(63, Math.floor(elapsed / decayPeriodSecs));
  return {
    completions,
    disputes,
    score: net >>> halvings,
    decayed: true,
    halvings,
  };
}

export interface Pdas {
  config: PublicKey;
  agent(authority: PublicKey): PublicKey;
  completion(agent: PublicKey, seq: bigint | number): PublicKey;
  challenge(completion: PublicKey): PublicKey;
  challengeVault(completion: PublicKey): PublicKey;
  capability(capabilityType: number[] | Uint8Array, creator: PublicKey, id: bigint | number): PublicKey;
  capabilityVault(capability: PublicKey): PublicKey;
  capabilityIndex(capabilityType: number[] | Uint8Array): PublicKey;
}

function u64Bytes(value: bigint | number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

export function createPdas(programId: PublicKey): Pdas {
  const find = (seeds: (Buffer | Uint8Array)[]) =>
    PublicKey.findProgramAddressSync(seeds, programId)[0];

  return {
    config: find([Buffer.from("config")]),
    agent: (authority) => find([Buffer.from("agent"), authority.toBuffer()]),
    completion: (agent, seq) =>
      find([Buffer.from("completion"), agent.toBuffer(), u64Bytes(seq)]),
    challenge: (completion) => find([Buffer.from("challenge"), completion.toBuffer()]),
    challengeVault: (completion) =>
      find([Buffer.from("challenge_vault"), completion.toBuffer()]),
    capability: (capabilityType, creator, id) =>
      find([
        Buffer.from("capability"),
        Buffer.from(capabilityType),
        creator.toBuffer(),
        u64Bytes(id),
      ]),
    capabilityVault: (capability) =>
      find([Buffer.from("capability_vault"), capability.toBuffer()]),
    capabilityIndex: (capabilityType) =>
      find([Buffer.from("cap-index"), Buffer.from(capabilityType)]),
  };
}
