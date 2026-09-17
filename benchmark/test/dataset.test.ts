import { describe, expect, it } from "vitest";
import dataset from "../dataset/patterns.json";

const CLASSES = ["sybil_farming", "slow_burn_harvest", "collusive_ring"];

describe("adversarial pattern dataset", () => {
  it("is licensed CC-BY-4.0 and versioned", () => {
    expect(dataset.license).toBe("CC-BY-4.0");
    expect(dataset.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("has unique ids with class-consistent prefixes", () => {
    const ids = dataset.patterns.map((pattern) => pattern.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pattern of dataset.patterns) {
      expect(pattern.id).toMatch(/^(sybil|slowburn|collusion)-\d{3}$/);
      if (pattern.attackClass === "sybil_farming") expect(pattern.id).toMatch(/^sybil-/);
      if (pattern.attackClass === "slow_burn_harvest") expect(pattern.id).toMatch(/^slowburn-/);
      if (pattern.attackClass === "collusive_ring") expect(pattern.id).toMatch(/^collusion-/);
    }
  });

  it("covers all three attack classes with at least five entries each", () => {
    for (const attackClass of CLASSES) {
      const count = dataset.patterns.filter(
        (pattern) => pattern.attackClass === attackClass,
      ).length;
      expect(count).toBeGreaterThanOrEqual(5);
    }
  });

  it("carries sources, signals, mitigations, and honest confidence labels", () => {
    for (const pattern of dataset.patterns) {
      expect(pattern.sources.length).toBeGreaterThan(0);
      expect(pattern.onChainSignals.length).toBeGreaterThan(0);
      expect(pattern.mitigations.length).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(pattern.confidence);
      expect(["low", "medium", "high"]).toContain(pattern.severity);
      for (const source of pattern.sources) {
        expect(source.title.length).toBeGreaterThan(2);
        expect(source.year).toBeGreaterThanOrEqual(1990);
      }
    }
  });
});
