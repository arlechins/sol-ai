# @taopp/solana

TypeScript SDK for the TAOP reputation program on Solana: self-attested
completions, native-SOL bonded challenges, decayed reputation scores, and a
bonded capability registry.

- Program: `taop_reputation`
- Program id: `8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE`
- Package: `@taopp/solana`

## Install

```sh
pnpm add @taopp/solana
# or
npm install @taopp/solana
```

Peer requirements: Node 20+, `@solana/web3.js` 1.x.

## Quick start

### Read-only (no wallet)

```ts
import { Connection, PublicKey } from "@solana/web3.js";
import { TaopSolanaClient } from "@taopp/solana";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const client = new TaopSolanaClient({ connection });

const score = await client.getScore(new PublicKey("<AGENT_AUTHORITY>"));
const onChain = await client.getScoreOnChain(new PublicKey("<AGENT_AUTHORITY>"));
const capabilities = await client.discover({ capabilityType: "LoRA", minScore: 1 });
```

### Signed (wallet required for writes)

```ts
import fs from "node:fs";
import { Connection, Keypair } from "@solana/web3.js";
import { TaopSolanaClient } from "@taopp/solana";

const connection = new Connection("http://127.0.0.1:8899", "confirmed");
const wallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf8"))),
);

const client = new TaopSolanaClient({ connection, wallet });

await client.registerAgent("ipfs://agent-profile");
const { completion, completionId } = await client.attest({
  taskType: "summarization",
  resultUri: "ipfs://result-0",
});
console.log(completionId, completion.toBase58());

// Bond a capability (0.005 SOL) and read it back.
const { capability } = await client.registerCapability({
  capabilityType: "LoRA",
  metadataUri: "ipfs://cap-card",
  bondLamports: 5_000_000,
});
```

Writes throw `This operation requires a wallet. Construct TaopSolanaClient with { wallet }.`
when no wallet was provided. A wallet can be a
`@solana/web3.js` `Keypair` or an Anchor `Wallet`.

## API

### Client construction

```ts
new TaopSolanaClient({
  connection: Connection,   // required
  wallet?: Wallet | Keypair, // omit for read-only clients
  programId?: PublicKey,     // defaults to TAOP_PROGRAM_ID
})
```

Read-only properties: `connection`, `programId`, `program`, `provider`,
`pdas`, `walletPublicKey`.

### Instructions

| Method | Arguments | Returns |
| --- | --- | --- |
| `initializeConfig` | `{ certifier: PublicKey, treasury: PublicKey, challengeBondLamports: number \| bigint, decayPeriodSecs: number \| bigint }` | `Promise<string>` (tx signature). One-time; the signer becomes admin. |
| `updateConfig` | `{ challengeBondLamports?, decayPeriodSecs?, paused? }` | `Promise<string>`. Admin only. Validates the bond against the rent-exempt minimum and rejects zero decay periods. |
| `setCertifier` | `certifier: PublicKey` | `Promise<string>`. Admin only. |
| `transferAdmin` | `newAdmin: PublicKey` | `Promise<string>`. Admin only. Proposes a handover; the new admin must call `acceptAdmin`. |
| `acceptAdmin` | - | `Promise<string>`. Accepts a pending handover (proposed key only); refunds the pending account rent. |
| `decodeEvents` | `logs: string[]` | `TaopEvent[]`. Decodes TAOP events from raw transaction logs. |
| `eventsForTransaction` | `signature: string` | `Promise<TaopEvent[]>`. Fetches a transaction and decodes its TAOP events (for indexers). |
| `registerAgent` | `metadataUri: string` | `Promise<string>`. Creates the agent profile or updates its metadata (<= 200 bytes). |
| `attest` | `{ taskType: string \| number[] \| Uint8Array, resultUri: string, seq?: number \| bigint }` | `Promise<{ signature, completion: PublicKey, completionId: number }>`. `seq` defaults to the agent's current completion count. |
| `challenge` | `{ completion: PublicKey, evidenceUri: string }` | `Promise<string>`. Posts exactly `Config.challengeBondLamports` into the challenge vault. Throws if the completion was already challenged. |
| `resolveChallenge` | `{ completion: PublicKey, upheld: boolean }` | `Promise<string>`. Admin or certifier only. Upheld refunds the challenger; rejected forfeits the bond to the treasury. |
| `registerCapability` | `{ capabilityType: string \| number[] \| Uint8Array, metadataUri: string, bondLamports: number \| bigint, id?: number \| bigint }` | `Promise<{ signature, capability: PublicKey, capabilityId: number }>`. `id` defaults to the next global capability id. |
| `certifyCapability` | `capability: PublicKey` | `Promise<string>`. Admin or certifier only. |
| `slashCapability` | `capability: PublicKey, penaltyLamports: number \| bigint` | `Promise<string>`. Admin or certifier only; partial slashes must leave the bond rent-exempt. |
| `withdrawCapabilityBond` | `capability: PublicKey` | `Promise<string>`. Creator only; returns the remaining bond and closes the capability account. |

### Reads

| Method | Arguments | Returns |
| --- | --- | --- |
| `getScore` | `agent: PublicKey` | `Promise<ScoreView>`. Computed locally from chain state with decay applied (`{ completions, disputes, score, lastActivity, decayed }`). Returns an all-zero view when the agent does not exist. |
| `getScoreOnChain` | `agent: PublicKey` | `Promise<ScoreView>`. Simulates the `get_score` instruction and decodes its return data. Requires a wallet as the simulation fee payer (`WalletRequired` otherwise); throws if the agent has not attested. |
| `discover` | `{ capabilityType, minScore?: number, includeUncertified?: boolean }` | `Promise<DiscoveryItem[]>`. Certified, non-slashed, active capabilities ranked by creator score. Reads the per-type index and falls back to a program-account scan when the index is absent. |
| `getConfig` | — | `Promise<TaopConfigRecord>` (`admin`, `certifier`, `treasury`, `challengeBondLamports`, `decayPeriodSecs`, `paused`, `nextCompletionId`, `nextCapabilityId`). |
| `getAgent` | `authority: PublicKey` | `Promise<AgentRecord \| null>` |
| `fetchAgents` | `authorities: PublicKey[]` | `Promise<Map<string, AgentRecord>>` via one `getMultipleAccounts` call. |
| `getCompletion` | `completion: PublicKey` | `Promise<CompletionRecord \| null>` |
| `getChallenge` | `completion: PublicKey` | `Promise<ChallengeRecord \| null>` (derives the challenge PDA). |
| `getCapability` | `capability: PublicKey` | `Promise<CapabilityRecord \| null>` |
| `clusterTime` | — | `Promise<number>` (block time of the latest confirmed slot). |

### Helpers and standalone exports

| Export | Purpose |
| --- | --- |
| `TAOP_PROGRAM_ID` | The pinned program id as a `PublicKey`. |
| `loadDeployment(path: string)` | Parse a `deployments.solana.json` file into `SolanaDeployment`. |
| `clientFromDeployment(deployment, { connection, wallet? })` | Build a client using the deployment's `programId`. |
| `computeScore({ completions, disputes, lastActivity, now, decayPeriodSecs? })` | Returns `{ completions, disputes, score, decayed, halvings }`; mirrors the on-chain formula exactly. |
| `hashType(value: string)` | Canonical 32-byte sha256 tag for task/capability types. |
| `typeToHex(bytes)` | Hex string for a byte tag. |
| `createPdas(programId)` | All PDA derivations: `config`, `agent(authority)`, `completion(agent, seq)`, `challenge(completion)`, `challengeVault(completion)`, `capability(type, creator, id)`, `capabilityVault(capability)`, `capabilityIndex(type)`. |
| `normalizeWallet(wallet \| Keypair)` | Convert a `Keypair` into an Anchor `Wallet`. |
| `DEFAULT_DECAY_PERIOD_SECS` | `2_592_000` (30 days). |

TypeScript types exported: `TaopSolanaClientConfig`, `TaopConfigRecord`,
`AgentRecord`, `CompletionRecord`, `ChallengeRecord`, `CapabilityRecord`,
`ScoreView`, `AttestInput`, `AttestResult`, `ChallengeInput`, `ResolveInput`,
`RegisterCapabilityInput`, `DiscoverInput`, `DiscoveryItem`,
`SolanaDeployment`, `ScoreBreakdown`, `Pdas`.

## Validation

Write methods validate inputs before signing: URIs must be at most 200 bytes
(`UriTooLong`), the decay period at most 366 days (`DecayPeriodTooLong`), and a
wallet is required for writes and on-chain score reads (`WalletRequired`), and
bond-bearing writes pre-check the signer balance (`InsufficientBalance`).

## Idempotency and retries

Writes are PDA-bound, so a resubmitted transaction cannot double-spend or
double-count: a repeated `attest` with the same sequence fails
(`InvalidCompletionSeq`), a repeated `challenge` fails (`AlreadyChallenged`),
and a repeated `registerCapability` fails (`InvalidCapabilityId`). If a write
fails during confirmation, it is safe to retry it.

## Bonds and costs

| Item | Amount |
| --- | --- |
| Challenge bond | Exact `Config.challengeBondLamports` (examples and tests use `5_000_000` lamports = 0.005 SOL). Must be `>= Rent::minimum_balance(0)` at config time. Refunded to the challenger when the challenge is upheld; forfeited to the treasury when rejected. |
| Capability bond | Caller-chosen, must be `> 0` and `>= Rent::minimum_balance(0)` (890,880 lamports at standard mainnet rent). |
| Partial slash | Penalty must leave the remaining bond `>= Rent::minimum_balance(0)`; the penalty goes to the treasury. |
| Full slash | Drains the capability vault to zero (the vault account is purged); the capability record stays with `bondRemaining = 0`. |
| Withdrawal | Returns the entire remaining vault balance to the creator and closes the `Capability` account, refunding its rent. |
| Account rent | Paid by the transaction payer when `Agent`, `Completion`, and `Challenge` PDAs are created. The program charges no protocol fee; standard Solana transaction fees apply. |

Completions and challenges are never closed, so their rent is not recovered;
capability accounts are closed on withdrawal.

## Documentation

- [Tutorial](../../docs/tutorial.md) — prerequisites, localnet, SDK and MCP walkthroughs, devnet deployment.
- [Architecture](../../docs/architecture.md) — the v0.1 mechanism, trust model, and limitations.
- [Account layout](../../docs/account-layout.md) — PDA seeds, exact byte layouts, and the instruction/account matrix.
