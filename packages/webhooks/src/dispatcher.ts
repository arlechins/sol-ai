import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Connection, PublicKey } from "@solana/web3.js";
import { TaopSolanaClient, type TaopEvent } from "@taopp/solana";

export const WEBHOOK_USER_AGENT = "taop-webhooks/0.1.0";

export interface WebhookEvent {
  /** Stable delivery id: `<signature>:<event index within the transaction>`. */
  id: string;
  cluster: string;
  programId: string;
  signature: string;
  slot: number;
  blockTime: number | null;
  name: string;
  data: Record<string, unknown>;
}

export interface DispatcherState {
  lastSignature: string | null;
}

export interface DispatcherOptions {
  connection: Connection;
  programId: PublicKey;
  webhookUrl: string;
  /** When set, deliveries carry an `x-taop-signature: sha256=<hmac>` header. */
  secret?: string;
  cluster?: string;
  /** JSON file used to resume from the last processed signature. */
  statePath?: string;
  pollIntervalMs?: number;
  maxSignaturesPerPoll?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
  decode?: (logs: readonly string[]) => TaopEvent[];
  log?: (line: string) => void;
}

export interface DeliveryResult {
  ok: boolean;
  status?: number;
  attempts: number;
  error?: string;
}

export interface PollResult {
  processed: number;
  delivered: number;
  failed: number;
  lastSignature: string | null;
}

/** HMAC-SHA256 of `timestamp.body` (or the bare body when no timestamp), hex encoded. */
export function signPayload(
  secret: string,
  body: string,
  timestamp?: number | string,
): string {
  const signed = timestamp === undefined ? body : `${timestamp}.${body}`;
  return crypto.createHmac("sha256", secret).update(signed).digest("hex");
}

export interface VerifyOptions {
  /** Allowed clock skew in seconds; 0 disables the window. Default 300. */
  toleranceSecs?: number;
  /** Current unix seconds; injectable for tests. */
  now?: number;
}

/**
 * Verify `x-taop-signature` against `x-taop-timestamp` and the raw body.
 *
 * Fails closed: a missing or non-numeric timestamp, a timestamp outside the
 * tolerance window, or any HMAC mismatch returns false. This is what makes a
 * captured delivery useless to replay later.
 */
export function verifySignature(
  secret: string,
  body: string,
  header: string | undefined,
  timestamp: string | number | undefined,
  options: VerifyOptions = {},
): boolean {
  if (!header || timestamp === undefined) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  const { toleranceSecs = 300, now = Math.floor(Date.now() / 1000) } = options;
  if (toleranceSecs > 0 && Math.abs(now - seconds) > toleranceSecs) return false;
  const expected = Buffer.from(`sha256=${signPayload(secret, body, timestamp)}`);
  const actual = Buffer.from(header);
  return (
    expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function loadState(statePath?: string): DispatcherState {
  if (!statePath || !fs.existsSync(statePath)) return { lastSignature: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as DispatcherState;
    return { lastSignature: parsed.lastSignature ?? null };
  } catch {
    return { lastSignature: null };
  }
}

export function saveState(statePath: string, state: DispatcherState): void {
  const directory = path.dirname(statePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${statePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temporary, statePath);
}

/**
 * Deliver one event with bounded retries. Retries cover network errors and
 * non-2xx responses; the caller decides whether to dead-letter failures.
 */
export async function deliverWebhook(
  event: WebhookEvent,
  options: Pick<
    DispatcherOptions,
    "webhookUrl" | "secret" | "fetchImpl" | "maxAttempts" | "retryDelayMs"
  >,
): Promise<DeliveryResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = options.maxAttempts ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 500;
  const body = JSON.stringify(event);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": WEBHOOK_USER_AGENT,
    "x-taop-delivery": event.id,
  };
  if (options.secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    headers["x-taop-timestamp"] = String(timestamp);
    headers["x-taop-signature"] = `sha256=${signPayload(options.secret, body, timestamp)}`;
  }

  let lastError = "unknown error";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(options.webhookUrl, {
        method: "POST",
        headers,
        body,
      });
      if (response.ok) {
        return { ok: true, status: response.status, attempts: attempt };
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt < maxAttempts) await sleep(retryDelayMs * attempt);
  }
  return { ok: false, attempts: maxAttempts, error: lastError };
}

/** Default decoder: the SDK's IDL-driven event coder. */
export function defaultDecoder(
  connection: Connection,
  programId: PublicKey,
): (logs: readonly string[]) => TaopEvent[] {
  const client = new TaopSolanaClient({ connection, programId });
  return (logs) => client.decodeEvents(logs);
}

/**
 * Process all new signatures for the program once, oldest first, delivering
 * every decoded event. Semantics are at-least-once: the state advances per
 * transaction, but after a long downtime older-than-page transactions are
 * delivered again. Receivers should de-duplicate on `x-taop-delivery`.
 */
export async function pollOnce(
  options: DispatcherOptions,
  state: DispatcherState,
): Promise<PollResult> {
  const log = options.log ?? ((line: string) => console.log(line));
  const decode =
    options.decode ?? defaultDecoder(options.connection, options.programId);
  const cluster = options.cluster ?? "devnet";
  const limit = options.maxSignaturesPerPoll ?? 25;

  // `until` pages *older* signatures, so resume by walking backwards in pages
  // until the last processed signature is found (or the history is exhausted),
  // then keep only entries newer than it.
  const collected: Array<{ signature: string; slot: number }> = [];
  let before: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const batch = await options.connection.getSignaturesForAddress(
      options.programId,
      { before, limit },
    );
    collected.push(...batch);
    if (batch.length < limit) break;
    if (
      state.lastSignature &&
      batch.some((entry) => entry.signature === state.lastSignature)
    ) {
      break;
    }
    before = batch[batch.length - 1]?.signature;
    if (!before) break;
  }

  const cutoff = state.lastSignature
    ? collected.findIndex((entry) => entry.signature === state.lastSignature)
    : -1;
  const fresh = cutoff >= 0 ? collected.slice(0, cutoff) : collected;
  if (state.lastSignature && cutoff < 0 && fresh.length > 0) {
    log(
      `warning: last processed signature ${state.lastSignature} not found in the last ${collected.length} signatures; delivering them again (at-least-once)`,
    );
  }
  const ordered = [...fresh].reverse();
  let processed = 0;
  let delivered = 0;
  let failed = 0;

  for (const entry of ordered) {
    const transaction = await options.connection.getTransaction(entry.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const logs = transaction?.meta?.logMessages ?? [];
    const events = decode(logs);

    for (const [index, event] of events.entries()) {
      const payload: WebhookEvent = {
        id: `${entry.signature}:${index}`,
        cluster,
        programId: options.programId.toBase58(),
        signature: entry.signature,
        slot: transaction?.slot ?? entry.slot,
        blockTime: transaction?.blockTime ?? null,
        name: event.name,
        data: event.data,
      };
      const result = await deliverWebhook(payload, options);
      if (result.ok) {
        delivered += 1;
      } else {
        failed += 1;
        log(
          `dead-letter ${payload.id} (${payload.name}): ${result.error} after ${result.attempts} attempts`,
        );
      }
    }

    processed += 1;
    state.lastSignature = entry.signature;
    if (options.statePath) saveState(options.statePath, state);
  }

  return { processed, delivered, failed, lastSignature: state.lastSignature };
}

/** Long-running poller with graceful SIGINT/SIGTERM shutdown. */
export async function runDispatcher(options: DispatcherOptions): Promise<void> {
  const log = options.log ?? ((line: string) => console.log(line));
  const state = loadState(options.statePath);
  let running = true;
  const stop = () => {
    running = false;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  log(
    `watching ${options.programId.toBase58()} via ${options.connection.rpcEndpoint} -> ${options.webhookUrl}`,
  );
  while (running) {
    const result = await pollOnce(options, state);
    if (result.processed > 0) {
      log(
        `processed ${result.processed} signatures, delivered ${result.delivered}, failed ${result.failed}`,
      );
    }
    if (running) await sleep(options.pollIntervalMs ?? 5_000);
  }
  log("shutting down");
}
