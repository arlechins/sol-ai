export const LAMPORTS_PER_SOL = 1_000_000_000;

/** SIMD-0437 step 1 (mainnet, September 2026): 6_960 -> 6_333 lamports/byte. */
export const LAMPORTS_PER_BYTE = 6_333;

/** Base signature fee on Solana (lamports per signature). */
export const TX_FEE_LAMPORTS = 5_000;

/** On-chain account sizes from docs/account-layout.md (serialized bytes). */
export const ACCOUNT_BYTES = {
  agent: 269,
  completion: 295,
  challenge: 295,
  capability: 296,
} as const;

export function rentExempt(dataBytes: number): number {
  return (128 + dataBytes) * LAMPORTS_PER_BYTE;
}

export function sol(lamports: number): string {
  return `${(lamports / LAMPORTS_PER_SOL).toFixed(9)} SOL`;
}

/** Deterministic PRNG (mulberry32) so published results are reproducible. */
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
