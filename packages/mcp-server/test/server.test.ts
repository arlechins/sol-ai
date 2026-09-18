import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(here, "../src/index.ts");

describe("MCP server (stdio smoke test)", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ name: "test-client", version: "0.0.1" });
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", serverEntry],
      env: {
        ...process.env,
        TAOP_CHAIN: "solana",
        SOLANA_PROGRAM_ID: "8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE",
      },
    });
    await client.connect(transport);
  }, 60_000);

  afterAll(async () => {
    await client?.close();
  });

  it("lists the reputation tools", async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    expect(names).toContain("get_agent_score");
    expect(names).toContain("discover_capabilities");
    expect(names).toContain("attest_completion");
    expect(names).toContain("challenge_completion");
    expect(names).toContain("register_capability");
    expect(names).toContain("resolve_challenge");
  });

  it("returns Solana deployment info without a signer", async () => {
    const result = await client.callTool({
      name: "get_deployment_info",
      arguments: {},
    });
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);
    expect(payload.chain).toBe("solana");
    expect(payload.programId).toBe(
      "8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE",
    );
    expect(payload.wallet).toBeNull();
  });

  it("rejects invalid addresses with a field-specific error", async () => {
    const result = await client.callTool({
      name: "get_agent_score",
      arguments: { agent: "not-a-pubkey" },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("not a base58 Solana address");
  });

  it("refuses writes without a signer", async () => {
    const result = await client.callTool({
      name: "attest_completion",
      arguments: { taskType: "summarization", resultUri: "ipfs://x" },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("requires a signer");
  });

  it("rejects a non-boolean resolution instead of truthy-coercing it", async () => {
    const result = await client.callTool({
      name: "resolve_challenge",
      arguments: { completionId: "whatever", upheld: "maybe" },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("must be a boolean");
  });

  it("rejects malformed bond strings before touching the chain", async () => {
    const result = await client.callTool({
      name: "register_capability",
      arguments: {
        capabilityType: "LoRA",
        metadataUri: "ipfs://cap",
        bond: "0.005 SOL",
      },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("decimal amount");
  });

  it("refuses to start with an unknown TAOP_CHAIN", async () => {
    const badClient = new Client({ name: "bad-client", version: "0.0.1" });
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", serverEntry],
      env: { ...process.env, TAOP_CHAIN: "base-sepolia" },
    });
    await expect(badClient.connect(transport)).rejects.toThrow();
  }, 60_000);
});
