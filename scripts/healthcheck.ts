/**
 * Read-only healthcheck for a TAOP deployment. Exits non-zero when the RPC,
 * program account, config, or deployed bytecode is unhealthy so that the
 * scheduled workflow fails loudly.
 *
 * Usage:
 *   SOLANA_RPC_URL=https://api.devnet.solana.com pnpm healthcheck
 *   SOLANA_RPC_URL=... TAOP_HEALTHCHECK_AGENT=<pubkey> pnpm healthcheck
 *   SOLANA_RPC_URL=... TAOP_EXPECTED_BUILD_HASH=<sha256> pnpm healthcheck
 *   SOLANA_RPC_URL=... TAOP_EXPECTED_UPGRADE_AUTHORITY=<pubkey> pnpm healthcheck
 *   SOLANA_RPC_URL=... TAOP_DESCRIPTOR=<path> pnpm healthcheck
 *
 * Descriptor drift: when the committed deployment descriptor for the same
 * cluster exists (default `apps/web/src/data/deployment.json`), the live
 * config is compared against it so a silent config change fails the check.
 *
 * Bytecode check: mirrors `solana-verify get-program-hash` — sha256 over the
 * program data after the 45-byte ProgramData metadata, with trailing zero
 * padding stripped. The default expected hash is the documented devnet
 * reproducible build and only applies when the RPC host contains "devnet".
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Connection, PublicKey } from "@solana/web3.js";
import { BPF_LOADER_UPGRADEABLE_ID, TaopSolanaClient } from "@taopp/solana";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const PROGRAM_ID =
  process.env.TAOP_PROGRAM_ID ?? "8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE";
const AGENT = process.env.TAOP_HEALTHCHECK_AGENT;

const DEVNET_BUILD_HASH =
  "4fc831ed93f4c8b84c76b83803abad0490bf59fefedcf5a2cb782b2faf39c01e";
const EXPECTED_BUILD_HASH =
  process.env.TAOP_EXPECTED_BUILD_HASH ??
  (RPC_URL.includes("devnet") ? DEVNET_BUILD_HASH : null);
const EXPECTED_UPGRADE_AUTHORITY =
  process.env.TAOP_EXPECTED_UPGRADE_AUTHORITY ?? null;
const DESCRIPTOR_PATH =
  process.env.TAOP_DESCRIPTOR ??
  path.join(process.cwd(), "apps/web/src/data/deployment.json");

function inferCluster(rpc: string): string | null {
  if (/devnet/.test(rpc)) return "devnet";
  if (/mainnet/.test(rpc)) return "mainnet-beta";
  if (/127\.0\.0\.1|localhost/.test(rpc)) return "localnet";
  return null;
}

/** Size of the `ProgramData` metadata prefix (state, slot, authority). */
const PROGRAMDATA_METADATA_BYTES = 45;

/**
 * Public RPC endpoints rate-limit shared CI IPs; retry transient failures so a
 * scheduled healthcheck only fails for real problems.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const attempts = 4;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = String(error);
      const transient = /429|rate|timeout|fetch failed|ECONN|503|502|500/i.test(
        message,
      );
      if (!transient || attempt === attempts) break;
      console.warn(`${label}: transient failure (attempt ${attempt}/${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

/** `solana-verify`-compatible executable hash over a program data account. */
export function programDataHash(data: Buffer): string {
  const elf = data.subarray(PROGRAMDATA_METADATA_BYTES);
  let end = elf.length;
  while (end > 0 && elf[end - 1] === 0) end -= 1;
  return createHash("sha256").update(elf.subarray(0, end)).digest("hex");
}

/** Upgrade authority stored in the ProgramData metadata, when present. */
function programUpgradeAuthority(data: Buffer): string | null {
  if (data.length < PROGRAMDATA_METADATA_BYTES) return null;
  if (data.readUInt8(12) !== 1) return null;
  return new PublicKey(data.subarray(13, 45)).toBase58();
}

async function main(): Promise<void> {
  const connection = new Connection(RPC_URL, "confirmed");
  const problems: string[] = [];

  const version = await withRetry("rpc", () => connection.getVersion()).catch(
    (error) => {
      problems.push(`rpc unreachable: ${String(error).slice(0, 120)}`);
      return null;
    },
  );

  const client = new TaopSolanaClient({
    connection,
    programId: new PublicKey(PROGRAM_ID),
  });

  const program = await withRetry("program", () =>
    connection.getAccountInfo(client.programId),
  ).catch(() => null);
  if (!program?.executable) {
    problems.push(`program ${PROGRAM_ID} is not deployed or not executable`);
  }

  let buildHash: string | null = null;
  let buildHashMatches: boolean | null = null;
  let upgradeAuthority: string | null = null;

  if (program?.executable) {
    try {
      const [programDataAddress] = PublicKey.findProgramAddressSync(
        [client.programId.toBuffer()],
        BPF_LOADER_UPGRADEABLE_ID,
      );
      const programData = await withRetry("program-data", () =>
        connection.getAccountInfo(programDataAddress),
      );
      if (!programData) {
        problems.push(`program data account ${programDataAddress.toBase58()} missing`);
      } else if (programData.data.length <= PROGRAMDATA_METADATA_BYTES) {
        problems.push("program data account is truncated");
      } else {
        buildHash = programDataHash(programData.data);
        upgradeAuthority = programUpgradeAuthority(programData.data);
      }
    } catch (error) {
      problems.push(`program data unreadable: ${String(error).slice(0, 120)}`);
    }
  }

  if (EXPECTED_BUILD_HASH && buildHash) {
    buildHashMatches = buildHash === EXPECTED_BUILD_HASH;
    if (!buildHashMatches) {
      problems.push(
        `on-chain program hash ${buildHash} != expected ${EXPECTED_BUILD_HASH} (undocumented upgrade?)`,
      );
    }
  }

  if (EXPECTED_UPGRADE_AUTHORITY && upgradeAuthority !== EXPECTED_UPGRADE_AUTHORITY) {
    problems.push(
      `upgrade authority ${upgradeAuthority ?? "none"} != expected ${EXPECTED_UPGRADE_AUTHORITY}`,
    );
  }

  let config: Awaited<ReturnType<TaopSolanaClient["getConfig"]>> | null = null;
  try {
    config = await withRetry("config", () => client.getConfig());
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

  const descriptorDrift: string[] = [];
  const cluster = inferCluster(RPC_URL);
  if (fs.existsSync(DESCRIPTOR_PATH)) {
    try {
      const descriptor = JSON.parse(
        fs.readFileSync(DESCRIPTOR_PATH, "utf8"),
      ) as Record<string, unknown>;
      if (!cluster || descriptor.cluster === cluster) {
        const compare = (label: string, expected: unknown, actual: unknown) => {
          if (
            expected !== undefined &&
            expected !== null &&
            String(expected) !== String(actual)
          ) {
            descriptorDrift.push(
              `${label}: on-chain ${String(actual)} != descriptor ${String(expected)}`,
            );
          }
        };
        compare("programId", descriptor.programId, PROGRAM_ID);
        compare("config", descriptor.config, client.pdas.config.toBase58());
        if (config) {
          compare("certifier", descriptor.certifier, config.certifier.toBase58());
          compare("treasury", descriptor.treasury, config.treasury.toBase58());
          compare(
            "challengeBondLamports",
            descriptor.challengeBondLamports,
            config.challengeBondLamports,
          );
          compare(
            "decayPeriodSecs",
            descriptor.decayPeriodSecs,
            config.decayPeriodSecs,
          );
        }
      }
    } catch (error) {
      descriptorDrift.push(`descriptor unreadable: ${String(error).slice(0, 120)}`);
    }
  }
  problems.push(...descriptorDrift);

  let agentScore: unknown = null;
  if (AGENT) {
    try {
      agentScore = await withRetry("score", () =>
        client.getScore(new PublicKey(AGENT)),
      );
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
        buildHash,
        buildHashExpected: EXPECTED_BUILD_HASH,
        buildHashMatches,
        upgradeAuthority,
        admin: config?.admin.toBase58() ?? null,
        certifier: config?.certifier.toBase58() ?? null,
        paused: config?.paused ?? null,
        challengeBondLamports: config?.challengeBondLamports ?? null,
        decayPeriodSecs: config?.decayPeriodSecs ?? null,
        descriptor: {
          path: fs.existsSync(DESCRIPTOR_PATH) ? DESCRIPTOR_PATH : null,
          drift: descriptorDrift,
        },
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
