import { Connection, Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { TaopSolanaClient, MAX_DECAY_PERIOD_SECS, MAX_URI_LEN } from "../src/index";

/**
 * Input validation runs before any network call, so a dead RPC endpoint is
 * fine here.
 */
const connection = new Connection("http://127.0.0.1:1", "confirmed");
const wallet = Keypair.generate();
const client = new TaopSolanaClient({ connection, wallet });

describe("client-side validation", () => {
  it("rejects oversized URIs before signing", async () => {
    await expect(
      client.attest({ taskType: "summarization", resultUri: "x".repeat(MAX_URI_LEN + 1) }),
    ).rejects.toMatchObject({ code: "UriTooLong" });

    await expect(
      client.registerCapability({
        capabilityType: "LoRA",
        metadataUri: "x".repeat(MAX_URI_LEN + 1),
        bondLamports: 5_000_000,
      }),
    ).rejects.toMatchObject({ code: "UriTooLong" });

    await expect(
      client.registerAgent("x".repeat(MAX_URI_LEN + 1)),
    ).rejects.toMatchObject({ code: "UriTooLong" });
  });

  it("accepts URIs at the limit", async () => {
    // A full-length URI must not be rejected by validation (it fails later at
    // the RPC layer, which is not what this test asserts).
    await expect(
      client.attest({ taskType: "summarization", resultUri: "x".repeat(MAX_URI_LEN) }),
    ).rejects.not.toMatchObject({ code: "UriTooLong" });
  });

  it("rejects decay periods above the on-chain cap", async () => {
    await expect(
      client.updateConfig({ decayPeriodSecs: MAX_DECAY_PERIOD_SECS + 1 }),
    ).rejects.toMatchObject({ code: "DecayPeriodTooLong" });

    await expect(
      client.initializeConfig({
        certifier: wallet.publicKey,
        treasury: wallet.publicKey,
        challengeBondLamports: 5_000_000,
        decayPeriodSecs: MAX_DECAY_PERIOD_SECS + 1,
      }),
    ).rejects.toMatchObject({ code: "DecayPeriodTooLong" });
  });

  it("requires a wallet for writes", async () => {
    const readOnly = new TaopSolanaClient({ connection });
    await expect(
      readOnly.attest({ taskType: "summarization", resultUri: "ipfs://x" }),
    ).rejects.toMatchObject({ code: "WalletRequired" });
  });
});
