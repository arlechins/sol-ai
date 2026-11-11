#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";

import { SolanaAdapter } from "./adapters/solana";
import type { ChainAdapter } from "./adapters/types";
import {
  optionalDecimalString,
  optionalNumber,
  requireBoolean,
  requireString,
  requireUri,
  resolveChain,
} from "./validation";

dotenv.config();

const CHAIN = resolveChain(process.env.TAOP_CHAIN);

let adapter: ChainAdapter | undefined;

/** Lazily construct the adapter so `tools/list` works without configuration. */
function getAdapter(): ChainAdapter {
  if (!adapter) {
    adapter = new SolanaAdapter();
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
          "Get an agent's reputation score (completions - disputes, with inactivity decay) from its Solana base58 address.",
        inputSchema: {
          type: "object",
          properties: {
            agent: {
              type: "string",
              description: "Agent address (base58 Solana pubkey)",
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
                "Capability PDA (base58 Solana address)",
            },
          },
          required: ["capabilityId"],
        },
      },
      {
        name: "get_completion",
        description:
          "Get a completion/attestation record by its PDA (base58 Solana address).",
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
          "Challenge a completion with evidence, posting the native SOL bond. Requires a signer key.",
        inputSchema: {
          type: "object",
          properties: {
            completionId: {
              type: "string",
              description: "Completion PDA to challenge",
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
          "Register a capability with a slashable SOL bond. Requires a signer key.",
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
                "Bond amount in SOL as a decimal string (default 0.005).",
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
        const agent = requireString(
          { agent: toolArgs.agent ?? toolArgs.agentAddress },
          "agent",
          "get_agent_score",
        );
        return text(await chain.getAgentScore(agent));
      }

      case "discover_capabilities": {
        const capabilityType = requireString(
          { capabilityType: toolArgs.capabilityType ?? "LoRA" },
          "capabilityType",
          "discover_capabilities",
        );
        const minScore = optionalNumber(
          toolArgs,
          "minScore",
          "discover_capabilities",
        );
        const results = await chain.discoverCapabilities({
          capabilityType,
          minScore,
        });
        return text(results);
      }

      case "get_capability":
        return text(
          await chain.getCapability(
            requireString(toolArgs, "capabilityId", "get_capability"),
          ),
        );

      case "get_completion":
        return text(
          await chain.getCompletion(
            requireString(toolArgs, "completionId", "get_completion"),
          ),
        );

      case "attest_completion":
        return text(
          await chain.attestCompletion({
            taskType: requireString(toolArgs, "taskType", "attest_completion"),
            resultUri: requireUri(toolArgs, "resultUri", "attest_completion"),
          }),
        );

      case "challenge_completion":
        return text(
          await chain.challengeCompletion({
            completion: requireString(
              toolArgs,
              "completionId",
              "challenge_completion",
            ),
            evidenceUri: requireUri(
              toolArgs,
              "evidenceUri",
              "challenge_completion",
            ),
          }),
        );

      case "register_capability":
        return text(
          await chain.registerCapability({
            capabilityType: requireString(
              toolArgs,
              "capabilityType",
              "register_capability",
            ),
            metadataUri: requireUri(
              toolArgs,
              "metadataUri",
              "register_capability",
            ),
            bond: optionalDecimalString(
              toolArgs,
              "bond",
              "register_capability",
            ),
          }),
        );

      case "resolve_challenge":
        return text(
          await chain.resolveChallenge({
            completion: requireString(
              toolArgs,
              "completionId",
              "resolve_challenge",
            ),
            upheld: requireBoolean(toolArgs, "upheld", "resolve_challenge"),
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
