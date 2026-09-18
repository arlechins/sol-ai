#!/usr/bin/env node
/**
 * Live write-path E2E: runs the full two-agent trust loop against a real
 * cluster (devnet by default) and then reclaims the capability bond.
 *
 *   TAOP_E2E_KEYPAIR=/path/to/id.json node scripts/devnet-e2e.mjs
 *   TAOP_E2E_CLUSTER=localnet node scripts/devnet-e2e.mjs
 *
 * The keypair (JSON array, Solana CLI format) pays for two fresh agent keypairs
 * and the challenge bond. On devnet this spends ~0.13 test SOL up front:
 *   0.06 + 0.06 agent funding + ~0.005 bond + fees; agent balances are swept
 *   back and the bond is reclaimed at the end, so the net cost is fees only.
 *
 * CI: `.github/workflows/devnet-e2e.yml` (manual dispatch, gated on the
 * `TAOP_E2E_KEYPAIR` secret).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const CLUSTERS = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

const cluster = process.env.TAOP_E2E_CLUSTER ?? "devnet";
const rpcUrl = process.env.SOLANA_RPC_URL ?? CLUSTERS[cluster];
if (!rpcUrl) throw new Error(`unknown cluster ${cluster}`);

const keyPath =
  process.env.TAOP_E2E_KEYPAIR ??
  path.join(os.homedir(), ".config", "solana", "id.json");
if (!fs.existsSync(keyPath)) {
  throw new Error(
    `keypair not found at ${keyPath}; set TAOP_E2E_KEYPAIR to a funded keypair file`,
  );
}

const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, "utf8"))),
);
const connection = new Connection(rpcUrl, "confirmed");
const balance = await connection.getBalance(payer.publicKey);
console.log(
  `cluster=${cluster} rpc=${rpcUrl}\npayer=${payer.publicKey.toBase58()} balance=${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
);
if (balance < 0.15 * LAMPORTS_PER_SOL) {
  throw new Error(
    "payer needs at least 0.15 SOL: two agents (0.06 each), the bond, and fees",
  );
}

// A fresh ledger (localnet --reset) has the program but no config account.
const programId = new PublicKey(
  process.env.TAOP_PROGRAM_ID ?? "8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE",
);
const [configPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("config")],
  programId,
);
if (!(await connection.getAccountInfo(configPda))) {
  if (cluster === "mainnet-beta") {
    throw new Error("config account is missing on mainnet; refusing to initialize");
  }
  console.log("\nconfig account missing; initializing it first");
  const init = spawnSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "scripts/init-config.ts",
      "--cluster",
      cluster,
      "--certifier",
      payer.publicKey.toBase58(),
      "--treasury",
      payer.publicKey.toBase58(),
    ],
    {
      env: {
        ...process.env,
        SOLANA_RPC_URL: rpcUrl,
        ANCHOR_WALLET: keyPath,
        DEPLOYMENTS_PATH: path.join(os.tmpdir(), `taop-e2e-deployment-${cluster}.json`),
      },
      stdio: "inherit",
    },
  );
  if (init.status !== 0) {
    throw new Error("config initialization failed");
  }
}

async function sendWithRetry(transaction, signers, label) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await sendAndConfirmTransaction(connection, transaction, signers, {
        commitment: "confirmed",
      });
    } catch (error) {
      if (attempt === 3) throw error;
      console.log(
        `${label}: attempt ${attempt} failed (${String(error.message ?? error).slice(0, 80)}); retrying`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function sweepAgents() {
  console.log("\n=== sweeping agent balances back to the payer ===");
  for (const [index, agent] of agents.entries()) {
    const label = index === 0 ? "a" : "b";
    try {
      const remaining = await connection.getBalance(agent.publicKey);
      const fee = 5_000;
      if (remaining <= fee) {
        console.log(`agent ${label} has ${remaining} lamports; nothing to sweep`);
        continue;
      }
      const signature = await sendWithRetry(
        new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: agent.publicKey,
            toPubkey: payer.publicKey,
            lamports: remaining - fee,
          }),
        ),
        [agent],
        `sweep agent ${label}`,
      );
      console.log(`swept ${remaining - fee} lamports from agent ${label} (${signature})`);
    } catch (error) {
      // Best-effort: never lose the rest of the run to a cleanup failure.
      console.error(`sweep agent ${label} failed: ${String(error.message ?? error)}`);
      process.exitCode = 1;
    }
  }
  const finalBalance = await connection.getBalance(payer.publicKey);
  console.log(
    `\npayer balance after sweep: ${(finalBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
  );
}

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "taop-e2e-"));
const agentPaths = {};
const agents = [];
try {
  for (const name of ["a", "b"]) {
    const agent = Keypair.generate();
    agents.push(agent);
    const file = path.join(workdir, `agent-${name}.json`);
    fs.writeFileSync(file, JSON.stringify(Array.from(agent.secretKey)));
    agentPaths[name] = file;
    const signature = await sendWithRetry(
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: agent.publicKey,
          lamports: 0.06 * LAMPORTS_PER_SOL,
        }),
      ),
      [payer],
      `fund agent ${name}`,
    );
    console.log(`funded agent ${name}: ${agent.publicKey.toBase58()} (${signature})`);
  }

  const baseEnv = {
    ...process.env,
    SOLANA_RPC_URL: rpcUrl,
    CERTIFIER_KEYPAIR: keyPath,
    AGENT_A_KEYPAIR: agentPaths.a,
    AGENT_B_KEYPAIR: agentPaths.b,
  };

  console.log("\n=== running the trust loop ===");
  const loop = spawnSync(
    "pnpm",
    ["--filter", "@taopp/example-solana-agent", "start", "--", "--cluster", cluster],
    { env: baseEnv, stdio: "inherit" },
  );
  if (loop.status !== 0) process.exitCode = loop.status ?? 1;

  console.log("\n=== reclaiming Agent A's capability bond ===");
  const reclaim = spawnSync(
    "pnpm",
    [
      "--filter",
      "@taopp/example-solana-agent",
      "start",
      "--",
      "--cluster",
      cluster,
      "--reclaim",
    ],
    { env: baseEnv, stdio: "inherit" },
  );
  if (reclaim.status !== 0) process.exitCode = reclaim.status ?? 1;

  await sweepAgents();
} finally {
  // If the loop or reclaim threw, the freshly generated keys are about to be
  // deleted with their test SOL still on them; sweep once more, best-effort.
  if (agents.length > 0) await sweepAgents();
  fs.rmSync(workdir, { recursive: true, force: true });
}
