import fs from "node:fs";
import path from "node:path";
import { allMechanisms, defaultParams } from "./mechanisms";
import { renderReport } from "./report";
import {
  ALL_SCENARIOS,
  buildMechanismReport,
  defaultBenchmarkConfigs,
  type BenchmarkConfigs,
  type MechanismReport,
  type ScenarioName,
} from "./rubric";

const VERSION = "0.1.0";

interface CliArgs {
  mechanisms: string[];
  scenarios: ScenarioName[];
  seed: number;
  outDir: string;
  jsonOnly: boolean;
}

const SCENARIO_ALIASES: Record<string, ScenarioName> = {
  all: "sybil",
  sybil: "sybil",
  "slow-burn": "slow-burn",
  slowburn: "slow-burn",
  collusion: "collusion",
};

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(`--${flag}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const mechanismArg = value("mechanism");
  const scenarioArg = value("scenario");
  const scenarios: ScenarioName[] =
    !scenarioArg || scenarioArg === "all"
      ? ALL_SCENARIOS
      : scenarioArg
          .split(",")
          .map((name) => {
            const mapped = SCENARIO_ALIASES[name.trim()];
            if (!mapped) {
              throw new Error(
                `Unknown scenario '${name}'. Use sybil, slow-burn, collusion, or all.`,
              );
            }
            return mapped;
          })
          .filter((name, index, list) => list.indexOf(name) === index);

  return {
    mechanisms:
      mechanismArg && mechanismArg !== "all" ? mechanismArg.split(",") : [],
    scenarios,
    seed: Number(value("seed") ?? "42"),
    outDir: value("out") ?? path.resolve(import.meta.dirname, "../results"),
    jsonOnly: argv.includes("--json-only"),
  };
}

function printSummary(reports: MechanismReport[], args: CliArgs): void {
  const showSybil = args.scenarios.includes("sybil");
  const showSlowBurn = args.scenarios.includes("slow-burn");
  const showCollusion = args.scenarios.includes("collusion");

  const header = ["mechanism".padEnd(28)];
  if (showSybil) header.push("sybil".padStart(8));
  if (showSlowBurn) header.push("slow-burn".padStart(12));
  if (showCollusion) header.push("collusion".padStart(12));
  header.push("composite".padStart(12));

  console.log(`\nTAOP gaming-resistance benchmark (seed=${args.seed})`);
  console.log(header.join(""));
  for (const report of reports) {
    const row = [report.mechanism.padEnd(28)];
    if (showSybil) {
      row.push((report.scores.sybilFarming?.toFixed(1) ?? "-").padStart(8));
    }
    if (showSlowBurn) {
      row.push((report.scores.slowBurnHarvest?.toFixed(1) ?? "-").padStart(12));
    }
    if (showCollusion) {
      row.push((report.scores.collusiveRing?.toFixed(1) ?? "-").padStart(12));
    }
    row.push(report.scores.composite.toFixed(1).padStart(12));
    console.log(row.join(""));
  }
  console.log("");
}

function configLines(configs: BenchmarkConfigs, args: CliArgs): string[] {
  const lines: string[] = [];
  if (args.scenarios.includes("sybil")) {
    lines.push(
      `Sybil: ${configs.sybil.sybils} identities × ${configs.sybil.attestsPerSybil} attestations, challenge probability ${configs.sybil.challengeProbability}, upheld probability ${configs.sybil.upheldProbability}`,
    );
  }
  if (args.scenarios.includes("slow-burn")) {
    lines.push(
      `Slow burn: target score ${configs.slowBurn.targetScore}, harvest ${configs.slowBurn.harvestValueLamports / 1e9} SOL, ${configs.slowBurn.attestsPerDay} attestations/day`,
    );
  }
  if (args.scenarios.includes("collusion")) {
    lines.push(
      `Collusion: ring of ${configs.collusion.ringSize}, ${configs.collusion.ratingsPerPair} ratings per pair, reciprocity threshold ${configs.collusion.reciprocityThreshold}`,
    );
  }
  const params = defaultParams();
  lines.push(
    `Economics: ${params.bondLamports / 1e9} SOL challenge bond, ${params.capabilityBondLamports / 1e9} SOL capability bond, 30-day decay`,
  );
  return lines;
}

function main(): void {
  const args = parseArgs();
  const params = defaultParams();
  const configs: BenchmarkConfigs = defaultBenchmarkConfigs(args.seed);

  const mechanisms = allMechanisms(params).filter(
    (mechanism) =>
      args.mechanisms.length === 0 || args.mechanisms.includes(mechanism.name),
  );
  if (mechanisms.length === 0) {
    throw new Error(`No mechanisms matched: ${args.mechanisms.join(", ")}`);
  }

  const reports = mechanisms.map((mechanism) =>
    buildMechanismReport(mechanism, configs, args.scenarios),
  );

  fs.mkdirSync(args.outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const metadata = {
    generatedAt: new Date().toISOString(),
    seed: args.seed,
    nodeVersion: process.version,
    version: VERSION,
    scenarios: args.scenarios,
  };

  const jsonPath = path.join(args.outDir, `run-${timestamp}.json`);
  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify({ metadata, configs, params, reports }, null, 2)}\n`,
  );

  if (!args.jsonOnly) {
    const markdown = renderReport(reports, metadata, configLines(configs, args));
    const markdownPath = path.join(args.outDir, "REPORT.md");
    fs.writeFileSync(markdownPath, markdown);
    console.log(`wrote ${markdownPath}`);
  }
  console.log(`wrote ${jsonPath}`);
  printSummary(reports, args);
}

main();
