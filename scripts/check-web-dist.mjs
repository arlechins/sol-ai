#!/usr/bin/env node
/**
 * Dist completeness check for the website build.
 *
 * The bundle budget reads the assets index.html references; this asserts the
 * files Vite copies from public/ that hosting depends on (headers, redirects,
 * security.txt, social image) and that no asset reference dangles.
 *
 *   pnpm --filter @taopp/web build && node scripts/check-web-dist.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = resolve(root, "apps/web/dist");

const REQUIRED = [
  "index.html",
  "_redirects",
  "_headers",
  "robots.txt",
  "favicon.svg",
  "og.png",
  ".well-known/security.txt",
];

let failed = false;
for (const file of REQUIRED) {
  if (!existsSync(resolve(dist, file))) {
    console.error(`missing dist file: ${file}`);
    failed = true;
  }
}

const html = readFileSync(resolve(dist, "index.html"), "utf8");
const referenced = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)]
  .map((match) => match[1])
  .filter((path) => path.startsWith("/assets/"));
for (const reference of referenced) {
  if (!existsSync(resolve(dist, reference.slice(1)))) {
    console.error(`index.html references a missing asset: ${reference}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(
  `web dist ok (${REQUIRED.length} static files, ${referenced.length} referenced assets)`,
);
