import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Connection, Keypair } from "@solana/web3.js";
import { TaopSolanaClient } from "@taopp/solana";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pollOnce, verifySignature, type WebhookEvent } from "../src/dispatcher";

const RPC_URL = process.env.TAOP_RPC_URL ?? "http://127.0.0.1:8899";
const WALLET_PATH =
  process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config/solana/id.json");
const PROGRAM_ID = "8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE";
const SECRET = "integration-secret";

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

suite("webhook dispatcher against a live cluster", () => {
  let server: http.Server;
  let webhookUrl: string;
  const received: Array<{ event: WebhookEvent; signatureHeader?: string; body: string }> = [];

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        received.push({
          event: JSON.parse(body) as WebhookEvent,
          signatureHeader: request.headers["x-taop-signature"] as string | undefined,
          body,
        });
        response.writeHead(200).end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address && typeof address === "object") {
      webhookUrl = `http://127.0.0.1:${address.port}/hooks/taop`;
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("delivers on-chain events with a valid HMAC signature", async () => {
    if (!fs.existsSync(WALLET_PATH)) {
      throw new Error(`Wallet not found at ${WALLET_PATH}; run ./scripts/localnet.sh`);
    }
    const secretKey = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8")) as number[];
    const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const client = new TaopSolanaClient({ connection, wallet });

    await client.attest({
      taskType: "summarization",
      resultUri: "ipfs://webhook-integration",
    });

    const statePath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "taop-webhooks-int-")),
      "state.json",
    );
    const result = await pollOnce(
      {
        connection,
        programId: client.programId,
        webhookUrl,
        secret: SECRET,
        cluster: "localnet",
        statePath,
        maxSignaturesPerPoll: 50,
      },
      { lastSignature: null },
    );

    expect(result.processed).toBeGreaterThan(0);
    const attested = received.find(
      (entry) => entry.event.name.toLowerCase() === "completionattested",
    );
    expect(attested).toBeDefined();
    expect(verifySignature(SECRET, attested!.body, attested!.signatureHeader)).toBe(true);
    expect(attested!.event.programId).toBe(PROGRAM_ID);
  }, 60_000);
});
