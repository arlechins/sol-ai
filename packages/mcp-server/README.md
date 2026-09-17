# @taopp/mcp-server

An MCP (Model Context Protocol) server that lets any agent vet other agents:
reputation scores, capability discovery, attestations, and bonded challenges on
**Solana** (`taop_reputation`) and **Base** (the original TAOP contracts).

Speaks stdio, so it plugs into any MCP client (Claude Desktop, Claude Code,
custom agents). Reads need no key; writes need a signer.

## Run

```sh
# from the repository root, with tsx available
TAOP_CHAIN=solana \
SOLANA_RPC_URL=http://127.0.0.1:8899 \
SOLANA_KEYPAIR=~/.config/solana/id.json \
npx tsx packages/mcp-server/src/index.ts
```

```sh
# or via the package scripts
pnpm --filter @taopp/mcp-server dev      # tsx src/index.ts
pnpm --filter @taopp/mcp-server build    # bundles to dist/
pnpm --filter @taopp/mcp-server test
```

`tools/list` works without any configuration; chain adapters are created
lazily on the first tool call.

## Tools

| Tool | Arguments | Notes |
| --- | --- | --- |
| `get_deployment_info` | none | Active chain, RPC endpoint, program/contract addresses, and the signer address (`null` when no signer). Read-only. |
| `get_agent_score` | `agent` (string, required) — base58 on Solana, `0x`-hex on Base | Reputation score with inactivity decay: `completions`, `disputes`, `score`, and (Solana) `decayed` / `lastActivity`. Read-only. |
| `discover_capabilities` | `capabilityType` (string, default `"LoRA"`), `minScore` (number, default `0`) | Certified, non-slashed capabilities with a creator score `>= minScore`, ranked by score. Read-only. |
| `get_capability` | `capabilityId` (string, required) — PDA (base58) on Solana, token id on Base | Bond, certification status, metadata URI. Read-only. |
| `get_completion` | `completionId` (string, required) — PDA on Solana, numeric id on Base | Completion/attestation record. Read-only. |
| `attest_completion` | `taskType` (string, required), `resultUri` (string, required) | Self-attests a completion. **Requires a signer.** Returns the completion id/PDA and the transaction signature. |
| `challenge_completion` | `completionId` (string, required), `evidenceUri` (string, required) | Challenges a completion and posts the configured native bond (SOL on Solana, ETH on Base). **Requires a signer.** |
| `register_capability` | `capabilityType` (string, required), `metadataUri` (string, required), `bond` (string, optional) | Registers a bonded capability. `bond` is a decimal string; defaults: `0.005` SOL on Solana, `0.01` ETH on Base. **Requires a signer.** |
| `resolve_challenge` | `completionId` (string, required), `upheld` (boolean, required) | Resolves a pending challenge. Admin/certifier only. **Requires the authority key.** |

Errors are returned as MCP tool results with `isError: true` and an
`Error: ...` text payload.

## Environment variables

| Variable | Chain | Default / fallback | Purpose |
| --- | --- | --- | --- |
| `TAOP_CHAIN` | both | `solana` | Adapter selection: `solana` or `base`. |
| `SOLANA_RPC_URL` | Solana | falls back to `TAOP_SOLANA_RPC_URL`, then `https://api.devnet.solana.com` | JSON-RPC endpoint. |
| `SOLANA_PROGRAM_ID` | Solana | falls back to the deployment file's `programId`, then the pinned `8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE` | Program id. |
| `SOLANA_DEPLOYMENTS_PATH` | Solana | unset | Path to a `deployments.solana.json`; supplies `programId` when `SOLANA_PROGRAM_ID` is unset. |
| `SOLANA_KEYPAIR` | Solana | falls back to `SOLANA_PRIVATE_KEY`, then `ANCHOR_WALLET` | Signer for writes. A `.json` keypair file path (supports `~`) or a base58 secret. Optional for reads. |
| `BASE_RPC_URL` | Base | falls back to `RPC_URL`, then `https://sepolia.base.org` | JSON-RPC endpoint. |
| `DEPLOYMENTS_PATH` | Base | `./deployments.json` | Deployment file with `chainId`, `ron`, and `registry` addresses. Required by the Base adapter. |
| `PRIVATE_KEY` | Base | falls back to `BASE_PRIVATE_KEY`, then `DEPLOYER_PK` | Signer for writes. Optional for reads. |

Notes:

- **Writes require a signer.** `attest_completion`,
  `challenge_completion`, `register_capability`, and `resolve_challenge` fail
  with `This write operation requires a signer (chain: solana). Set
  SOLANA_KEYPAIR (see README).` (or `Set PRIVATE_KEY` on Base) when no key is
  configured. All other tools are read-only.
- The Solana adapter needs no configuration for reads: it targets devnet and
  the pinned program id by default.
- The Base adapter always needs `DEPLOYMENTS_PATH` (or `deployments.json` in
  the working directory) and uses `@taopp/sdk`.

## Claude Desktop configuration

Add to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "taop-reputation": {
      "command": "npx",
      "args": [
        "tsx",
        "/absolute/path/to/taop-solana/packages/mcp-server/src/index.ts"
      ],
      "env": {
        "TAOP_CHAIN": "solana",
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "SOLANA_KEYPAIR": "/Users/you/.config/solana/id.json"
      }
    }
  }
}
```

For the deployed build, point `command` at `node` and `args` at
`/absolute/path/to/packages/mcp-server/dist/index.cjs`. Omit `SOLANA_KEYPAIR`
to run read-only.

## Related

- [Tutorial](../../docs/tutorial.md) — MCP walkthrough and localnet setup.
- [Architecture](../../docs/architecture.md) — the reputation mechanism both adapters expose.
- [@taopp/solana](../solana/README.md) — the Solana SDK used by the Solana adapter.
