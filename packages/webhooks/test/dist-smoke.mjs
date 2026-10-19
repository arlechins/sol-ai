/**
 * Built-artifact smoke: imports the compiled webhook dispatcher (ESM and CJS)
 * and exercises the signing/verification contract, including the replay
 * window. The vitest suite runs the TypeScript source, so this is what catches
 * packaging regressions in the shipped bundle.
 *
 *   node packages/webhooks/test/dist-smoke.mjs
 */
import { createRequire } from "node:module";
import { signPayload, verifySignature } from "../dist/index.js";

const body = JSON.stringify({ id: "sig:0", name: "CompletionAttested" });
const now = Math.floor(Date.now() / 1000);
const header = `sha256=${signPayload("secret", body, now)}`;

if (!verifySignature("secret", body, header, now, { now })) {
  throw new Error("timestamped signature round trip failed");
}
if (verifySignature("secret", body, header, now, { now: now + 400 })) {
  throw new Error("replay window is not enforced in the built dispatcher");
}
if (verifySignature("secret", body, header, undefined)) {
  throw new Error("verification must fail closed without a timestamp");
}

const require = createRequire(import.meta.url);
const cjs = require("../dist/index.cjs");
if (typeof cjs.signPayload !== "function" || typeof cjs.verifySignature !== "function") {
  throw new Error("CJS build is missing the signing exports");
}

console.log("webhooks dist smoke ok");
