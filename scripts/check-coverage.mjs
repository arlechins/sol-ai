#!/usr/bin/env node
/**
 * Coverage ratchet: coverage can only go up.
 *
 * Reads a vitest `json-summary` report and compares it against
 * `coverage-baseline.json`. Fails when a metric drops below the recorded
 * baseline, or below the absolute floor. Raise the baseline deliberately when
 * coverage improves.
 *
 *   node scripts/check-coverage.mjs sdk packages/solana/coverage/coverage-summary.json
 *   node scripts/check-coverage.mjs web apps/web/coverage/coverage-summary.json
 *
 * Note: the Rust program is measured by the mutation spot-check and the CU
 * snapshot instead. LiteSVM executes the BPF artifact, so host-side line
 * coverage of the instruction handlers would be meaningless.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EPSILON = 0.1;
const METRICS = ["statements", "branches", "functions", "lines"];

const [target, reportPath] = process.argv.slice(2);
if (!target || !reportPath) {
  console.error("usage: check-coverage.mjs <sdk|web> <coverage-summary.json>");
  process.exit(2);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const baseline = JSON.parse(
  readFileSync(resolve(root, "coverage-baseline.json"), "utf8"),
);
const thresholds = baseline[target];
if (!thresholds) {
  console.error(`no baseline section for "${target}"`);
  process.exit(2);
}

const report = JSON.parse(readFileSync(resolve(reportPath), "utf8"));
const total = report.total ?? {};

let failed = false;
console.log(`Coverage ratchet — ${target} (${reportPath})`);
for (const metric of METRICS) {
  const pct = total[metric]?.pct;
  if (typeof pct !== "number") {
    console.error(`  FAIL ${metric}: missing from report`);
    failed = true;
    continue;
  }
  const floor = thresholds.floor[metric];
  const recorded = thresholds.baseline[metric];
  const floorOk = pct >= floor;
  const ratchetOk = pct >= recorded - EPSILON;
  if (!floorOk || !ratchetOk) failed = true;
  console.log(
    `  ${floorOk && ratchetOk ? "PASS" : "FAIL"} ${metric}: ${pct.toFixed(2)}%` +
      ` (floor ${floor}%, baseline ${recorded}%${ratchetOk ? "" : " — coverage regressed"})`,
  );
}

if (failed) {
  console.error(
    "\nCoverage below threshold. Add tests, or raise coverage-baseline.json" +
      " deliberately if the drop is intentional and justified.",
  );
  process.exit(1);
}
console.log("\nCoverage ratchet passed. Raise coverage-baseline.json when it improves.\n");
