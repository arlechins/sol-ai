import { Connection } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { TaopSolanaClient } from "../src/client";

/** Offline client: constructing a Program never touches the RPC. */
function offlineClient() {
  return new TaopSolanaClient({
    connection: new Connection("http://127.0.0.1:1", "confirmed"),
  });
}

/** Hand-encoded `AgentRegistered { agent, authority, metadata_uri }`. */
function encodedEvent(client: TaopSolanaClient): string {
  const discriminator = Buffer.from([191, 78, 217, 54, 232, 100, 189, 85]);
  const key = client.programId.toBuffer();
  const uri = Buffer.from("ipfs://profile", "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(uri.length, 0);
  return Buffer.concat([discriminator, key, key, length, uri]).toString("base64");
}

describe("event decoding scope", () => {
  it("decodes events emitted by the program itself", () => {
    const client = offlineClient();
    const payload = encodedEvent(client);
    const logs = [
      `Program ${client.programId.toBase58()} invoke [1]`,
      "Program log: Instruction: AttestCompletion",
      `Program data: ${payload}`,
      `Program ${client.programId.toBase58()} success`,
    ];
    const events = client.decodeEvents(logs);
    expect(events.map((event) => event.name)).toEqual(["agentRegistered"]);
  });

  it("ignores events emitted by a nested foreign program", () => {
    const client = offlineClient();
    const payload = encodedEvent(client);
    const logs = [
      `Program ${client.programId.toBase58()} invoke [1]`,
      "Program 11111111111111111111111111111111 invoke [2]",
      `Program data: ${payload}`,
      "Program 11111111111111111111111111111111 success",
      `Program ${client.programId.toBase58()} success`,
    ];
    expect(client.decodeEvents(logs)).toEqual([]);
  });

  it("keeps decoding logs without invocation markers", () => {
    const client = offlineClient();
    const payload = encodedEvent(client);
    const events = client.decodeEvents([`Program data: ${payload}`]);
    expect(events.map((event) => event.name)).toEqual(["agentRegistered"]);
  });
});
