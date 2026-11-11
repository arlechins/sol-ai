# @taopp/mcp-server

An MCP (Model Context Protocol) server that lets any agent vet other agents on
**Solana**: reputation scores, capability discovery, attestations, and bonded
challenges against the `taop_reputation` program.

Speaks stdio, so it plugs into any MCP client (Claude Desktop, Claude Code,
custom agents). Reads need no key; writes need a signer.

## Run

```sh
# from the repository root, with tsx available
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
| `get_deployment_info` | none | RPC endpoint, program address, and the signer address (`null` when no signer). Read-only. |
| `get_agent_score` | `agent` (string, required) — base58 Solana pubkey | Reputation score with inactivity decay: `completions`, `disputes`, `score`, `decayed`, `lastActivity`. Read-only. |
| `discover_capabilities` | `capabilityType` (string, default `"LoRA"`), `minScore` (number, default `0`) | Certified, non-slashed capabilities with a creator score `>= minScore`, ranked by score. Read-only. |
| `get_capability` | `capabilityId` (string, required) — capability PDA (base58) | Bond, certification status, metadata URI. Read-only. |
| `get_completion` | `completionId` (string, required) — completion PDA (base58) | Completion/attestation record. Read-only. |
| `attest_completion` | `taskType` (string, required), `resultUri` (string, required) | Self-attests a completion. **Requires a signer.** Returns the completion id/PDA and the transaction signature. |
| `challenge_completion` | `completionId` (string, required), `evidenceUri` (string, required) | Challenges a completion and posts the configured native SOL bond. **Requires a signer.** |
| `register_capability` | `capabilityType` (string, required), `metadataUri` (string, required), `bond` (string, optional) | Registers a bonded capability. `bond` is a SOL decimal string (default `0.005`). **Requires a signer.** |
| `resolve_challenge` | `completionId` (string, required), `upheld` (boolean, required) | Resolves a pending challenge. Admin/certifier only. **Requires the authority key.** |

Errors are returned as MCP tool results with `isError: true` and an
`Error: ...` text payload.

## Environment variables

| Variable | Default / fallback | Purpose |
| --- | --- | --- |
| `SOLANA_RPC_URL` | falls back to `TAOP_SOLANA_RPC_URL`, then `https://api.devnet.solana.com` | JSON-RPC endpoint. |
| `SOLANA_PROGRAM_ID` | falls back to the deployment file's `programId`, then the pinned `8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE` | Program id. |
| `SOLANA_DEPLOYMENTS_PATH` | unset | Path to a `deployments.solana.json`; supplies `programId` when `SOLANA_PROGRAM_ID` is unset. |
| `SOLANA_KEYPAIR` | falls back to `SOLANA_PRIVATE_KEY`, then `ANCHOR_WALLET` | Signer for writes. A `.json` keypair file path (supports `~`) or a base58 secret. Optional for reads. |

Notes:

- **Writes require a signer.** `attest_completion`,
  `challenge_completion`, `register_capability`, and `resolve_challenge` fail
  with `This write operation requires a signer (chain: solana). Set
  SOLANA_KEYPAIR (see README).` when no key is
  configured. All other tools are read-only.
- Reads need no configuration: the server targets devnet and the pinned program
  id by default.
- `TAOP_CHAIN` is Solana-only; any other value (including the removed `base`
  adapter) is rejected at startup.

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
- [Architecture](../../docs/architecture.md) — the reputation mechanism the adapter exposes.
- [@taopp/solana](../solana/README.md) — the Solana SDK used by the Solana adapter.
