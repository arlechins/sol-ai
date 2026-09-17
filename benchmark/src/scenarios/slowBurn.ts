import { LAMPORTS_PER_SOL, sol } from "../economics";
import type { Mechanism } from "../mechanisms";

export interface SlowBurnConfig {
  /** Reputation threshold required to be awarded a high-value contract. */
  targetScore: number;
  /** Off-chain value the attacker extracts once above the threshold (lamports). */
  harvestValueLamports: number;
  /** Attestations the attacker performs per day while accumulating. */
  attestsPerDay: number;
  /** Simulated horizon in days. */
  horizonDays: number;
}

export const defaultSlowBurnConfig: SlowBurnConfig = {
  targetScore: 50,
  harvestValueLamports: 5 * LAMPORTS_PER_SOL,
  attestsPerDay: 2,
  horizonDays: 180,
};

export interface SlowBurnResult {
  scenario: "slow_burn_harvest";
  mechanism: string;
  config: SlowBurnConfig;
  metrics: {
    reachable: boolean;
    daysToThreshold: number | null;
    scoreAtHarvest: number;
    spentLamports: number;
    slashableLamports: number;
    harvestValueLamports: number;
    slashCoverage: number;
    netAttackerProfitLamports: number;
    scoreAfterSlash: number;
  };
  findings: string;
}

const DAY = 24 * 60 * 60;

/**
 * Slow burn then harvest: the attacker builds just enough reputation for one
 * high-value action, then exits. The only capital a counterparty can seize is
 * the attacker's bonded capability, so slash coverage measures the defense.
 */
export function runSlowBurnHarvest(
  mechanism: Mechanism,
  config: SlowBurnConfig = defaultSlowBurnConfig,
): SlowBurnResult {
  const state = mechanism.newState();
  const attacker = 0;
  mechanism.ensureAgent(state, attacker);

  // Model the capital required to bid on the high-value contract: a stake-gated
  // mechanism needs locked stake, TAOP needs a bonded capability.
  if (mechanism.capitalRequiredForScore && mechanism.lockCapital) {
    mechanism.lockCapital(
      state,
      attacker,
      mechanism.capitalRequiredForScore(config.targetScore),
    );
  } else {
    const record = mechanism.ensureAgent(state, attacker);
    record.lockedLamports += mechanism.params.capabilityBondLamports;
    record.spentLamports += 5_000; // lock transaction fee
  }

  let daysToThreshold: number | null = null;
  let scoreAtHarvest = 0;
  for (let day = 1; day <= config.horizonDays; day += 1) {
    for (let i = 0; i < config.attestsPerDay; i += 1) {
      mechanism.attest(state, attacker, day * DAY);
    }
    const score = mechanism.score(state, attacker, day * DAY);
    if (score >= config.targetScore) {
      daysToThreshold = day;
      scoreAtHarvest = score;
      break;
    }
  }

  const slashableLamports = mechanism.slashable(state, attacker);
  const spentLamports = mechanism.ensureAgent(state, attacker).spentLamports;
  const slashCoverage =
    config.harvestValueLamports === 0
      ? 0
      : slashableLamports / config.harvestValueLamports;

  if (daysToThreshold !== null) {
    mechanism.slashCapability(state, attacker);
    // The fraud is discovered: every completion is disputed retroactively.
    const record = mechanism.ensureAgent(state, attacker);
    record.disputes = record.completions;
  }
  const scoreAfterSlash = mechanism.score(state, attacker, config.horizonDays * DAY);

  const netAttackerProfitLamports =
    daysToThreshold === null
      ? 0
      : config.harvestValueLamports - slashableLamports - spentLamports;

  const findings =
    daysToThreshold === null
      ? `Unreachable: decay prevents score ${config.targetScore} at ${config.attestsPerDay} attestations/day.`
      : `Reached score ${scoreAtHarvest} in ${daysToThreshold} days for ${sol(spentLamports)}. ` +
        `Bonded capital (${sol(slashableLamports)}) covers ${(slashCoverage * 100).toFixed(1)}% of the ` +
        `${sol(config.harvestValueLamports)} harvest. ` +
        (slashCoverage >= 1
          ? "A fully bonded capability neutralizes the harvest."
          : "Underbonded capabilities are the attack surface; raise the bond or gate the contract on more than score.");

  return {
    scenario: "slow_burn_harvest",
    mechanism: mechanism.name,
    config,
    metrics: {
      reachable: daysToThreshold !== null,
      daysToThreshold,
      scoreAtHarvest,
      spentLamports,
      slashableLamports,
      harvestValueLamports: config.harvestValueLamports,
      slashCoverage,
      netAttackerProfitLamports,
      scoreAfterSlash,
    },
    findings,
  };
}

export function slowBurnResistanceScore(result: SlowBurnResult): number {
  if (!result.metrics.reachable) return 100;
  const coverage = result.metrics.slashCoverage;
  return Math.round(Math.min(1, Math.max(0, coverage)) * 1000) / 10;
}
