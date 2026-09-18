#!/usr/bin/env node
/**
 * Bundle budget for the website build.
 *
 * Splits the build into "initial" (JS + CSS referenced by index.html) and
 * "lazy" (the dynamically imported SDK/anchor chunks the demo route pulls in)
 * and fails when either exceeds the budget in apps/web/bundle-budget.json.
 *
 *   pnpm web:budget        # after pnpm --filter @taopp/web build
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = resolve(root, "apps/web/dist");
const budget = JSON.parse(
  readFileSync(resolve(root, "apps/web/bundle-budget.json"), "utf8"),
);

const html = readFileSync(resolve(dist, "index.html"), "utf8");
const referenced = new Set(
  [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) =>
    match[1].replace(/^\//, ""),
  ),
);

const assetsDir = resolve(dist, "assets");
const files = readdirSync(assetsDir).filter((name) => /\.(js|css)$/.test(name));

let initialJs = 0;
let initialCss = 0;
let lazyJs = 0;
const rows = [];

for (const name of files) {
  const path = resolve(assetsDir, name);
  const gzip = gzipSync(readFileSync(path)).length;
  const isInitial = referenced.has(`assets/${name}`);
  const kind = name.endsWith(".css") ? "css" : "js";
  if (isInitial && kind === "js") initialJs += gzip;
  else if (isInitial && kind === "css") initialCss += gzip;
  else if (kind === "js") lazyJs += gzip;
  rows.push({ name, kind, gzip, scope: isInitial ? "initial" : "lazy" });
}

rows.sort((a, b) => b.gzip - a.gzip);
console.log("Bundle budget — gzip bytes");
for (const row of rows) {
  console.log(
    `  ${row.scope.padEnd(7)} ${row.kind.padEnd(3)} ${String(row.gzip).padStart(7)}  ${row.name}`,
  );
}

const checks = [
  ["initial JS", initialJs, budget.initialJsGzip],
  ["initial CSS", initialCss, budget.initialCssGzip],
  ["lazy JS", lazyJs, budget.lazyJsGzip],
];

let failed = false;
console.log("");
for (const [label, actual, limit] of checks) {
  const ok = actual <= limit;
  if (!ok) failed = true;
  const pct = ((actual / limit) * 100).toFixed(1);
  console.log(
    `  ${ok ? "PASS" : "FAIL"} ${label}: ${actual} B / ${limit} B (${pct}%)`,
  );
}

if (failed) {
  console.error(
    "\nBundle budget exceeded. Shrink the chunk or raise apps/web/bundle-budget.json deliberately.",
  );
  process.exit(1);
}
console.log("\nBundle budget passed.\n");
