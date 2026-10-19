import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";

import { halveU64, computeScore, createPdas, hashType, typeToHex } from "../src/pda";

const PERIOD = 30 * 24 * 60 * 60;

describe("computeScore", () => {
  it("returns completions minus disputes within one period", () => {
    const result = computeScore({
      completions: 10,
      disputes: 2,
      lastActivity: 100,
      now: 100 + PERIOD,
      decayPeriodSecs: PERIOD,
    });
    expect(result.score).toBe(8);
    expect(result.decayed).toBe(false);
  });

  it("halves for every full period past the first", () => {
    const at = (now: number) =>
      computeScore({
        completions: 10,
        disputes: 0,
        lastActivity: 100,
        now,
        decayPeriodSecs: PERIOD,
      }).score;
    expect(at(100 + PERIOD)).toBe(10);
    expect(at(100 + PERIOD + 1)).toBe(5);
    expect(at(100 + 2 * PERIOD + 1)).toBe(2);
    expect(at(100 + 3 * PERIOD + 1)).toBe(1);
    expect(at(100 + 4 * PERIOD + 1)).toBe(0);
  });

  it("clamps the score at zero and caps halvings", () => {
    expect(
      computeScore({
        completions: 1,
        disputes: 5,
        lastActivity: 100,
        now: 100 + 50 * PERIOD,
        decayPeriodSecs: PERIOD,
      }).score,
    ).toBe(0);

    const capped = computeScore({
      completions: Number.MAX_SAFE_INTEGER,
      disputes: 0,
      lastActivity: 100,
      now: 100 + 500 * PERIOD,
      decayPeriodSecs: PERIOD,
    });
    expect(capped.halvings).toBe(63);
    expect(capped.decayed).toBe(true);
  });

  it("does not decay without activity or a positive period", () => {
    expect(
      computeScore({
        completions: 3,
        disputes: 0,
        lastActivity: 0,
        now: 10 * PERIOD,
        decayPeriodSecs: PERIOD,
      }).score,
    ).toBe(3);
    expect(
      computeScore({
        completions: 3,
        disputes: 0,
        lastActivity: 100,
        now: 10 * PERIOD,
        decayPeriodSecs: 0,
      }).score,
    ).toBe(3);
  });
});

describe("hashType", () => {
  it("produces a stable sha256 tag", () => {
    const bytes = hashType("LoRA");
    expect(bytes).toHaveLength(32);
    expect(typeToHex(bytes)).toBe(
      "c0f5e2c9f730981e88bb1235981124b63e1a6c6710b41fe876db8d7aa42fb08c",
    );
    expect(hashType("LoRA")).toEqual(bytes);
  });
});

describe("pda derivation", () => {
  const programId = new PublicKey("8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE");
  const pdas = createPdas(programId);

  it("derives deterministic, distinct PDAs", () => {
    const authority = new PublicKey("11111111111111111111111111111112");
    const agent = pdas.agent(authority);
    const completion = pdas.completion(authority, 0);
    expect(agent.toBase58()).not.toBe(completion.toBase58());
    expect(pdas.agent(authority).equals(agent)).toBe(true);
    expect(pdas.completion(authority, 1).equals(completion)).toBe(false);
  });
});

describe("u64 halving", () => {
  it("matches on-chain u64 shifts where JS >>> would truncate", () => {
    expect(halveU64(4_294_967_296, 1)).toBe(2_147_483_648);
    expect(halveU64(4_000_000_000, 32)).toBe(0);
    expect(halveU64(2_147_483_649, 40)).toBe(0);
    expect(halveU64(9, 2)).toBe(2);
    expect(halveU64(9, 0)).toBe(9);
  });

  it("keeps computeScore aligned with the chain beyond 32 bits", () => {
    const period = 86_400;
    const score = computeScore({
      completions: 4_000_000_000,
      disputes: 0,
      lastActivity: 1,
      now: 1 + 32 * period + 1,
      decayPeriodSecs: period,
    }).score;
    expect(score).toBe(0);
  });
});
