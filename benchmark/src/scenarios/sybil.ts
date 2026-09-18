import { LAMPORTS_PER_SOL, rng, sol } from "../economics";
import type { Mechanism } from "../mechanisms";

export interface SybilConfig {
  sybils: number;
  attestsPerSybil: number;
  /** Probability that any given completion is challenged by a watcher. */
  challengeProbability: number;
  /** Probability that a challenge against a fake completion is upheld. */
  upheldProbability: number;
  seed: number;
}

export const defaultSybilConfig: SybilConfig = {
  sybils: 20,
  attestsPerSybil: 10,
  challengeProbability: 0.1,
  upheldProbability: 0.9,
  seed: 42,
};

export interface SybilResult {
  scenario: "sybil_farming";
  mechanism: string;
  config: SybilConfig;
  metrics: {
    sybilAgents: number;
    totalAttestations: number;
    totalScore: number;
    spentLamports: number;
    lockedLamports: number;
    capitalPerPointLamports: number;
    costPerPointLamports: number;
    honestCostPerPointLamports: number;
    efficiencyRatio: number;
    challenges: number;
    disputes: number;
    costToThreshold: Record<string, string>;
  };
  findings: string;
}

/** Locked capital per point that is considered fully Sybil-resistant. */
export const SYBIL_CAPITAL_REFERENCE_LAMPORTS = 0.01 * LAMPORTS_PER_SOL;

/**
 * Sybil farming: many fresh identities self-attest with no real tasks.
 * Watchers challenge each completion with probability p; upheld challenges
 * subtract score. Cost per point is compared to an honest agent paying the
 * same on-chain costs for real completions.
 */
export function runSybilFarming(
  mechanism: Mechanism,
  config: SybilConfig = defaultSybilConfig,
): SybilResult {
  const random = rng(config.seed);
  const state = mechanism.newState();

  const honest = mechanism.ensureAgent(state, -1);
  if (mechanism.capitalRequiredForScore && mechanism.lockCapital) {
    mechanism.lockCapital(
      state,
      honest.id,
      mechanism.capitalRequiredForScore(config.attestsPerSybil),
    );
  }
  for (let k = 0; k < config.attestsPerSybil; k += 1) {
    mechanism.attest(state, -1, 0);
  }

  // Receipt-based mechanisms: honest work needs a counterparty as well, so that
  // cost is included and the diversity cap is satisfied on both sides.
  const honestConfirmers = mechanism.requiresReceipts
    ? (mechanism.counterpartiesRequiredForScore?.(config.attestsPerSybil) ?? 1)
    : 0;
  for (let c = 0; c < honestConfirmers; c += 1) {
    const confirmer = mechanism.ensureAgent(state, -2 - c);
    for (let k = 0; k < config.attestsPerSybil / honestConfirmers; k += 1) {
      mechanism.rate(state, confirmer.id, honest.id, 0);
    }
  }

  let challenges = 0;
  let disputes = 0;
  for (let sybil = 0; sybil < config.sybils; sybil += 1) {
    if (mechanism.capitalRequiredForScore && mechanism.lockCapital) {
      mechanism.lockCapital(
        state,
        sybil,
        mechanism.capitalRequiredForScore(config.attestsPerSybil),
      );
    }
    for (let k = 0; k < config.attestsPerSybil; k += 1) {
      mechanism.attest(state, sybil, 0);
      if (mechanism.requiresReceipts) {
        const confirmer =
          (sybil + 1 + (k % (mechanism.counterpartiesRequiredForScore?.(config.attestsPerSybil) ?? 1))) %
          config.sybils;
        mechanism.rate(state, confirmer, sybil, 0);
      }
      const completionId = state.completions[state.completions.length - 1].id;
      if (random() < config.challengeProbability) {
        challenges += 1;
        const challenger = 10_000 + challenges;
        mechanism.challenge(state, completionId, challenger, 0);
        if (random() < config.upheldProbability) {
          disputes += 1;
          mechanism.resolve(state, completionId, true);
        } else {
          mechanism.resolve(state, completionId, false);
        }
      }
    }
  }

  const attackers = Array.from({ length: config.sybils }, (_, id) =>
    mechanism.ensureAgent(state, id),
  );
  const totalScore = attackers.reduce(
    (sum, agent) => sum + mechanism.score(state, agent.id, 0),
    0,
  );
  const spentLamports = attackers.reduce(
    (sum, agent) => sum + agent.spentLamports,
    0,
  );
  const lockedLamports = attackers.reduce(
    (sum, agent) => sum + agent.lockedLamports,
    0,
  );
  const attackerCapital = spentLamports + lockedLamports;
  const honestScore = mechanism.score(state, honest.id, 0);
  const honestConfirmerCapital = Array.from(
    { length: honestConfirmers },
    (_, c) => mechanism.ensureAgent(state, -2 - c).spentLamports,
  ).reduce((sum, value) => sum + value, 0);
  const honestCapital =
    honest.spentLamports + honest.lockedLamports + honestConfirmerCapital;

  const costPerPointLamports = attackerCapital / Math.max(1, totalScore);
  const capitalPerPointLamports =
    totalScore === 0 ? Number.POSITIVE_INFINITY : lockedLamports / totalScore;
  const honestCostPerPointLamports =
    honestCapital / Math.max(1, honestScore);
  const efficiencyRatio =
    totalScore === 0 || costPerPointLamports === 0
      ? 0
      : honestCostPerPointLamports / costPerPointLamports;

  const perAttestCost =
    mechanism.attestCost() +
    (mechanism.requiresReceipts ? (mechanism.receiptCost?.() ?? 0) : 0);
  const costToThreshold: Record<string, string> = {};
  for (const threshold of [10, 100, 1_000]) {
    costToThreshold[String(threshold)] = sol(threshold * perAttestCost);
  }

  const findings =
    totalScore === 0
      ? "No effective score could be manufactured for this configuration."
      : `Attacker commits ${sol(costPerPointLamports)} per effective reputation point ` +
        `(${sol(lockedLamports)} of it locked capital) versus ${sol(honestCostPerPointLamports)} ` +
        `for honest work (efficiency ${efficiencyRatio.toFixed(2)}x). ` +
        `${disputes}/${challenges} challenges were upheld. ` +
        (efficiencyRatio > 0.8
          ? "Self-attested work is indistinguishable from honest work at this challenge rate."
          : "Challenge pressure materially taxes fake completions.");

  return {
    scenario: "sybil_farming",
    mechanism: mechanism.name,
    config,
    metrics: {
      sybilAgents: config.sybils,
      totalAttestations: config.sybils * config.attestsPerSybil,
      totalScore,
      spentLamports,
      lockedLamports,
      capitalPerPointLamports,
      costPerPointLamports,
      honestCostPerPointLamports,
      efficiencyRatio,
      challenges,
      disputes,
      costToThreshold,
    },
    findings,
  };
}

/**
 * Sybil resistance = half cost-efficiency, half capital intensity:
 *   efficiency component: 100 * (1 - attackerEfficiency)
 *   capital component:    100 * min(1, lockedCapitalPerPoint / 0.01 SOL)
 * A mechanism that manufactures score as cheaply as honest work and locks no
 * capital per point scores 0; one that requires a meaningful bond scores higher.
 */
export function sybilResistanceScore(result: SybilResult): number {
  if (result.metrics.totalScore === 0) return 100;
  const ratio = result.metrics.efficiencyRatio;
  const efficiencyComponent =
    !Number.isFinite(ratio) || ratio <= 0
      ? 100
      : ratio >= 1
        ? 0
        : 100 * (1 - ratio);
  const capital = result.metrics.capitalPerPointLamports;
  const capitalComponent = Number.isFinite(capital)
    ? 100 * Math.min(1, capital / SYBIL_CAPITAL_REFERENCE_LAMPORTS)
    : 0;
  return Math.round((0.5 * efficiencyComponent + 0.5 * capitalComponent) * 10) / 10;
}

export function sybilBudget(
  lamportsPerPoint: number,
  threshold: number,
): number {
  return lamportsPerPoint * threshold;
}

export function humanSol(lamports: number): string {
  return sol(lamports);
}

export const SYBIL_SOL_BUDGET = LAMPORTS_PER_SOL;
