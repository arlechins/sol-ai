import { sol } from "./economics";
import type { MechanismReport } from "./rubric";

export interface ReportMetadata {
  generatedAt: string;
  seed: number;
  nodeVersion: string;
  version: string;
}

export function renderReport(
  reports: MechanismReport[],
  metadata: ReportMetadata,
  configsDescription: string[],
): string {
  const lines: string[] = [];
  lines.push("# TAOP gaming-resistance benchmark — results");
  lines.push("");
  lines.push(`Generated: ${metadata.generatedAt}`);
  lines.push(`Seed: ${metadata.seed} · Node: ${metadata.nodeVersion}`);
  lines.push("");

  const showSybil = reports.some((report) => report.sybil);
  const showSlowBurn = reports.some((report) => report.slowBurn);
  const showCollusion = reports.some((report) => report.collusion);

  lines.push("## Composite resistance scores (0-100, higher is better)");
  lines.push("");
  const header = ["Mechanism"];
  if (showSybil) header.push("Sybil farming");
  if (showSlowBurn) header.push("Slow-burn harvest");
  if (showCollusion) header.push("Collusive ring");
  header.push("Composite");
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`|${header.map((_, index) => (index === 0 ? "---" : "---:")).join("|")}|`);
  for (const report of reports) {
    const cells = [`\`${report.mechanism}\``];
    if (showSybil) cells.push(report.scores.sybilFarming?.toFixed(1) ?? "-");
    if (showSlowBurn) cells.push(report.scores.slowBurnHarvest?.toFixed(1) ?? "-");
    if (showCollusion) cells.push(report.scores.collusiveRing?.toFixed(1) ?? "-");
    cells.push(`**${report.scores.composite.toFixed(1)}**`);
    lines.push(`| ${cells.join(" | ")} |`);
  }
  lines.push("");
  lines.push("## Configuration");
  lines.push("");
  for (const line of configsDescription) lines.push(`- ${line}`);
  lines.push("");

  for (const report of reports) {
    lines.push(`## ${report.mechanism}`);
    lines.push("");
    lines.push(report.description);
    lines.push("");
    const scoreParts: string[] = [];
    if (report.scores.sybilFarming !== undefined) {
      scoreParts.push(`Sybil farming: **${report.scores.sybilFarming.toFixed(1)}**`);
    }
    if (report.scores.slowBurnHarvest !== undefined) {
      scoreParts.push(`slow-burn harvest: **${report.scores.slowBurnHarvest.toFixed(1)}**`);
    }
    if (report.scores.collusiveRing !== undefined) {
      scoreParts.push(`collusive ring: **${report.scores.collusiveRing.toFixed(1)}**`);
    }
    lines.push(`Scores — ${scoreParts.join(", ")}`);
    lines.push("");

    if (report.sybil) {
      lines.push("### Sybil farming");
      lines.push("");
      const sybil = report.sybil.metrics;
      lines.push(
        `- Attacker: ${sybil.sybilAgents} identities × ${report.sybil.config.attestsPerSybil} attestations = ${sybil.totalAttestations} completions`,
      );
      lines.push(
        `- Effective score: ${sybil.totalScore} · spend: ${sol(sybil.spentLamports)} · locked: ${sol(sybil.lockedLamports)} · cost per point: ${sol(sybil.costPerPointLamports)}`,
      );
      lines.push(
        `- Locked capital per point: ${sol(sybil.capitalPerPointLamports)} · honest cost per point: ${sol(sybil.honestCostPerPointLamports)} · efficiency ratio: ${sybil.efficiencyRatio.toFixed(2)}x`,
      );
      lines.push(
        `- Challenges: ${sybil.challenges} · upheld: ${sybil.disputes}`,
      );
      lines.push(`- ${report.sybil.findings}`);
      lines.push("");
    }

    if (report.slowBurn) {
      lines.push("### Slow burn then harvest");
      lines.push("");
      const slow = report.slowBurn.metrics;
      lines.push(
        `- Target score: ${report.slowBurn.config.targetScore} · harvest value: ${sol(slow.harvestValueLamports)}`,
      );
      lines.push(
        `- Reachable: ${slow.reachable}${slow.daysToThreshold !== null ? ` in ${slow.daysToThreshold} days` : ""} · spent: ${sol(slow.spentLamports)}`,
      );
      lines.push(
        `- Slashable capital: ${sol(slow.slashableLamports)} · coverage: ${(slow.slashCoverage * 100).toFixed(1)}% · score after slash: ${slow.scoreAfterSlash}`,
      );
      lines.push(`- ${report.slowBurn.findings}`);
      lines.push("");
    }

    if (report.collusion) {
      lines.push("### Collusive ring");
      lines.push("");
      const ring = report.collusion.metrics;
      lines.push(
        `- Ring of ${report.collusion.config.ringSize} × ${report.collusion.config.ratingsPerPair} ratings per pair`,
      );
      lines.push(
        `- Manufactured score per member: ${ring.ringScorePerAgent} · ring spend: ${sol(ring.ringCostLamports)} · cost per point: ${sol(ring.costPerRingPointLamports)}`,
      );
      lines.push(
        `- Detector ensemble precision/recall: ${
          ring.detectorPrecision === null
            ? "n/a (mechanism records no rating graph)"
            : `${ring.detectorPrecision.toFixed(2)} / ${ring.detectorRecall?.toFixed(2)}`
        }`,
      );
      if (report.collusion.metrics.detectors.length > 0) {
        lines.push("");
        lines.push("| Detector | Flagged | Precision | Recall | F1 |");
        lines.push("|---|---:|---:|---:|---:|");
        for (const detector of report.collusion.metrics.detectors) {
          lines.push(
            `| ${detector.name} | ${detector.flagged} | ${detector.precision.toFixed(2)} | ${detector.recall.toFixed(2)} | ${detector.f1.toFixed(2)} |`,
          );
        }
      }
      lines.push(`- ${report.collusion.findings}`);
      lines.push("");
    }

    if (report.weakSpots.length > 0) {
      lines.push("Weak spots (published deliberately):");
      lines.push("");
      for (const spot of report.weakSpots) lines.push(`- ${spot}`);
      lines.push("");
    }
  }

  lines.push("## Reproducing");
  lines.push("");
  lines.push("```bash");
  lines.push("pnpm --filter @taopp/benchmark start");
  lines.push("# targeted: pnpm --filter @taopp/benchmark start -- --scenario sybil --mechanism taop_bonded_decay");
  lines.push("# or: pnpm bench -- --seed 42 --out benchmark/results");
  lines.push("```");
  lines.push("");
  lines.push("Methodology: `docs/methodology.md`. Dataset: `benchmark/dataset/` (CC-BY-4.0).");
  lines.push("");
  return lines.join("\n");
}
