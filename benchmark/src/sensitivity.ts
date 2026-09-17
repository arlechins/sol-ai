import { LAMPORTS_PER_SOL } from "./economics";
import { TaopBondedDecayMechanism, defaultParams } from "./mechanisms";
import {
  defaultSlowBurnConfig,
  runSlowBurnHarvest,
  slowBurnResistanceScore,
} from "./scenarios/slowBurn";
import {
  defaultSybilConfig,
  runSybilFarming,
  sybilResistanceScore,
} from "./scenarios/sybil";

/**
 * Sensitivity tables for docs/methodology.md. Reproduce with:
 *   pnpm --filter @taopp/benchmark sensitivity
 */
function main(): void {
  const params = defaultParams();

  console.log("## Sybil resistance vs challenge probability (taop_bonded_decay)\n");
  console.log("| Challenge probability | Disputes | Sybil resistance |");
  console.log("|---|---:|---:|");
  for (const probability of [0, 0.01, 0.05, 0.1, 0.3, 0.5]) {
    const result = runSybilFarming(new TaopBondedDecayMechanism(params), {
      ...defaultSybilConfig,
      challengeProbability: probability,
    });
    console.log(
      `| ${probability} | ${result.metrics.disputes} | ${sybilResistanceScore(result).toFixed(1)} |`,
    );
  }

  console.log("\n## Slow-burn coverage vs capability bond (harvest = 5 SOL)\n");
  console.log("| Capability bond (SOL) | Slash coverage | Resistance |");
  console.log("|---|---:|---:|");
  for (const bondSol of [0.005, 0.05, 0.5, 2.5, 5]) {
    const mechanism = new TaopBondedDecayMechanism({
      ...params,
      capabilityBondLamports: bondSol * LAMPORTS_PER_SOL,
    });
    const result = runSlowBurnHarvest(mechanism, defaultSlowBurnConfig);
    console.log(
      `| ${bondSol} | ${(result.metrics.slashCoverage * 100).toFixed(2)}% | ${slowBurnResistanceScore(result).toFixed(1)} |`,
    );
  }
}

main();
