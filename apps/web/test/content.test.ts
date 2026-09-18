import { describe, expect, it } from "vitest";
import {
  BUILD_HASH,
  PROGRAM_ID,
  benchmarkArtifacts,
  sections,
  verifiedLoop,
} from "../src/content";
import { rows, taop } from "../src/lib/benchmark";
import { decaySeries, scoreMath, shortKey } from "../src/lib/format";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

describe("published evidence", () => {
  it("uses a base58 program id", () => {
    expect(PROGRAM_ID).toMatch(BASE58);
    expect(PROGRAM_ID.startsWith("0x")).toBe(false);
  });

  it("uses a 64-character hex build hash", () => {
    expect(BUILD_HASH).toMatch(/^[0-9a-f]{64}$/);
  });

  it("links three unique verified-loop transactions", () => {
    expect(verifiedLoop).toHaveLength(3);
    const signatures = verifiedLoop.map((step) => step.tx);
    expect(new Set(signatures).size).toBe(3);
    for (const signature of signatures) {
      expect(signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
    }
  });

  it("renders the benchmark baseline without drift", () => {
    expect(rows).toHaveLength(6);
    expect(taop.mechanism).toBe("taop_bonded_decay");
    expect(taop.scores.composite).toBe(34.6);
    expect(taop.scores.slowBurnHarvest).toBe(0.1);
    expect(taop.weakSpots.length).toBeGreaterThan(0);
  });

  it("carries the CC-BY dataset metadata", () => {
    expect(benchmarkArtifacts.dataset.patterns).toBe(34);
    expect(benchmarkArtifacts.dataset.license).toBe("CC-BY-4.0");
    expect(Object.keys(benchmarkArtifacts.dataset.attackClasses)).toHaveLength(3);
  });

  it("keeps integration snippets Solana-native", () => {
    for (const snippet of sections.integrate.snippets) {
      expect(snippet.code).not.toContain("0x");
      expect(snippet.code).not.toContain("ethers");
    }
    expect(sections.integrate.snippets.map((snippet) => snippet.id)).toEqual([
      "sdk",
      "mcp",
      "webhooks",
    ]);
  });
});

describe("format helpers", () => {
  it("shortens keys without losing the ends", () => {
    expect(shortKey("8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE")).toBe(
      "8soD…5MnE",
    );
    expect(shortKey("abc")).toBe("abc");
  });

  it("mirrors the on-chain decay math", () => {
    const now = 1_000_000;
    const fresh = scoreMath({
      completions: 10,
      disputes: 1,
      lastActivity: now - 10,
      now,
      decayPeriodSecs: 1000,
    });
    expect(fresh.net).toBe(9);
    expect(fresh.halvings).toBe(0);
    expect(fresh.scoreEquivalent).toBe(9);

    const stale = scoreMath({
      completions: 10,
      disputes: 1,
      lastActivity: now - 2500,
      now,
      decayPeriodSecs: 1000,
    });
    expect(stale.halvings).toBe(2);
    expect(stale.decayed).toBe(true);
    expect(stale.scoreEquivalent).toBe(9 >>> 2);
  });

  it("projects decay as a non-increasing series", () => {
    const now = 1_000_000;
    const series = decaySeries({
      base: 64,
      lastActivity: now,
      decayPeriodSecs: 1000,
      now,
      points: 12,
      horizonPeriods: 2,
    });
    expect(series).toHaveLength(12);
    for (let index = 1; index < series.length; index += 1) {
      expect(series[index].score).toBeLessThanOrEqual(series[index - 1].score);
    }
  });
});
