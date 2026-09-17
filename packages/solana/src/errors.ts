export type TaopErrorCode =
  | "Unauthorized"
  | "Paused"
  | "UriTooLong"
  | "BondBelowRentExempt"
  | "AlreadyChallenged"
  | "ChallengeNotPending"
  | "InvalidCompletionSeq"
  | "InvalidCapabilityId"
  | "InvalidDecayPeriod"
  | "DecayPeriodTooLong"
  | "ZeroBond"
  | "PenaltyExceedsBond"
  | "InvalidPenalty"
  | "CapabilityNotActive"
  | "BondStillSlashed"
  | "IndexFull"
  | "VaultBalanceMismatch"
  | "ArithmeticOverflow"
  | "AccountNotFound"
  | "WalletRequired"
  | "Unknown";

const KNOWN_CODES = new Set<string>([
  "Unauthorized",
  "Paused",
  "UriTooLong",
  "BondBelowRentExempt",
  "AlreadyChallenged",
  "ChallengeNotPending",
  "InvalidCompletionSeq",
  "InvalidCapabilityId",
  "InvalidDecayPeriod",
  "DecayPeriodTooLong",
  "ZeroBond",
  "PenaltyExceedsBond",
  "InvalidPenalty",
  "CapabilityNotActive",
  "BondStillSlashed",
  "IndexFull",
  "VaultBalanceMismatch",
  "ArithmeticOverflow",
]);

/** Error thrown by SDK write operations, with the program error code when known. */
export class TaopSolanaError extends Error {
  readonly code: TaopErrorCode;

  constructor(code: TaopErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TaopSolanaError";
    this.code = code;
  }

  /** True when the failure is a documented, expected program condition. */
  get isProgramError(): boolean {
    return this.code !== "Unknown" && this.code !== "AccountNotFound";
  }
}

/** Map an Anchor/web3 error to a typed TaopSolanaError. */
export function mapError(error: unknown): TaopSolanaError {
  if (error instanceof TaopSolanaError) return error;
  const message = error instanceof Error ? error.message : String(error);

  const anchorCode = /Error Code: (\w+)/.exec(message)?.[1];
  if (anchorCode && KNOWN_CODES.has(anchorCode)) {
    return new TaopSolanaError(anchorCode as TaopErrorCode, message, {
      cause: error,
    });
  }

  if (
    /Account does not exist|AccountNotFound|has no data|Could not find account/i.test(
      message,
    )
  ) {
    return new TaopSolanaError("AccountNotFound", message, { cause: error });
  }

  return new TaopSolanaError("Unknown", message, { cause: error });
}
