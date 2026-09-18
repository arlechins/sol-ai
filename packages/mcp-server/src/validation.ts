import type { ChainName } from "./adapters/types";

/** Maximum URI length accepted by the program (`MAX_URI_LEN`). */
export const MAX_URI_LEN = 200;

const CHAINS: readonly ChainName[] = ["solana", "base"];

/** Fail fast on a typo'd chain instead of silently defaulting to Solana. */
export function resolveChain(value: string | undefined): ChainName {
  const normalized = (value ?? "solana").trim().toLowerCase();
  if (!CHAINS.includes(normalized as ChainName)) {
    throw new Error(
      `Unknown TAOP_CHAIN "${value ?? ""}". Use "solana" or "base".`,
    );
  }
  return normalized as ChainName;
}

export function requireString(
  args: Record<string, unknown>,
  key: string,
  tool: string,
): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${tool}: "${key}" is required and must be a non-empty string`,
    );
  }
  return value;
}

export function requireUri(
  args: Record<string, unknown>,
  key: string,
  tool: string,
): string {
  const value = requireString(args, key, tool);
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes > MAX_URI_LEN) {
    throw new Error(
      `${tool}: "${key}" must be at most ${MAX_URI_LEN} bytes, got ${bytes}`,
    );
  }
  return value;
}

/**
 * Booleans are accepted as real booleans or the exact strings "true"/"false".
 * Never truthy-coerce: `Boolean("false")` is true, which would resolve a
 * challenge as upheld against the caller's intent.
 */
export function requireBoolean(
  args: Record<string, unknown>,
  key: string,
  tool: string,
): boolean {
  const value = args[key];
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${tool}: "${key}" is required and must be a boolean`);
}

export function optionalNumber(
  args: Record<string, unknown>,
  key: string,
  tool: string,
  fallback = 0,
): number {
  const value = args[key];
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${tool}: "${key}" must be a non-negative number`);
  }
  return parsed;
}

/** Decimal bond strings only ("0.005"), so adapters never see loose garbage. */
export function optionalDecimalString(
  args: Record<string, unknown>,
  key: string,
  tool: string,
  fallback = "",
): string {
  const value = args[key];
  if (value === undefined || value === null || value === "") return fallback;
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error(
      `${tool}: "${key}" must be a decimal amount like "0.005"`,
    );
  }
  return text;
}
