import type {
  DiscoveryItem,
  ScoreView,
  TaopSolanaClient,
} from "@taopp/solana";
import deployment from "../data/deployment.json";

/**
 * Read-only devnet access.
 *
 * The SDK is loaded lazily so the landing page ships none of it; only the
 * demo route pays for web3.js + Anchor. Every read is cached in
 * sessionStorage and degrades to an error state instead of throwing.
 */

export const RPC_URL: string =
  (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined)?.trim() ||
  "https://api.devnet.solana.com";

export const CLUSTER = deployment.cluster;
export const PROGRAM_ID = deployment.programId;
/**
 * The agent from the verified devnet loop: two completions, two upheld
 * disputes, score 0. A deliberately instructive default for the score lab.
 */
export const DEMO_AGENT = "3P3DNmhSMVjymwHzHe8FigS9Q6cR1nFRgNtxozYiyvmh";

export interface ConfigView {
  admin: string;
  certifier: string;
  treasury: string;
  challengeBondLamports: number;
  decayPeriodSecs: number;
  paused: boolean;
  nextCompletionId: number;
  nextCapabilityId: number;
  programId: string;
  rpcUrl: string;
  cluster: string;
}

export interface ReadState<T> {
  data: T | null;
  error: string | null;
  /** Epoch ms of the data, null when nothing was ever read. */
  at: number | null;
  /** True when served from cache after a failed refresh. */
  stale: boolean;
}

let clientPromise: Promise<TaopSolanaClient> | null = null;

async function ensureBuffer(): Promise<void> {
  if (typeof globalThis.Buffer !== "undefined") return;
  const { Buffer } = await import("buffer");
  (globalThis as { Buffer?: unknown }).Buffer = Buffer;
}

async function getClient(): Promise<TaopSolanaClient> {
  clientPromise ??= (async () => {
    await ensureBuffer();
    const [{ Connection }, { TaopSolanaClient }] = await Promise.all([
      import("@solana/web3.js"),
      import("@taopp/solana"),
    ]);
    const connection = new Connection(RPC_URL, "confirmed");
    return new TaopSolanaClient({ connection });
  })();
  return clientPromise;
}

export function resetClientForTests(): void {
  clientPromise = null;
}

const CACHE_PREFIX = "taop.read.";

interface CacheEntry<T> {
  at: number;
  data: T;
}

function cacheGet<T>(key: string, ttlMs: number): CacheEntry<T> | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.at > ttlMs) return null;
    return entry;
  } catch {
    return null;
  }
}

function cacheGetAny<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as CacheEntry<T>) : null;
  } catch {
    return null;
  }
}

function cacheSet<T>(key: string, data: T): CacheEntry<T> {
  const entry = { at: Date.now(), data };
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Storage may be unavailable (private mode); reads still return data.
  }
  return entry;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function read<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<ReadState<T>> {
  const cached = cacheGet<T>(key, ttlMs);
  if (cached) {
    return { data: cached.data, error: null, at: cached.at, stale: false };
  }
  try {
    const data = await withTimeout(loader(), timeoutMs, label);
    const entry = cacheSet(key, data);
    return { data, error: null, at: entry.at, stale: false };
  } catch (error) {
    const any = cacheGetAny<T>(key);
    return {
      data: any?.data ?? null,
      error: describeError(error),
      at: any?.at ?? null,
      stale: Boolean(any),
    };
  }
}

export function readConfig(force = false): Promise<ReadState<ConfigView>> {
  if (force) {
    try {
      sessionStorage.removeItem(CACHE_PREFIX + "config");
    } catch {
      // ignore
    }
  }
  return read<ConfigView>(
    "config",
    5 * 60_000,
    async () => {
      const client = await getClient();
      const config = await client.getConfig();
      return {
        admin: config.admin.toBase58(),
        certifier: config.certifier.toBase58(),
        treasury: config.treasury.toBase58(),
        challengeBondLamports: config.challengeBondLamports,
        decayPeriodSecs: config.decayPeriodSecs,
        paused: config.paused,
        nextCompletionId: config.nextCompletionId,
        nextCapabilityId: config.nextCapabilityId,
        programId: PROGRAM_ID,
        rpcUrl: RPC_URL,
        cluster: CLUSTER,
      };
    },
    15_000,
    "Config read",
  );
}

export interface ScoreResult extends ScoreView {
  address: string;
}

export function readScore(
  address: string,
  force = false,
): Promise<ReadState<ScoreResult>> {
  const trimmed = address.trim();
  if (force) {
    try {
      sessionStorage.removeItem(CACHE_PREFIX + `score.${trimmed}`);
    } catch {
      // ignore
    }
  }
  return read<ScoreResult>(
    `score.${trimmed}`,
    60_000,
    async () => {
      const [{ PublicKey }, client] = await Promise.all([
        import("@solana/web3.js"),
        getClient(),
      ]);
      let key: InstanceType<typeof PublicKey>;
      try {
        key = new PublicKey(trimmed);
      } catch {
        throw new Error("Not a valid base58 Solana address");
      }
      const score = await client.getScore(key);
      return { address: key.toBase58(), ...score };
    },
    15_000,
    "Score read",
  );
}

export function readDiscovery(
  capabilityType: string,
  includeUncertified: boolean,
  force = false,
): Promise<ReadState<DiscoveryItem[]>> {
  const type = capabilityType.trim() || "LoRA";
  const key = `discover.${type}.${includeUncertified ? "all" : "certified"}`;
  if (force) {
    try {
      sessionStorage.removeItem(CACHE_PREFIX + key);
    } catch {
      // ignore
    }
  }
  return read<DiscoveryItem[]>(
    key,
    90_000,
    async () => {
      const client = await getClient();
      return client.discover({
        // The SDK hashes string types with node:crypto (Node only). Hashing
        // here with WebCrypto keeps the browser path off Node built-ins while
        // producing the identical 32-byte on-chain tag.
        capabilityType: await hashType(type),
        includeUncertified,
      });
    },
    20_000,
    "Capability scan",
  );
}

async function hashType(value: string): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "WebCrypto is unavailable in this context; capability discovery needs a secure (https) origin",
    );
  }
  const data = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}
