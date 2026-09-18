import { describe, expect, it } from "vitest";
import { computeScore } from "@taopp/solana";

import { allMechanisms, defaultParams } from "../src/mechanisms";
import { buildMechanismReport, defaultBenchmarkConfigs } from "../src/rubric";

describe("benchmark determinism", () => {
  it("produces identical results for the same seed", () => {
    const configs = defaultBenchmarkConfigs(7);
    const mechanism = allMechanisms(defaultParams())[0];
    const first = buildMechanismReport(mechanism, configs);
    const second = buildMechanismReport(allMechanisms(defaultParams())[0], configs);
    expect(second).toEqual(first);
  });
});

describe("mechanism parity with the on-chain score", () => {
  it("matches @taopp/solana computeScore for the TAOP mechanism", () => {
    const params = defaultParams();
    const mechanism = allMechanisms(params)[0];
    const state = mechanism.newState();
    mechanism.attest(state, 0, 1_000);
    mechanism.attest(state, 0, 2_000);
    mechanism.attest(state, 0, 3_000);
    mechanism.challenge(state, 1, 99, 3_000);
    mechanism.resolve(state, 1, true);

    const expected = computeScore({
      completions: 3,
      disputes: 1,
      lastActivity: 3_000,
      now: 3_000,
      decayPeriodSecs: params.decayPeriodSecs,
    }).score;
    expect(mechanism.score(state, 0, 3_000)).toBe(expected);
  });

  it("decays identically over time", () => {
    const params = defaultParams();
    const mechanism = allMechanisms(params)[0];
    const state = mechanism.newState();
    mechanism.attest(state, 0, 1_000);
    mechanism.attest(state, 0, 1_000);
    mechanism.attest(state, 0, 1_000);
    mechanism.attest(state, 0, 1_000);

    const now = 1_000 + 2 * params.decayPeriodSecs + 1;
    const expected = computeScore({
      completions: 4,
      disputes: 0,
      lastActivity: 1_000,
      now,
      decayPeriodSecs: params.decayPeriodSecs,
    }).score;
    expect(mechanism.score(state, 0, now)).toBe(expected);
  });
});

describe("rubric bounds", () => {
  it("keeps every class score and the composite within 0-100", () => {
    const configs = defaultBenchmarkConfigs(42);
    for (const mechanism of allMechanisms(defaultParams())) {
      const report = buildMechanismReport(mechanism, configs);
      for (const value of Object.values(report.scores)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("scores the naive counter at low Sybil resistance", () => {
    const configs = defaultBenchmarkConfigs(42);
    const naive = allMechanisms(defaultParams()).find(
      (mechanism) => mechanism.name === "naive_count",
    )!;
    const report = buildMechanismReport(naive, configs);
    expect(report.scores.sybilFarming).toBeLessThan(10);
  });

  it("detectors identify the planted ring in a mixed graph", () => {
    const configs = defaultBenchmarkConfigs(42);
    const peer = allMechanisms(defaultParams()).find(
      (mechanism) => mechanism.name === "peer_ratings",
    )!;
    const report = buildMechanismReport(peer, configs, ["collusion"]);
    const detectors = report.collusion!.metrics.detectors;
    expect(detectors.map((detector) => detector.name)).toEqual([
      "reciprocity",
      "mutual_degree",
      "k_core",
      "ensemble",
    ]);
    const ensemble = detectors.find((detector) => detector.name === "ensemble")!;
    expect(ensemble.precision).toBeGreaterThanOrEqual(0.8);
    expect(ensemble.recall).toBeGreaterThanOrEqual(0.8);
    expect(ensemble.f1).toBeGreaterThanOrEqual(0.8);
  });

  it("mechanisms that ignore ratings record no detector graph", () => {
    const configs = defaultBenchmarkConfigs(42);
    const taop = allMechanisms(defaultParams())[0];
    const report = buildMechanismReport(taop, configs, ["collusion"]);
    expect(report.collusion!.metrics.detectors).toHaveLength(0);
    expect(report.collusion!.metrics.detectorPrecision).toBeNull();
    expect(report.collusion!.metrics.detectorRecall).toBeNull();
  });

  it("supports scenario filtering", () => {
    const configs = defaultBenchmarkConfigs(42);
    const mechanism = allMechanisms(defaultParams())[0];
    const report = buildMechanismReport(mechanism, configs, ["sybil"]);
    expect(report.sybil).toBeDefined();
    expect(report.slowBurn).toBeUndefined();
    expect(report.collusion).toBeUndefined();
    expect(report.scores.composite).toBe(report.scores.sybilFarming);
  });
});
