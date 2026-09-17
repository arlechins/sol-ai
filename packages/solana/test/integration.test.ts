import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";

import { TaopSolanaClient } from "../src/index";

/**
 * End-to-end SDK test against a local validator with the program deployed.
 * Run `./scripts/localnet.sh` first. Set TAOP_RPC_URL to point elsewhere.
 */
const RPC_URL = process.env.TAOP_RPC_URL ?? "http://127.0.0.1:8899";
const WALLET_PATH =
  process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config/solana/id.json");
const BOND = 5_000_000;
const DECAY_PERIOD = 30 * 24 * 60 * 60;

const connection = new Connection(RPC_URL, "confirmed");

async function chainAvailable(): Promise<boolean> {
  try {
    await connection.getVersion();
    return true;
  } catch {
    return false;
  }
}

const available = await chainAvailable();
const suite = available ? describe.sequential : describe.skip;

function loadWallet(): Keypair {
  if (!fs.existsSync(WALLET_PATH)) {
    throw new Error(
      `Wallet not found at ${WALLET_PATH}. Run ./scripts/localnet.sh first or set ANCHOR_WALLET.`,
    );
  }
  const secret = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

suite("TaopSolanaClient against a live cluster", () => {
  // `describe.skip` still runs this callback at collection time, so only touch
  // the wallet file when a cluster is actually reachable.
  const admin = available ? loadWallet() : Keypair.generate();
  const agentA = Keypair.generate();
  const agentB = Keypair.generate();
  let client: TaopSolanaClient;
  let config: Awaited<ReturnType<TaopSolanaClient["getConfig"]>>;
  let completion: PublicKey;

  beforeAll(async () => {
    const balance = await connection.getBalance(admin.publicKey);
    if (balance < 10 * LAMPORTS_PER_SOL) {
      const sig = await connection.requestAirdrop(
        admin.publicKey,
        100 * LAMPORTS_PER_SOL,
      );
      await connection.confirmTransaction(sig, "confirmed");
    }
    for (const keypair of [agentA, agentB]) {
      const sig = await connection.requestAirdrop(
        keypair.publicKey,
        5 * LAMPORTS_PER_SOL,
      );
      await connection.confirmTransaction(sig, "confirmed");
    }

    client = new TaopSolanaClient({ connection, wallet: admin });
    const existing = await connection.getAccountInfo(client.pdas.config);
    if (!existing) {
      await client.initializeConfig({
        certifier: admin.publicKey,
        treasury: admin.publicKey,
        challengeBondLamports: BOND,
        decayPeriodSecs: DECAY_PERIOD,
      });
    }
    config = await client.getConfig();
  });

  it("exposes the initialized config", () => {
    expect(config.admin.equals(admin.publicKey)).toBe(true);
    expect(config.challengeBondLamports).toBe(BOND);
    expect(config.decayPeriodSecs).toBe(DECAY_PERIOD);
    expect(config.paused).toBe(false);
  });

  it("registers an agent and attests a completion", async () => {
    const agentClient = new TaopSolanaClient({ connection, wallet: agentA });
    await agentClient.registerAgent("ipfs://agent-a");

    const result = await agentClient.attest({
      taskType: "summarization",
      resultUri: "ipfs://result-0",
    });
    completion = result.completion;
    expect(result.completionId).toBeGreaterThan(0);

    const record = await agentClient.getCompletion(completion);
    expect(record?.agent.equals(agentA.publicKey)).toBe(true);
    expect(record?.resultUri).toBe("ipfs://result-0");
    expect(record?.challenged).toBe(false);
  });

  it("computes the same score locally and on-chain", async () => {
    const local = await client.getScore(agentA.publicKey);
    expect(local.completions).toBeGreaterThanOrEqual(1);
    expect(local.score).toBe(local.completions - local.disputes);

    const onChain = await client.getScoreOnChain(agentA.publicKey);
    expect(onChain).toEqual(local);
  });

  it("challenges a completion with a native SOL bond", async () => {
    const challenger = new TaopSolanaClient({ connection, wallet: agentB });
    await challenger.challenge({ completion, evidenceUri: "ipfs://fraud" });

    const challenge = await challenger.getChallenge(completion);
    expect(challenge?.challenger.equals(agentB.publicKey)).toBe(true);
    expect(challenge?.bondLamports).toBe(BOND);

    const vaultBalance = await connection.getBalance(
      challenger.pdas.challengeVault(completion),
    );
    expect(vaultBalance).toBe(BOND);
  });

  it("resolves an upheld challenge and drops the score", async () => {
    const before = await client.getScore(agentA.publicKey);
    await client.resolveChallenge({ completion, upheld: true });
    const after = await client.getScore(agentA.publicKey);

    expect(after.disputes).toBe(before.disputes + 1);
    expect(after.score).toBe(Math.max(0, before.score - 1));

    const onChain = await client.getScoreOnChain(agentA.publicKey);
    expect(onChain.disputes).toBe(after.disputes);
  });

  it("registers, certifies, discovers, slashes, and withdraws a capability", async () => {
    const agentClient = new TaopSolanaClient({ connection, wallet: agentA });
    const { capability } = await agentClient.registerCapability({
      capabilityType: "LoRA",
      metadataUri: "ipfs://cap-card",
      bondLamports: BOND,
    });

    await client.certifyCapability(capability);

    const discovered = await agentClient.discover({ capabilityType: "LoRA" });
    const hit = discovered.find((item) => item.capability === capability.toBase58());
    expect(hit).toBeDefined();
    expect(hit?.certified).toBe(true);
    expect(hit?.agent).toBe(agentA.publicKey.toBase58());
    expect(hit?.bondLamports).toBe(BOND);

    await client.slashCapability(capability, 2_000_000);
    const slashed = await agentClient.getCapability(capability);
    expect(slashed?.bondRemaining).toBe(BOND - 2_000_000);
    expect(slashed?.slashed).toBe(true);

    await agentClient.withdrawCapabilityBond(capability);
    expect(await agentClient.getCapability(capability)).toBeNull();
  });

  it("requires a wallet for on-chain score reads", async () => {
    const readOnly = new TaopSolanaClient({ connection });
    await expect(
      readOnly.getScoreOnChain(agentA.publicKey),
    ).rejects.toMatchObject({ code: "WalletRequired" });

    // Read-only clients compute the same decayed score locally.
    const local = await readOnly.getScore(agentA.publicKey);
    expect(local.lastActivity).toBeGreaterThan(0);
    expect(local.completions).toBeGreaterThanOrEqual(1);
  });

  it("rejects cancelling a challenge before the timeout", async () => {
    const freshAgent = Keypair.generate();
    const airdrop = await connection.requestAirdrop(
      freshAgent.publicKey,
      5 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(airdrop, "confirmed");
    const freshClient = new TaopSolanaClient({ connection, wallet: freshAgent });
    const { completion: pendingCompletion } = await freshClient.attest({
      taskType: "summarization",
      resultUri: "ipfs://timeout-path",
    });

    const challenger = new TaopSolanaClient({ connection, wallet: agentB });
    await challenger.challenge({
      completion: pendingCompletion,
      evidenceUri: "ipfs://ev",
    });

    expect(await challenger.challengeTimedOut(pendingCompletion)).toBe(false);
    await expect(
      challenger.cancelChallenge(pendingCompletion),
    ).rejects.toMatchObject({ code: "ChallengeNotTimedOut" });
  });

  it("decodes program events from a transaction", async () => {
    const agentClient = new TaopSolanaClient({ connection, wallet: agentA });
    const result = await agentClient.attest({
      taskType: "summarization",
      resultUri: "ipfs://events",
    });

    // The validator may need a moment before the transaction is queryable.
    let events: Awaited<ReturnType<TaopSolanaClient["eventsForTransaction"]>> = [];
    for (let attempt = 0; attempt < 5 && events.length === 0; attempt += 1) {
      events = await agentClient.eventsForTransaction(result.signature);
      if (events.length === 0) await new Promise((r) => setTimeout(r, 500));
    }

    const attested = events.find((event) => /completionAttested/i.test(event.name));
    expect(attested).toBeDefined();
    const data = attested?.data as Record<string, unknown> | undefined;
    expect(data?.completionId?.toString()).toBe(String(result.completionId));
    expect(data?.resultUri).toBe("ipfs://events");
  });

  it("fails fast with InsufficientBalance for unfunded writes", async () => {
    const broke = Keypair.generate(); // never funded
    const brokeClient = new TaopSolanaClient({ connection, wallet: broke });

    await expect(
      brokeClient.attest({ taskType: "summarization", resultUri: "ipfs://x" }),
    ).rejects.toMatchObject({ code: "InsufficientBalance" });

    await expect(
      brokeClient.registerCapability({
        capabilityType: "LoRA",
        metadataUri: "ipfs://x",
        bondLamports: 5_000_000,
      }),
    ).rejects.toMatchObject({ code: "InsufficientBalance" });
  });

  it("surfaces typed program errors for invalid operations", async () => {
    const failureAgent = Keypair.generate();
    const airdrop = await connection.requestAirdrop(
      failureAgent.publicKey,
      5 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(airdrop, "confirmed");
    const failureClient = new TaopSolanaClient({
      connection,
      wallet: failureAgent,
    });

    const { completion: freshCompletion } = await failureClient.attest({
      taskType: "summarization",
      resultUri: "ipfs://failure-path",
    });

    await expect(
      failureClient.attest({
        taskType: "summarization",
        resultUri: "ipfs://wrong-seq",
        seq: 999,
      }),
    ).rejects.toMatchObject({ code: "InvalidCompletionSeq" });

    const challenger = new TaopSolanaClient({ connection, wallet: agentB });
    await challenger.challenge({
      completion: freshCompletion,
      evidenceUri: "ipfs://ev",
    });
    await expect(
      challenger.challenge({
        completion: freshCompletion,
        evidenceUri: "ipfs://ev-again",
      }),
    ).rejects.toMatchObject({ code: "AlreadyChallenged" });

    await expect(
      failureClient.resolveChallenge({ completion: freshCompletion, upheld: true }),
    ).rejects.toMatchObject({ code: "Unauthorized" });

    const { capability } = await failureClient.registerCapability({
      capabilityType: "LoRA",
      metadataUri: "ipfs://cap-failure",
      bondLamports: BOND,
    });
    await client.slashCapability(capability, BOND);
    await expect(
      failureClient.withdrawCapabilityBond(capability),
    ).rejects.toMatchObject({ code: "BondStillSlashed" });
  });
});
