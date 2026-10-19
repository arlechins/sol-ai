import { describe, expect, it } from "vitest";

import {
  NaiveCountMechanism,
  PeerRatingsMechanism,
  defaultParams,
} from "../src/mechanisms";
import { defaultBenchmarkConfigs } from "../src/rubric";
import {
  defaultCollusionConfig,
  runCollusiveRing,
} from "../src/scenarios/collusion";
import {
  defaultSlowBurnConfig,
  runSlowBurnHarvest,
} from "../src/scenarios/slowBurn";
import {
  defaultSybilConfig,
  runSybilFarming,
} from "../src/scenarios/sybil";

describe("attack modeling for rating mechanisms", () => {
  it("lets sybils rate each other instead of scoring zero", () => {
    const result = runSybilFarming(
      new PeerRatingsMechanism(defaultParams()),
      defaultSybilConfig,
    );
    expect(result.metrics.totalScore).toBeGreaterThan(0);
  });

  it("models recruited raters for slow-burn peer ratings", () => {
    const result = runSlowBurnHarvest(
      new PeerRatingsMechanism(defaultParams()),
      defaultSlowBurnConfig,
    );
    expect(result.metrics.reachable).toBe(true);
  });
});

describe("determinism and guards", () => {
  it("propagates the CLI seed to every scenario", () => {
    const configs = defaultBenchmarkConfigs(7);
    expect(configs.sybil.seed).toBe(7);
    expect(configs.collusion.seed).toBe(7);
  });

  it("resolving a challenge twice changes nothing", () => {
    const mechanism = new NaiveCountMechanism(defaultParams());
    const state = mechanism.newState();
    mechanism.attest(state, 1, 0);
    mechanism.challenge(state, 1, 2, 0);
    mechanism.resolve(state, 1, true);

    const disputes = mechanism.ensureAgent(state, 1).disputes;
    const spent = mechanism.ensureAgent(state, 2).spentLamports;
    mechanism.resolve(state, 1, true);

    expect(mechanism.ensureAgent(state, 1).disputes).toBe(disputes);
    expect(mechanism.ensureAgent(state, 2).spentLamports).toBe(spent);
  });

  it("rejects a collusion config with no possible honest counterparty", () => {
    expect(() =>
      runCollusiveRing(new NaiveCountMechanism(defaultParams()), {
        ...defaultCollusionConfig,
        honestAgents: 1,
        honestRatings: 1,
      }),
    ).toThrow(/honestAgents/);
  });

  it("serializes no-score capital as null instead of Infinity", () => {
    const result = runSybilFarming(new NaiveCountMechanism(defaultParams()), {
      ...defaultSybilConfig,
      sybils: 0,
    });
    expect(result.metrics.totalScore).toBe(0);
    expect(result.metrics.capitalPerPointLamports).toBeNull();
    expect(JSON.stringify(result).includes("Infinity")).toBe(false);
  });
});
