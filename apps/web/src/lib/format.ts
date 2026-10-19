export function shortKey(key: string, head = 4, tail = 4): string {
  if (!key) return "";
  if (key.length <= head + tail + 1) return key;
  return `${key.slice(0, head)}…${key.slice(-tail)}`;
}

export function formatSol(
  lamports: number | null | undefined,
  digits = 4,
): string {
  if (lamports == null || Number.isNaN(lamports)) return "—";
  const value = lamports / 1e9;
  const fixed = value.toFixed(digits);
  return `${trimZeros(fixed)} SOL`;
}

function trimZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatScore(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

export function relativeTime(unixSeconds: number): string {
  if (!unixSeconds) return "never";
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (elapsed < 60) return "just now";
  if (elapsed < 3_600) return `${Math.floor(elapsed / 60)}m ago`;
  if (elapsed < 86_400) return `${Math.floor(elapsed / 3_600)}h ago`;
  if (elapsed < 2_592_000) return `${Math.floor(elapsed / 86_400)}d ago`;
  if (elapsed < 31_536_000) return `${Math.floor(elapsed / 2_592_000)}mo ago`;
  return `${Math.floor(elapsed / 31_536_000)}y ago`;
}

export function durationFromSeconds(seconds: number): string {
  if (seconds <= 0) return "0d";
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3_600)}h`;
  const days = seconds / 86_400;
  return days >= 10 ? `${Math.round(days)}d` : `${days.toFixed(1)}d`;
}

export interface DecayPoint {
  /** Seconds before `now` (negative = the present). */
  offset: number;
  score: number;
}

/**
 * Display-only projection of how the current score decays over time.
 * Mirrors `computeScore` in the SDK (score halved per full decay period,
 * capped at 63 halvings).
 */
export function decaySeries(params: {
  base: number;
  lastActivity: number;
  decayPeriodSecs: number;
  now: number;
  points?: number;
  horizonPeriods?: number;
}): DecayPoint[] {
  const { base, lastActivity, decayPeriodSecs, now } = params;
  const points = params.points ?? 28;
  const horizonPeriods = params.horizonPeriods ?? 3;
  const period = Math.max(1, decayPeriodSecs);
  const start = lastActivity > 0 ? lastActivity : now;
  const horizon = period * horizonPeriods;
  const series: DecayPoint[] = [];

  for (let i = 0; i < points; i += 1) {
    const at = start + (horizon * i) / (points - 1);
    const elapsed = Math.max(0, at - start);
    // On-chain decay starts strictly after one full period.
    const halvings =
      elapsed <= period ? 0 : Math.min(63, Math.floor(elapsed / period));
    series.push({
      offset: Math.round(at - now),
      score: halveU64(base, halvings),
    });
  }
  return series;
}

/**
 * `net >> halvings` with u64 semantics. JavaScript's `>>>` coerces to 32 bits
 * and takes the shift count modulo 32, diverging from the on-chain u64 shift.
 */
export function halveU64(net: number, halvings: number): number {
  if (halvings <= 0) return net;
  if (halvings >= 53) return 0;
  return Math.floor(net / 2 ** halvings);
}

export function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v)),
  ) as T;
}

export interface ScoreMath {
  net: number;
  halvings: number;
  scoreEquivalent: number;
  decayed: boolean;
  elapsedSecs: number;
  nextHalvingInSecs: number;
  periodSecs: number;
}

/**
 * Mirror of the SDK's `computeScore`: score = max(0, completions - disputes),
 * halved for every full decay period of inactivity, capped at 63 halvings.
 * Kept local so the landing/demo math never pulls the SDK into a bundle.
 */
export function scoreMath(params: {
  completions: number;
  disputes: number;
  lastActivity: number;
  now: number;
  decayPeriodSecs: number;
}): ScoreMath {
  const { completions, disputes, lastActivity, now } = params;
  const periodSecs = params.decayPeriodSecs > 0 ? params.decayPeriodSecs : 2_592_000;
  const net = Math.max(0, completions - disputes);

  if (net === 0 || lastActivity <= 0) {
    return {
      net,
      halvings: 0,
      scoreEquivalent: net,
      decayed: false,
      elapsedSecs: 0,
      nextHalvingInSecs: periodSecs,
      periodSecs,
    };
  }

  const elapsedSecs = Math.max(0, now - lastActivity);
  // Decay applies only once elapsed time exceeds a full period.
  const halvings =
    elapsedSecs <= periodSecs
      ? 0
      : Math.min(63, Math.floor(elapsedSecs / periodSecs));
  // The next halving lands one second after the next full period boundary.
  const nextHalvingInSecs = Math.max(
    1,
    (halvings + 1) * periodSecs + 1 - elapsedSecs,
  );

  return {
    net,
    halvings,
    scoreEquivalent: halveU64(net, halvings),
    decayed: halvings > 0,
    elapsedSecs,
    nextHalvingInSecs,
    periodSecs,
  };
}
