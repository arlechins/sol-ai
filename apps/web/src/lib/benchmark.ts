import raw from "../data/benchmark.json";

export interface ClassScores {
  sybilFarming: number;
  slowBurnHarvest: number;
  collusiveRing: number;
  composite: number;
}

export interface DetectorResult {
  name: string;
  flagged: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface RawReport {
  mechanism: string;
  description: string;
  scores: ClassScores;
  weakSpots: string[];
  sybil: {
    metrics: {
      totalScore: number;
      spentLamports: number;
      costPerPointLamports: number;
      honestCostPerPointLamports: number;
      efficiencyRatio: number;
      challenges: number;
      disputes: number;
      costToThreshold: Record<string, string>;
    };
  };
  slowBurn: {
    metrics: {
      reachable: boolean;
      daysToThreshold: number | null;
      spentLamports: number;
      slashableLamports: number;
      harvestValueLamports: number;
      slashCoverage: number;
      netAttackerProfitLamports: number;
      scoreAfterSlash: number;
    };
  };
  collusion: {
    metrics: {
      ringScorePerAgent: number;
      ringCostLamports: number;
      costPerRingPointLamports: number;
      honestCostPerPointLamports: number;
      efficiencyRatio: number;
      detectorPrecision: number | null;
      detectorRecall: number | null;
      detectors: DetectorResult[];
    };
  };
}

export const mechanisms: RawReport[] = raw.reports as RawReport[];

export const benchmarkMeta = raw.metadata;
export const benchmarkParams = raw.params as {
  bondLamports: number;
  decayPeriodSecs: number;
  capabilityBondLamports: number;
};

const LABELS: Record<string, { label: string; blurb: string }> = {
  taop_bonded_decay: {
    label: "TAOP",
    blurb: "Bonded challenges, disputes, inactivity decay, and a bonded capability registry.",
  },
  naive_count: {
    label: "Naive count",
    blurb: "Score = completions. No bonds, no disputes, no decay.",
  },
  completions_minus_disputes: {
    label: "Count − disputes",
    blurb: "Score = max(0, completions − disputes). Disputes without decay.",
  },
  peer_ratings: {
    label: "Peer ratings",
    blurb: "ERC-8004-style feedback: distinct agents that rated you, minus disputes.",
  },
  stake_gated: {
    label: "Stake-gated",
    blurb: "Score = min(count − disputes, floor(stake / 0.01 SOL)), fully slashable.",
  },
  two_sided_receipts: {
    label: "Two-sided receipts",
    blurb:
      "Base-style counterparty-confirmed completions with a 5 × distinct-confirmer diversity cap.",
  },
};

export interface MechanismRow extends RawReport {
  id: string;
  label: string;
  blurb: string;
  isTaop: boolean;
}

export const rows: MechanismRow[] = mechanisms.map((report) => {
  const known = LABELS[report.mechanism];
  return {
    ...report,
    id: report.mechanism,
    label: known?.label ?? report.mechanism,
    blurb: known?.blurb ?? report.description,
    isTaop: report.mechanism === "taop_bonded_decay",
  };
});

export const ranked = [...rows].sort(
  (a, b) => b.scores.composite - a.scores.composite,
);

export const taop = rows.find((row) => row.isTaop)!;
export const best = ranked[0];

export const classOrder = [
  { key: "sybilFarming" as const, label: "Sybil farming", short: "Sybil" },
  { key: "slowBurnHarvest" as const, label: "Slow-burn harvest", short: "Slow burn" },
  { key: "collusiveRing" as const, label: "Collusive ring", short: "Collusion" },
];

export function isDetected(row: MechanismRow): boolean {
  return row.collusion.metrics.detectors.length > 0;
}
