/**
 * TAOP Solana example agent — the full trust loop across two independent agents.
 *
 *   Agent A: registers a profile, registers a bonded capability, attests a completion.
 *   Agent B: discovers capabilities, vets Agent A by score, challenges the completion
 *            with a native SOL bond.
 *   Certifier: resolves the challenge (upheld → A's score drops, B is refunded).
 *
 * Two transports:
 *   default     — direct SDK calls (@taopp/solana)
 *   --via-mcp   — the same loop driven through the MCP server over stdio, proving any
 *                 MCP-compatible agent can vet another agent mid-run.
 *
 * Usage:
 *   pnpm start -- --cluster localnet          # requires ./scripts/localnet.sh running
 *   pnpm start -- --cluster devnet            # requires funded AGENT_A_KEYPAIR / AGENT_B_KEYPAIR
 *   pnpm start -- --cluster mainnet-beta ...  # real SOL; tiny amounts
 *   pnpm start -- --via-mcp --cluster localnet
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import bs58 from "bs58";
import dotenv from "dotenv";
import { TaopSolanaClient } from "@taopp/solana";

dotenv.config();

const CAPABILITY_TYPE = "LoRA";
const TASK_TYPE = "summarization";
const BOND_SOL = 0.005;

const CLUSTERS: Record<string, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

interface Args {
  cluster: string;
  viaMcp: boolean;
  task: string;
  reclaim: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const clusterIndex = argv.indexOf("--cluster");
  const taskIndex = argv.indexOf("--task");
  return {
    cluster: clusterIndex >= 0 ? argv[clusterIndex + 1] : "localnet",
    viaMcp: argv.includes("--via-mcp"),
    reclaim: argv.includes("--reclaim"),
    task:
      taskIndex >= 0
        ? argv[taskIndex + 1]
        : "Two agents verified each other's work without a platform in the middle.",
  };
}

function expandHome(value: string): string {
  return value.startsWith("~") ? path.join(os.homedir(), value.slice(2)) : value;
}

function loadKeypair(envVar: string): Keypair | undefined {
  const value = process.env[envVar];
  if (!value) return undefined;
  const expanded = expandHome(value);
  if (fs.existsSync(expanded)) {
    const secret = JSON.parse(fs.readFileSync(expanded, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }
  if (expanded.includes("/") || expanded.endsWith(".json")) {
    throw new Error(
      `${envVar} points to a keypair file that does not exist: ${expanded} ` +
        `(use an absolute path when running through pnpm --filter)`,
    );
  }
  return Keypair.fromSecretKey(bs58.decode(value));
}

async function ensureFunds(
  connection: Connection,
  keypair: Keypair,
  cluster: string,
): Promise<void> {
  if (cluster === "mainnet-beta") return;
  const minimum = 0.05 * LAMPORTS_PER_SOL;
  const balance = await connection.getBalance(keypair.publicKey);
  if (balance >= minimum) return;
  try {
    const signature = await connection.requestAirdrop(
      keypair.publicKey,
      LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(signature, "confirmed");
  } catch {
    const after = await connection.getBalance(keypair.publicKey);
    if (after < minimum) {
      throw new Error(
        `Insufficient balance for ${keypair.publicKey.toBase58()} and the ` +
          `faucet is unavailable. Fund the account manually or set ` +
          `AGENT_A_KEYPAIR / AGENT_B_KEYPAIR to funded keypairs.`,
      );
    }
  }
}

function explorer(kind: "address" | "tx", value: string, cluster: string): string {
  const clusterParam = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/${kind}/${value}${clusterParam}`;
}

function step(title: string): void {
  console.log(`\n== ${title}`);
}

/**
 * Reclaim bonds: withdraw every active capability bond owned by AGENT_A_KEYPAIR
 * (e.g. after a demo run) so funds are not stranded in closed-out demo records.
 */
async function runReclaim(args: Args, connection: Connection): Promise<void> {
  const agentA = loadKeypair("AGENT_A_KEYPAIR");
  if (!agentA) {
    throw new Error("Set AGENT_A_KEYPAIR to the keypair whose bonds you want back.");
  }
  const programId = process.env.TAOP_PROGRAM_ID
    ? new PublicKey(process.env.TAOP_PROGRAM_ID)
    : undefined;
  const client = new TaopSolanaClient({ connection, wallet: agentA, programId });

  const discovered = await client.discover({
    capabilityType: CAPABILITY_TYPE,
    minScore: 0,
    includeUncertified: true,
  });
  const owned = discovered.filter(
    (item) => item.agent === agentA.publicKey.toBase58(),
  );
  if (owned.length === 0) {
    console.log("no active capability bonds found for this agent");
    return;
  }
  for (const item of owned) {
    await client.withdrawCapabilityBond(new PublicKey(item.capability));
    console.log(
      `withdrew ${item.bondLamports} lamports from capability ${item.capability}`,
    );
  }
  console.log(`reclaimed ${owned.length} capability bond(s)`);
}

async function runSdkLoop(args: Args, connection: Connection): Promise<void> {
  const agentA = loadKeypair("AGENT_A_KEYPAIR") ?? Keypair.generate();
  const agentB = loadKeypair("AGENT_B_KEYPAIR") ?? Keypair.generate();
  const certifier = loadKeypair("CERTIFIER_KEYPAIR");
  const programId = process.env.TAOP_PROGRAM_ID
    ? new PublicKey(process.env.TAOP_PROGRAM_ID)
    : undefined;

  await ensureFunds(connection, agentA, args.cluster);
  await ensureFunds(connection, agentB, args.cluster);

  const clientA = new TaopSolanaClient({ connection, wallet: agentA, programId });
  const clientB = new TaopSolanaClient({ connection, wallet: agentB, programId });

  step("Agent A: register profile and bond a capability");
  if ((await clientA.getAgent(agentA.publicKey)) === null) {
    await clientA.registerAgent("ipfs://agent-a-profile");
  }
  const { capability } = await clientA.registerCapability({
    capabilityType: CAPABILITY_TYPE,
    metadataUri: "ipfs://agent-a-capability-card",
    bondLamports: BOND_SOL * LAMPORTS_PER_SOL,
  });
  console.log(`capability: ${capability.toBase58()}`);
  console.log(explorer("address", capability.toBase58(), args.cluster));

  const certifierClient = certifier
    ? new TaopSolanaClient({ connection, wallet: certifier, programId })
    : undefined;
  if (certifierClient) {
    await certifierClient.certifyCapability(capability);
    console.log("capability certified by the certifier");
  } else {
    console.log(
      "no CERTIFIER_KEYPAIR set — discovery will include the uncertified capability",
    );
  }

  step("Agent A: complete a task and self-attest");
  const attestation = await clientA.attest({
    taskType: TASK_TYPE,
    resultUri: `ipfs://result-${Date.now()}`,
  });
  console.log(`completion #${attestation.completionId}: ${attestation.completion.toBase58()}`);
  console.log(explorer("tx", attestation.signature, args.cluster));

  step("Agent B: discover capabilities and vet Agent A");
  const discovered = await clientB.discover({
    capabilityType: CAPABILITY_TYPE,
    minScore: 0,
    includeUncertified: !certifierClient,
  });
  const candidate = discovered.find(
    (item) => item.agent === agentA.publicKey.toBase58(),
  );
  if (!candidate) throw new Error("Agent A was not discoverable on-chain");
  console.log(
    `chose ${candidate.agent} score=${candidate.score} bond=${candidate.bondLamports} certified=${candidate.certified}`,
  );

  const scoreBefore = await clientB.getScore(agentA.publicKey);
  console.log(`Agent A score before challenge: ${scoreBefore.score}`);

  step("Agent B: challenge the completion with a native SOL bond");
  const challengeSignature = await clientB.challenge({
    completion: attestation.completion,
    evidenceUri: "ipfs://fraud-evidence",
  });
  console.log(explorer("tx", challengeSignature, args.cluster));

  if (!certifierClient) {
    console.log(
      "\nNo CERTIFIER_KEYPAIR set — challenge is pending. Resolve it as the certifier, or re-run with the authority key.",
    );
  } else {
    step("Certifier: resolve the challenge as upheld");
    const resolveSignature = await certifierClient.resolveChallenge({
      completion: attestation.completion,
      upheld: true,
    });
    console.log(explorer("tx", resolveSignature, args.cluster));
  }

  step("Agent B: re-read Agent A's score");
  const scoreAfter = await clientB.getScore(agentA.publicKey);
  console.log(
    `score: ${scoreBefore.score} -> ${scoreAfter.score} (disputes: ${scoreAfter.disputes})`,
  );
  console.log(
    "\nThe loop is complete: discovery, bonded challenge, resolution, and a decayed score — all on-chain.",
  );
}

async function runMcpLoop(args: Args): Promise<void> {
  const rpcUrl = process.env.SOLANA_RPC_URL ?? CLUSTERS[args.cluster];
  const serverEntry = path.resolve(
    import.meta.dirname,
    "../../../packages/mcp-server/src/index.ts",
  );

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", serverEntry],
    env: {
      ...process.env,
      TAOP_CHAIN: "solana",
      SOLANA_RPC_URL: rpcUrl,
    },
  });
  const client = new Client({ name: "taop-example-agent", version: "0.1.0" });
  await client.connect(transport);

  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text: string }>;
    if (result.isError) throw new Error(content[0]?.text ?? `tool ${name} failed`);
    return JSON.parse(content[0].text);
  };

  step("MCP: deployment info");
  console.log(JSON.stringify(await call("get_deployment_info", {}), null, 2));

  step("MCP: Agent A attests a completion (signer from SOLANA_KEYPAIR)");
  const attestation = await call("attest_completion", {
    taskType: TASK_TYPE,
    resultUri: `ipfs://result-${Date.now()}`,
  });
  console.log(JSON.stringify(attestation, null, 2));

  step("MCP: Agent B discovers capabilities and scores the counterparty");
  const discovered = await call("discover_capabilities", {
    capabilityType: CAPABILITY_TYPE,
    minScore: 0,
  });
  console.log(JSON.stringify(discovered, null, 2));

  if (Array.isArray(discovered) && discovered.length > 0) {
    const top = discovered[0] as { agent: string };
    console.log(
      JSON.stringify(await call("get_agent_score", { agent: top.agent }), null, 2),
    );
  }

  step("MCP: Agent B challenges the completion");
  const challenge = await call("challenge_completion", {
    completionId: attestation.completion,
    evidenceUri: "ipfs://fraud-evidence",
  });
  console.log(JSON.stringify(challenge, null, 2));

  step("MCP: read the completion back");
  console.log(
    JSON.stringify(await call("get_completion", { completionId: attestation.completion }), null, 2),
  );

  await client.close();
}

async function main(): Promise<void> {
  const args = parseArgs();
  const rpcUrl = process.env.SOLANA_RPC_URL ?? CLUSTERS[args.cluster];
  if (!rpcUrl) {
    throw new Error(`Unknown cluster: ${args.cluster}`);
  }
  console.log(`TAOP Solana example agent — cluster=${args.cluster} rpc=${rpcUrl}`);
  console.log(`mode=${args.viaMcp ? "mcp" : "sdk"}${args.reclaim ? " (reclaim)" : ""}`);

  const connection = new Connection(rpcUrl, "confirmed");
  if (args.reclaim) {
    await runReclaim(args, connection);
    return;
  }

  if (args.viaMcp) {
    if (!process.env.SOLANA_KEYPAIR) {
      console.log(
        "tip: set SOLANA_KEYPAIR (path or base58) so the MCP server can sign attestations/challenges",
      );
    }
    await runMcpLoop(args);
  } else {
    await runSdkLoop(args, connection);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
