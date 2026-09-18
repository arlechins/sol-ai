import { describe, expect, it } from "vitest";

import { decaySeries, halveU64, scoreMath } from "../src/lib/format";

describe("u64 halving", () => {
  it("does not truncate above 32 bits or wrap the shift count", () => {
    expect(halveU64(4_294_967_296, 1)).toBe(2_147_483_648);
    expect(halveU64(4_000_000_000, 32)).toBe(0);
    expect(halveU64(2_147_483_649, 40)).toBe(0);
    expect(halveU64(9, 2)).toBe(2);
    expect(halveU64(9, 0)).toBe(9);
  });
});

describe("decay boundaries", () => {
  const period = 86_400;

  it("starts decay strictly after one full period, like the chain", () => {
    const atBoundary = scoreMath({
      completions: 10,
      disputes: 0,
      lastActivity: 1_000,
      now: 1_000 + period,
      decayPeriodSecs: period,
    });
    expect(atBoundary.halvings).toBe(0);
    expect(atBoundary.decayed).toBe(false);
    expect(atBoundary.scoreEquivalent).toBe(10);

    const afterBoundary = scoreMath({
      completions: 10,
      disputes: 0,
      lastActivity: 1_000,
      now: 1_000 + period + 1,
      decayPeriodSecs: period,
    });
    expect(afterBoundary.halvings).toBe(1);
    expect(afterBoundary.scoreEquivalent).toBe(5);
  });

  it("projects a monotonic curve that reaches zero", () => {
    const series = decaySeries({
      base: 1_000,
      lastActivity: 0,
      decayPeriodSecs: 1_000,
      now: 0,
      points: 20,
      horizonPeriods: 12,
    });
    expect(series[series.length - 1].score).toBe(0);
    for (let i = 1; i < series.length; i += 1) {
      expect(series[i].score).toBeLessThanOrEqual(series[i - 1].score);
    }
  });
});
