import { sol } from "../economics";
import type { Mechanism } from "../mechanisms";

export interface CollusionConfig {
  ringSize: number;
  ratingsPerPair: number;
  /** Fraction of an agent's outgoing ratings that must be reciprocal to flag it. */
  reciprocityThreshold: number;
}

export const defaultCollusionConfig: CollusionConfig = {
  ringSize: 10,
  // One rating per ordered pair is enough for the ring: repeated ratings do not
  // add distinct raters, so redundancy only increases cost without score.
  ratingsPerPair: 1,
  reciprocityThreshold: 0.8,
};

export interface CollusionResult {
  scenario: "collusive_ring";
  mechanism: string;
  config: CollusionConfig;
  metrics: {
    ringScorePerAgent: number;
    ringCostLamports: number;
    costPerRingPointLamports: number;
    honestCostPerPointLamports: number;
    efficiencyRatio: number;
    detectorPrecision: number | null;
    detectorRecall: number | null;
  };
  findings: string;
}

/**
 * Collusive mutual-rating ring: M accounts rate every other ring member K times.
 * A mechanism that counts peer feedback lets the ring manufacture reputation with
 * no external counterparties; a mechanism that ignores peer feedback (TAOP v0.1)
 * is structurally immune but also has no interaction grounding.
 */
export function runCollusiveRing(
  mechanism: Mechanism,
  config: CollusionConfig = defaultCollusionConfig,
): CollusionResult {
  const state = mechanism.newState();
  const ring = Array.from({ length: config.ringSize }, (_, i) => i);

  const edges: Array<[number, number]> = [];
  for (const from of ring) {
    for (const to of ring) {
      if (from === to) continue;
      for (let k = 0; k < config.ratingsPerPair; k += 1) {
        mechanism.rate(state, from, to, 0);
        edges.push([from, to]);
      }
    }
  }

  const ringScorePerAgent = mechanism.score(state, ring[0], 0);
  const ringCostLamports = ring.reduce(
    (sum, id) => sum + mechanism.ensureAgent(state, id).spentLamports,
    0,
  );
  const costPerRingPointLamports = ringCostLamports / Math.max(1, config.ringSize * ringScorePerAgent);

  const honestCostPerPointLamports = 5_000; // one rating transaction = one point
  const efficiencyRatio =
    costPerRingPointLamports > 0
      ? honestCostPerPointLamports / costPerRingPointLamports
      : ringScorePerAgent === 0
        ? 0
        : Number.POSITIVE_INFINITY;

  const detected = detectRing(ring, edges, config.reciprocityThreshold);
  const planted = new Set(ring);
  const truePositives = [...detected].filter((id) => planted.has(id)).length;
  const detectorPrecision =
    detected.size === 0 ? null : truePositives / detected.size;
  const detectorRecall =
    planted.size === 0 ? null : truePositives / planted.size;

  const findings =
    ringScorePerAgent === 0
      ? "Peer ratings do not contribute to the score, so the ring manufactures nothing. " +
        "The reciprocity detector has no graph to inspect (null precision/recall)."
      : `A ring of ${config.ringSize} accounts manufactures ${ringScorePerAgent} points per member ` +
        `at ${sol(costPerRingPointLamports)} per point, versus ${sol(honestCostPerPointLamports)} for a genuine rating. ` +
        `A reciprocity detector flagged ${detected.size} accounts (precision ${detectorPrecision?.toFixed(2)}, recall ${detectorRecall?.toFixed(2)}).`;

  return {
    scenario: "collusive_ring",
    mechanism: mechanism.name,
    config,
    metrics: {
      ringScorePerAgent,
      ringCostLamports,
      costPerRingPointLamports,
      honestCostPerPointLamports,
      efficiencyRatio,
      detectorPrecision,
      detectorRecall,
    },
    findings,
  };
}

/**
 * Baseline detection: flag agents whose outgoing ratings are mostly reciprocated.
 * Deliberately simple; the point is to show that score-level defenses and
 * graph-level detection are separate concerns.
 */
export function detectRing(
  ring: number[],
  edges: Array<[number, number]>,
  threshold: number,
): Set<number> {
  const outgoing = new Map<number, Set<number>>();
  const edgeSet = new Set(edges.map(([from, to]) => `${from}->${to}`));
  for (const [from, to] of edges) {
    if (!outgoing.has(from)) outgoing.set(from, new Set());
    outgoing.get(from)!.add(to);
  }

  const flagged = new Set<number>();
  for (const agent of ring) {
    const targets = outgoing.get(agent);
    if (!targets || targets.size === 0) continue;
    let reciprocal = 0;
    for (const target of targets) {
      if (edgeSet.has(`${target}->${agent}`)) reciprocal += 1;
    }
    if (reciprocal / targets.size >= threshold) flagged.add(agent);
  }
  return flagged;
}

export function collusionResistanceScore(result: CollusionResult): number {
  if (result.metrics.ringScorePerAgent === 0) return 100;
  const ratio = result.metrics.efficiencyRatio;
  if (!Number.isFinite(ratio)) return 0;
  if (ratio >= 1) return 0;
  return Math.round((1 - ratio) * 1000) / 10;
}
