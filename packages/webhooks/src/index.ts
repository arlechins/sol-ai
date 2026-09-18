#!/usr/bin/env node
/**
 * `taop-webhooks` — watch TAOP program events and deliver signed webhooks.
 *
 * Usage:
 *   taop-webhooks --webhook https://example.com/hooks/taop [--secret <hmac>] \
 *     [--rpc <url>] [--program <id>] [--cluster devnet] [--state <path>] \
 *     [--interval 5000] [--once]
 *
 * Environment variables mirror the flags: SOLANA_RPC_URL, TAOP_PROGRAM_ID,
 * TAOP_WEBHOOK_URL, TAOP_WEBHOOK_SECRET, TAOP_CLUSTER, TAOP_WEBHOOK_STATE,
 * TAOP_WEBHOOK_INTERVAL_MS.
 */
import { Connection, PublicKey } from "@solana/web3.js";

import { runDispatcher, pollOnce, loadState } from "./dispatcher.js";

export * from "./dispatcher.js";

interface CliArgs {
  rpc: string;
  program: string;
  webhook: string;
  secret?: string;
  cluster: string;
  state?: string;
  interval: number;
  once: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(`--${flag}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const webhook = value("webhook") ?? process.env.TAOP_WEBHOOK_URL;
  if (!webhook) {
    throw new Error(
      "A webhook URL is required: --webhook <url> or TAOP_WEBHOOK_URL",
    );
  }

  return {
    rpc:
      value("rpc") ??
      process.env.SOLANA_RPC_URL ??
      "https://api.devnet.solana.com",
    program:
      value("program") ??
      process.env.TAOP_PROGRAM_ID ??
      "8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE",
    webhook,
    secret: value("secret") ?? process.env.TAOP_WEBHOOK_SECRET,
    cluster: value("cluster") ?? process.env.TAOP_CLUSTER ?? "devnet",
    state:
      value("state") ??
      process.env.TAOP_WEBHOOK_STATE ??
      "./.taop-webhooks-state.json",
    interval: Number(
      value("interval") ?? process.env.TAOP_WEBHOOK_INTERVAL_MS ?? "5000",
    ),
    once: argv.includes("--once"),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const options = {
    connection: new Connection(args.rpc, "confirmed"),
    programId: new PublicKey(args.program),
    webhookUrl: args.webhook,
    secret: args.secret,
    cluster: args.cluster,
    statePath: args.state,
    pollIntervalMs: args.interval,
  };

  if (args.once) {
    const result = await pollOnce(options, loadState(args.state));
    console.log(JSON.stringify(result, null, 2));
    if (result.failed > 0) process.exit(1);
    return;
  }

  await runDispatcher(options);
}

// Only run the CLI when executed directly (the module is also imported by tests).
const direct = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.cjs");
if (direct) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
