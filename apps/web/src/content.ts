import benchmark from "./data/benchmark.json";
import dataset from "./data/dataset.json";
import deployment from "./data/deployment.json";

export const REPO = "https://github.com/arlechins/sol-ai";
export const DOCS = `${REPO}/tree/main/docs`;
export const CLUSTER = deployment.cluster;
export const PROGRAM_ID = deployment.programId;
export const CONFIG_PDA = deployment.config ?? "";
export const DEPLOYED_AT = deployment.deployedAt ?? "";

export const explorer = {
  program: `https://explorer.solana.com/address/${PROGRAM_ID}?cluster=${CLUSTER}`,
  config: CONFIG_PDA
    ? `https://explorer.solana.com/address/${CONFIG_PDA}?cluster=${CLUSTER}`
    : undefined,
  tx: (signature: string) =>
    `https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`,
  address: (address: string) =>
    `https://explorer.solana.com/address/${address}?cluster=${CLUSTER}`,
};

export const BUILD_HASH =
  "4fc831ed93f4c8b84c76b83803abad0490bf59fefedcf5a2cb782b2faf39c01e";

export const benchmarkArtifacts = {
  results: `${REPO}/blob/main/benchmark/results/REPORT.md`,
  datasetUrl: `${REPO}/tree/main/benchmark/dataset`,
  methodology: `${REPO}/blob/main/docs/methodology.md`,
  baseline: benchmark.metadata,
  dataset: {
    name: dataset.name,
    version: dataset.version,
    license: dataset.license,
    patterns: dataset.patterns.length,
    attackClasses: dataset.attackClasses,
  },
};

export const verifiedLoop = [
  {
    step: "01",
    name: "Attest",
    tx: "cS1rf1vMDRQppuwSb1civFhmyzqnUwtD49CT5qynNNZs5AZvUSEnknd6WfkdjGXdn8QgffEG7dpcy2gyfHq9VFd",
    title: "An agent records a completed task",
    body: "The agent writes a completion with a result URI. The record is cheap, public, and permanent — and worthless on its own, because nothing has been verified yet.",
  },
  {
    step: "02",
    name: "Challenge",
    tx: "5HCaz3oNUZQ2ytkhMZwTmQkTTTbEoAHDgdpjmp5Bmixa1atLNMQgoNLXkgLVTtqP1MY6UtVQuEJzJ4bY1dZmbBS",
    title: "Anyone can dispute it with a bonded claim",
    body: "A challenger escrows a native-SOL bond against the completion. The bond prices the claim: filing noise costs money, and a rejected challenge forfeits the bond to the treasury.",
  },
  {
    step: "03",
    name: "Resolve",
    tx: "p34x3tdMLPDPCz32g1UJXYihTGjBRDefnGgqw3n8Tj7MqwNvdEkJVkxQbBN8MpkNixZ6TfJyQMkuYKzvrV7Hbvd",
    title: "The certifier settles it on chain",
    body: "An upheld challenge subtracts from the agent's score and refunds the bond; a rejected one pays the treasury. The resulting score decays with inactivity, so stale reputation cannot be hoarded.",
  },
];

export const testSuite = [
  { label: "Rust program tests", count: 100, detail: "integration + property", path: `${REPO}/tree/main/test-suite` },
  { label: "SDK tests", count: 21, detail: "unit + local-validator E2E", path: `${REPO}/tree/main/packages/solana` },
  { label: "MCP tests", count: 4, detail: "stdio tool smoke", path: `${REPO}/tree/main/packages/mcp-server` },
  { label: "Webhook tests", count: 10, detail: "HMAC delivery", path: `${REPO}/tree/main/packages/webhooks` },
  { label: "Benchmark tests", count: 12, detail: "detectors + dataset", path: `${REPO}/tree/main/benchmark` },
];

export const testTotal = testSuite.reduce((sum, suite) => sum + suite.count, 0);

export const heroFacts = [
  { label: "Program", value: `${PROGRAM_ID.slice(0, 6)}…${PROGRAM_ID.slice(-6)}` },
  { label: "Challenge bond", value: "0.005 SOL" },
  { label: "Inactivity decay", value: "30 days" },
  { label: "Benchmark composite", value: "34.6 / 100" },
];

export const trustContract = [
  {
    title: "Bonds, not tokens",
    body: "Every claim is collateralized in native SOL held by system-owned vault PDAs. There is no protocol token, and no admin path that mints reputation.",
  },
  {
    title: "Score is arithmetic",
    body: "score = max(0, completions − disputes), halved every decay period of inactivity, capped at 63 halvings. The SDK computes the same value locally and the program exposes it on chain.",
  },
  {
    title: "Evidence is public",
    body: "Reproducible devnet build, pinned EIP-style instruction discriminators, an IDL in the repo, and a benchmark that publishes where the mechanism loses.",
  },
];

export const sections = {
  gap: {
    eyebrow: "The gap",
    title: "Agents are being asked to trust each other with no shared memory.",
    lede: "Marketplaces and orchestrators increasingly route work between autonomous agents. Nearly every trust signal available today is self-reported, siloed, or free to manufacture. A score nobody can challenge is a score nobody should use.",
    points: [
      {
        title: "Self-attestation is free",
        body: "Any agent can claim any completion. Without a cost to lying, a dashboard of green checkmarks carries no information.",
      },
      {
        title: "Reputation does not travel",
        body: "Each platform keeps its own counters. An agent's history dies at the API boundary, so every new integration starts from zero.",
      },
      {
        title: "Stale history is hoarded",
        body: "An abandoned account keeps its old score forever. Decay-free reputation becomes a marketable asset for whoever farms it first.",
      },
    ],
  },
  fix: {
    eyebrow: "The mechanism",
    title: "Make claims costly, challengeable, and perishable.",
    lede: "TAOP is one Anchor program that turns completion claims into bonded, disputable events and compresses the outcome into a score that decays.",
  },
  benchmarkCopy: {
    eyebrow: "Published weakness",
    title: "We benchmark the mechanism against the people who would game it.",
    lede: "Three attack classes, five mechanisms, one seed-42 baseline. The rubric is simple and published, including the parts where TAOP performs badly — self-attestation is cheap, and bonded capital does not cover a high-value harvest.",
    rubric:
      "Composite = equal-weight mean of the three class scores. Sybil = cost efficiency + locked capital per point. Slow burn = slashable capital ÷ harvest value. Collusion = ring efficiency versus honest efficiency.",
  },
  integrate: {
    eyebrow: "Integrate",
    title: "Vet another agent mid-run, over HTTP or MCP.",
    lede: "The SDK works in Node and in the browser; the MCP server exposes the same surface as tools for any agent runtime.",
    snippets: [
      {
        id: "sdk",
        label: "TypeScript SDK",
        code: `import { Connection, PublicKey } from "@solana/web3.js";
import { TaopSolanaClient } from "@taopp/solana";

const client = new TaopSolanaClient({
  connection: new Connection("https://api.devnet.solana.com", "confirmed"),
});

const score = await client.getScore(new PublicKey(agentAddress));
const certified = await client.discover({ capabilityType: "LoRA", minScore: 1 });`,
      },
      {
        id: "mcp",
        label: "MCP server",
        code: `{
  "mcpServers": {
    "taop": {
      "command": "npx",
      "args": ["-y", "@taopp/mcp-server"],
      "env": { "SOLANA_RPC_URL": "https://api.devnet.solana.com" }
    }
  }
}`,
      },
      {
        id: "webhooks",
        label: "Signed webhooks",
        code: `// Deliveries are signed over "<timestamp>.<raw body>" and verification
// fails closed outside a 5-minute window.
POST /your-endpoint
x-taop-timestamp: 1750000000
x-taop-signature: sha256=...

import { createDispatcher } from "@taopp/webhooks";`,
      },
    ],
  },
};

export const noTokenNote =
  "TAOP has no token. Bonds are native SOL; reputation is not for sale.";
