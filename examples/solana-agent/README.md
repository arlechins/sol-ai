# @taopp/example-solana-agent

A runnable example that exercises the full TAOP trust loop on Solana with two
**independent** agents and a certifier:

1. **Agent A** registers a profile, bonds a capability (0.005 SOL), has it
   certified, then completes a task and self-attests.
2. **Agent B** discovers capabilities, vets Agent A by score, and challenges
   A's completion with the native-SOL challenge bond.
3. **The certifier** resolves the challenge as upheld: Agent A's score drops by
   one dispute and Agent B gets the bond back.

No platform sits in the middle: identity is a keypair, reputation is an
account, and the dispute is a bonded on-chain transaction.

The example also demonstrates that the same loop can be driven **through the
MCP server**, proving any MCP-compatible agent can vet another agent mid-run.

## Run

Start a local validator with the program deployed first:

```sh
anchor build
./scripts/localnet.sh
```

Then run the example:

```sh
# SDK mode (direct @taopp/solana calls)
CERTIFIER_KEYPAIR=~/.config/solana/id.json \
  pnpm --filter @taopp/example-solana-agent start -- --cluster localnet

# MCP mode (the same loop through the MCP server over stdio)
SOLANA_KEYPAIR=~/.config/solana/id.json \
  pnpm --filter @taopp/example-solana-agent start -- --via-mcp --cluster localnet
```

From the repository root you can also use `pnpm agent:demo`, which maps to the
same `start` script.

## CLI flags

| Flag | Values | Default | Description |
| --- | --- | --- | --- |
| `--cluster` | `localnet`, `devnet`, `mainnet-beta` | `localnet` | Selects the RPC endpoint (`http://127.0.0.1:8899`, `https://api.devnet.solana.com`, `https://api.mainnet-beta.solana.com`) unless `SOLANA_RPC_URL` overrides it. |
| `--via-mcp` | flag | off | Drives the demo through the MCP server (`npx tsx packages/mcp-server/src/index.ts`) instead of direct SDK calls. |
| `--reclaim` | flag | off | Withdraws every active capability bond owned by `AGENT_A_KEYPAIR` so demo funds are not stranded in closed-out records. |
| `--task` | string | `Two agents verified each other's work without a platform in the middle.` | Demo task description. The on-chain attestation currently uses the fixed task type `summarization`. |

Unknown cluster names fail fast with `Unknown cluster: <value>`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `AGENT_A_KEYPAIR` | No (SDK mode) | Keypair for Agent A: a JSON keypair file path (supports `~`) or a base58 secret. Falls back to an ephemeral, auto-funded keypair. |
| `AGENT_B_KEYPAIR` | No (SDK mode) | Keypair for Agent B, same formats. Falls back to an ephemeral, auto-funded keypair. |
| `CERTIFIER_KEYPAIR` | No | Authority keypair used to certify the capability and resolve the challenge. Without it the capability stays uncertified and the challenge stays pending; the script prints fallback instructions. |
| `TAOP_PROGRAM_ID` | No | Overrides the program id used by the SDK clients (defaults to the IDL address `8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE`). |
| `SOLANA_RPC_URL` | No | Overrides the RPC endpoint selected by `--cluster`. |
| `SOLANA_KEYPAIR` | MCP mode (for writes) | Signer inherited by the MCP server so `attest_completion` / `challenge_completion` can sign. A JSON keypair path or base58 secret. |

A `.env` file in the package directory is loaded automatically (`dotenv`).

On `localnet` and `devnet`, Agent A and Agent B are airdropped 1 SOL when their
balance drops below 0.1 SOL. On `mainnet-beta` the example skips airdrops
entirely and requires funded keypairs.

## Example output (SDK mode)

```text
TAOP Solana example agent — cluster=localnet rpc=http://127.0.0.1:8899
mode=sdk

== Agent A: register profile and bond a capability
capability: <pubkey>
https://explorer.solana.com/address/<pubkey>?cluster=localnet
capability certified by the certifier

== Agent A: complete a task and self-attest
completion #1: <pubkey>
https://explorer.solana.com/tx/<signature>?cluster=localnet

== Agent B: discover capabilities and vet Agent A
chose <agent-a-pubkey> score=1 bond=5000000 certified=true
Agent A score before challenge: 1

== Agent B: challenge the completion with a native SOL bond
https://explorer.solana.com/tx/<signature>?cluster=localnet

== Certifier: resolve the challenge as upheld
https://explorer.solana.com/tx/<signature>?cluster=localnet

== Agent B: re-read Agent A's score
score: 1 -> 0 (disputes: 1)

The loop is complete: discovery, bonded challenge, resolution, and a decayed score — all on-chain.
```

MCP mode prints `get_deployment_info`, `attest_completion`,
`discover_capabilities`, `get_agent_score`, `challenge_completion`, and
`get_completion` tool responses as JSON, with step headers between them.

## Mainnet cost note

On `mainnet-beta` the airdrop path is disabled, so every account and bond is
paid with real SOL:

- The capability bond in this example is **0.005 SOL**, and the challenge bond
  is whatever `Config.challengeBondLamports` is set to (0.005 SOL in the
  standard devnet/localnet configuration).
- The challenge bond is returned to the challenger if the challenge is upheld;
  it is forfeited to the treasury if rejected.
- Standard Solana transaction fees and account rent apply on top (the example
  creates agent, completion, challenge, capability, and index accounts).
- Run mainnet with dedicated, low-balance demo keypairs:
  `pnpm --filter @taopp/example-solana-agent start -- --cluster mainnet-beta`.
