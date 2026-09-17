/**
 * Read-only healthcheck for a TAOP deployment. Exits non-zero when the RPC,
 * program account, or config is unhealthy so that the scheduled workflow fails
 * loudly.
 *
 * Usage:
 *   SOLANA_RPC_URL=https://api.devnet.solana.com pnpm healthcheck
 *   SOLANA_RPC_URL=... TAOP_HEALTHCHECK_AGENT=<pubkey> pnpm healthcheck
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { TaopSolanaClient } from "@taopp/solana";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const PROGRAM_ID =
  process.env.TAOP_PROGRAM_ID ?? "8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE";
const AGENT = process.env.TAOP_HEALTHCHECK_AGENT;

async function main(): Promise<void> {
  const connection = new Connection(RPC_URL, "confirmed");
  const problems: string[] = [];

  const version = await connection.getVersion().catch((error) => {
    problems.push(`rpc unreachable: ${String(error).slice(0, 120)}`);
    return null;
  });

  const client = new TaopSolanaClient({
    connection,
    programId: new PublicKey(PROGRAM_ID),
  });

  const program = await connection
    .getAccountInfo(client.programId)
    .catch(() => null);
  if (!program?.executable) {
    problems.push(`program ${PROGRAM_ID} is not deployed or not executable`);
  }

  let config: Awaited<ReturnType<TaopSolanaClient["getConfig"]>> | null = null;
  try {
    config = await client.getConfig();
  } catch (error) {
    problems.push(`config unreadable: ${String(error).slice(0, 120)}`);
  }

  if (config) {
    if (config.challengeBondLamports <= 0) {
      problems.push("challenge bond is zero");
    }
    if (config.decayPeriodSecs <= 0) {
      problems.push("decay period is zero");
    }
  }

  let agentScore: unknown = null;
  if (AGENT) {
    try {
      agentScore = await client.getScore(new PublicKey(AGENT));
    } catch (error) {
      problems.push(`agent score unreadable: ${String(error).slice(0, 120)}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        rpc: RPC_URL,
        programId: PROGRAM_ID,
        clusterVersion: version,
        admin: config?.admin.toBase58() ?? null,
        certifier: config?.certifier.toBase58() ?? null,
        paused: config?.paused ?? null,
        challengeBondLamports: config?.challengeBondLamports ?? null,
        decayPeriodSecs: config?.decayPeriodSecs ?? null,
        agentScore,
        problems,
      },
      null,
      2,
    ),
  );

  if (problems.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
