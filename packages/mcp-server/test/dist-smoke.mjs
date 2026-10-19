/**
 * Built-artifact smoke: runs the compiled MCP server over stdio and exercises
 * a read tool plus the validation path. The vitest suite runs the TypeScript
 * source, so this is what catches packaging/interop regressions in the shipped
 * bundle (see the Node 20/22 Anchor BN incident). Both the ESM build and the
 * CJS build behind the published `bin` are exercised.
 *
 *   node packages/mcp-server/test/dist-smoke.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ENTRIES = ["../dist/index.js", "../dist/index.cjs"];

const REQUIRED_TOOLS = [
  "get_agent_score",
  "discover_capabilities",
  "attest_completion",
  "challenge_completion",
  "register_capability",
  "resolve_challenge",
];

async function smoke(entry) {
  const client = new Client({ name: "dist-smoke", version: "0.0.1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    env: { ...process.env, TAOP_CHAIN: "solana" },
  });

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    for (const required of REQUIRED_TOOLS) {
      if (!names.includes(required)) {
        throw new Error(`missing tool in ${entry}: ${required}`);
      }
    }

    const info = await client.callTool({
      name: "get_deployment_info",
      arguments: {},
    });
    if (info.isError) {
      throw new Error(`get_deployment_info failed in ${entry}: ${info.content[0].text}`);
    }
    const payload = JSON.parse(info.content[0].text);
    if (payload.chain !== "solana") {
      throw new Error(`unexpected chain in ${entry}: ${payload.chain}`);
    }

    const bad = await client.callTool({
      name: "resolve_challenge",
      arguments: { completionId: "x", upheld: "maybe" },
    });
    if (!bad.isError || !String(bad.content[0].text).includes("must be a boolean")) {
      throw new Error(`boolean validation is not enforced in ${entry}`);
    }
  } finally {
    await client.close().catch(() => {});
  }
}

for (const relative of ENTRIES) {
  await smoke(path.resolve(here, relative));
}
console.log("mcp dist smoke ok (esm + cjs)");
