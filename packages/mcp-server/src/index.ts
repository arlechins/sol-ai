#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";

import { BaseAdapter } from "./adapters/base";
import { SolanaAdapter } from "./adapters/solana";
import type { ChainAdapter, ChainName } from "./adapters/types";

dotenv.config();

const CHAIN = (process.env.TAOP_CHAIN ?? "solana").toLowerCase() as ChainName;

let adapter: ChainAdapter | undefined;

/** Lazily construct the adapter so `tools/list` works without configuration. */
function getAdapter(): ChainAdapter {
  if (!adapter) {
    adapter = CHAIN === "base" ? new BaseAdapter() : new SolanaAdapter();
  }
  return adapter;
}

const server = new Server(
  {
    name: "taopp-agent-reputation",
    version: "0.2.0",
  },
  {
    capabilities: { tools: {} },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_deployment_info",
        description:
          "Get the active chain, RPC endpoint, program/contract addresses, and signer.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_agent_score",
        description:
          "Get an agent's reputation score (completions - disputes, with inactivity decay). Accepts a Solana base58 address or an EVM 0x address depending on TAOP_CHAIN.",
        inputSchema: {
          type: "object",
          properties: {
            agent: {
              type: "string",
              description: "Agent address (base58 on Solana, 0x-hex on Base)",
            },
          },
          required: ["agent"],
        },
      },
      {
        name: "discover_capabilities",
        description:
          "Discover certified capabilities with a minimum creator score, ranked by score. Use this to vet another agent mid-run.",
        inputSchema: {
          type: "object",
          properties: {
            capabilityType: {
              type: "string",
              description: "Capability type, e.g. 'LoRA' (default)",
              default: "LoRA",
            },
            minScore: {
              type: "number",
              description: "Minimum reputation score required",
              default: 0,
            },
          },
        },
      },
      {
        name: "get_capability",
        description:
          "Get a capability record (bond, certification status, metadata URI).",
        inputSchema: {
          type: "object",
          properties: {
            capabilityId: {
              type: "string",
              description:
                "Capability identifier: PDA (base58) on Solana or token id on Base",
            },
          },
          required: ["capabilityId"],
        },
      },
      {
        name: "get_completion",
        description:
          "Get a completion/attestation record by id (PDA on Solana, numeric id on Base).",
        inputSchema: {
          type: "object",
          properties: {
            completionId: { type: "string", description: "Completion identifier" },
          },
          required: ["completionId"],
        },
      },
      {
        name: "attest_completion",
        description:
          "Self-attest a completed task (requires a signer key). Returns the completion id / PDA and the transaction signature.",
        inputSchema: {
          type: "object",
          properties: {
            taskType: {
              type: "string",
              description: "Task type string, e.g. 'summarization'",
            },
            resultUri: {
              type: "string",
              description: "URI of the result/evidence bundle",
            },
          },
          required: ["taskType", "resultUri"],
        },
      },
      {
        name: "challenge_completion",
        description:
          "Challenge a completion with evidence, posting the native bond (SOL on Solana, ETH on Base). Requires a signer key.",
        inputSchema: {
          type: "object",
          properties: {
            completionId: {
              type: "string",
              description: "Completion identifier to challenge",
            },
            evidenceUri: {
              type: "string",
              description: "URI of the fraud evidence",
            },
          },
          required: ["completionId", "evidenceUri"],
        },
      },
      {
        name: "register_capability",
        description:
          "Register a capability with a slashable bond (SOL on Solana, ETH on Base). Requires a signer key.",
        inputSchema: {
          type: "object",
          properties: {
            capabilityType: { type: "string", description: "Type, e.g. 'LoRA'" },
            metadataUri: {
              type: "string",
              description: "URI of the capability metadata / card",
            },
            bond: {
              type: "string",
              description:
                "Bond amount as a decimal string (SOL on Solana, ETH on Base). Defaults: 0.005 SOL / 0.01 ETH.",
            },
          },
          required: ["capabilityType", "metadataUri"],
        },
      },
      {
        name: "resolve_challenge",
        description:
          "Resolve a pending challenge (admin/certifier only, requires the authority key).",
        inputSchema: {
          type: "object",
          properties: {
            completionId: { type: "string", description: "Completion identifier" },
            upheld: {
              type: "boolean",
              description: "True if the challenge is valid (fraud proven)",
            },
          },
          required: ["completionId", "upheld"],
        },
      },
    ],
  };
});

type ToolArgs = Record<string, unknown>;

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const toolArgs = (args ?? {}) as ToolArgs;

  try {
    const chain = getAdapter();

    switch (name) {
      case "get_deployment_info":
        return text(await chain.deploymentInfo());

      case "get_agent_score": {
        const agent = (toolArgs.agent ?? toolArgs.agentAddress) as string;
        if (!agent) throw new Error("agent is required");
        return text(await chain.getAgentScore(agent));
      }

      case "discover_capabilities": {
        const capabilityType =
          (toolArgs.capabilityType as string) || "LoRA";
        const minScore = Number(toolArgs.minScore ?? 0);
        const results = await chain.discoverCapabilities({
          capabilityType,
          minScore,
        });
        return text(results);
      }

      case "get_capability": {
        const id = String(toolArgs.capabilityId);
        return text(await chain.getCapability(id));
      }

      case "get_completion": {
        const id = String(toolArgs.completionId);
        return text(await chain.getCompletion(id));
      }

      case "attest_completion":
        return text(
          await chain.attestCompletion({
            taskType: String(toolArgs.taskType),
            resultUri: String(toolArgs.resultUri),
          }),
        );

      case "challenge_completion":
        return text(
          await chain.challengeCompletion({
            completion: String(toolArgs.completionId),
            evidenceUri: String(toolArgs.evidenceUri),
          }),
        );

      case "register_capability":
        return text(
          await chain.registerCapability({
            capabilityType: String(toolArgs.capabilityType),
            metadataUri: String(toolArgs.metadataUri),
            bond: toolArgs.bond ? String(toolArgs.bond) : "",
          }),
        );

      case "resolve_challenge":
        return text(
          await chain.resolveChallenge({
            completion: String(toolArgs.completionId),
            upheld: Boolean(toolArgs.upheld),
          }),
        );

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

function text(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`TAOP MCP server running on stdio (chain=${CHAIN})`);
  console.error(
    "Tools: get_agent_score, discover_capabilities, attest_completion, challenge_completion, ...",
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
