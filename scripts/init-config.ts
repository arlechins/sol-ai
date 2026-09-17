/**
 * Initialize the on-chain config and publish deployments.solana.json.
 *
 * Usage:
 *   SOLANA_RPC_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   pnpm tsx scripts/init-config.ts --cluster devnet \
 *     --certifier <PUBKEY> --treasury <PUBKEY> [--bond-sol 0.005] [--decay-days 30]
 *
 * Safe to re-run: the config is only initialized once; the deployment file is
 * always refreshed with the current on-chain values.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TaopSolanaClient } from "@taopp/solana";
import bs58 from "bs58";

const ROOT = path.resolve(import.meta.dirname, "..");
const LAMPORTS_PER_SOL = 1_000_000_000;

const CLUSTER_RPC: Record<string, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function expandHome(value: string): string {
  return value.startsWith("~") ? path.join(os.homedir(), value.slice(2)) : value;
}

function loadKeypair(value: string): Keypair {
  const expanded = expandHome(value);
  if (fs.existsSync(expanded)) {
    const secret = JSON.parse(fs.readFileSync(expanded, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }
  return Keypair.fromSecretKey(bs58.decode(value));
}

async function main(): Promise<void> {
  const cluster = arg("cluster") ?? process.env.TAOP_CLUSTER ?? "devnet";
  const rpcUrl =
    process.env.SOLANA_RPC_URL ??
    arg("rpc") ??
    CLUSTER_RPC[cluster] ??
    CLUSTER_RPC.devnet;

  const walletValue =
    process.env.ANCHOR_WALLET ??
    arg("keypair") ??
    path.join(os.homedir(), ".config/solana/id.json");
  const authority = loadKeypair(walletValue);

  const connection = new Connection(rpcUrl, "confirmed");
  const client = new TaopSolanaClient({ connection, wallet: authority });

  const programInfo = await connection.getAccountInfo(client.programId);
  if (!programInfo?.executable) {
    throw new Error(
      `Program ${client.programId.toBase58()} is not deployed on ${cluster}. Run: anchor deploy --provider.cluster ${cluster}`,
    );
  }

  const certifier = new PublicKey(arg("certifier") ?? authority.publicKey);
  const treasury = new PublicKey(arg("treasury") ?? authority.publicKey);
  const bondSol = Number(arg("bond-sol") ?? "0.005");
  const decayDays = Number(arg("decay-days") ?? "30");
  const bondLamports = Math.round(bondSol * LAMPORTS_PER_SOL);
  const decayPeriodSecs = Math.round(decayDays * 24 * 60 * 60);

  const existing = await connection.getAccountInfo(client.pdas.config);
  if (!existing) {
    console.log(
      `Initializing config (bond=${bondSol} SOL, decay=${decayDays}d, certifier=${certifier.toBase58()}, treasury=${treasury.toBase58()})`,
    );
    const signature = await client.initializeConfig({
      certifier,
      treasury,
      challengeBondLamports: bondLamports,
      decayPeriodSecs,
    });
    console.log(`config initialized: ${signature}`);
  } else {
    console.log("config already initialized; refreshing deployment file");
  }

  const config = await client.getConfig();
  const deployment = {
    cluster,
    programId: client.programId.toBase58(),
    config: client.pdas.config.toBase58(),
    authority: authority.publicKey.toBase58(),
    certifier: config.certifier.toBase58(),
    treasury: config.treasury.toBase58(),
    challengeBondLamports: config.challengeBondLamports,
    decayPeriodSecs: config.decayPeriodSecs,
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(ROOT, "deployments.solana.json");
  fs.writeFileSync(outPath, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`wrote ${outPath}`);
  console.log(
    `explorer: https://explorer.solana.com/address/${client.programId.toBase58()}` +
      (cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
