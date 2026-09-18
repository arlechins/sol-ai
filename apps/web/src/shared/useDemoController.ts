import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiscoveryItem } from "@taopp/solana";
import {
  DEMO_AGENT,
  PROGRAM_ID,
  RPC_URL,
  readConfig,
  readDiscovery,
  readScore,
  type ConfigView,
  type ReadState,
  type ScoreResult,
} from "../lib/taop";
import { scoreMath, type ScoreMath } from "../lib/format";

export type AsyncStatus = "loading" | "ready" | "error";

export interface AsyncValue<T> {
  status: AsyncStatus;
  data: T | null;
  error: string | null;
  stale: boolean;
  at: number | null;
  refresh: () => void;
}

function useAsyncRead<T>(
  loader: (force: boolean) => Promise<ReadState<T>>,
  deps: unknown[],
): AsyncValue<T> {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [at, setAt] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const forceRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    const force = forceRef.current;
    forceRef.current = false;
    setStatus((current) => (current === "ready" ? "ready" : "loading"));

    loader(force).then((result) => {
      if (cancelled) return;
      setData(result.data);
      setError(result.error);
      setStale(result.stale);
      setAt(result.at);
      setStatus(result.error && !result.data ? "error" : "ready");
    });

    return () => {
      cancelled = true;
    };
  }, [...deps, nonce]);

  const refresh = useCallback(() => {
    forceRef.current = true;
    setNonce((value) => value + 1);
  }, []);

  return { status, data, error, stale, at, refresh };
}

export interface ScoreSection extends AsyncValue<ScoreResult> {
  address: string;
  setAddress: (address: string) => void;
  lookup: () => void;
  math: ScoreMath | null;
}

export interface DiscoverySection extends AsyncValue<DiscoveryItem[]> {
  type: string;
  setType: (type: string) => void;
  search: () => void;
  includeUncertified: boolean;
  setIncludeUncertified: (value: boolean) => void;
}

export interface DemoController {
  rpcUrl: string;
  programId: string;
  config: AsyncValue<ConfigView>;
  score: ScoreSection;
  discovery: DiscoverySection;
  now: number;
}

export function useDemoController(): DemoController {
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const [address, setAddress] = useState(DEMO_AGENT);
  const [submitted, setSubmitted] = useState(DEMO_AGENT);
  const [type, setType] = useState("LoRA");
  const [submittedType, setSubmittedType] = useState("LoRA");
  const [includeUncertified, setIncludeUncertified] = useState(false);

  const config = useAsyncRead<ConfigView>(
    (force) => readConfig(force),
    [],
  );

  const score = useAsyncRead<ScoreResult>(
    (force) => readScore(submitted, force),
    [submitted],
  );

  const discovery = useAsyncRead<DiscoveryItem[]>(
    (force) => readDiscovery(submittedType, includeUncertified, force),
    [submittedType, includeUncertified],
  );

  const lookup = useCallback(() => {
    setSubmitted(address.trim());
  }, [address]);

  const search = useCallback(() => {
    setSubmittedType(type.trim() || "LoRA");
  }, [type]);

  const math = useMemo(() => {
    if (!score.data) return null;
    const period = config.data?.decayPeriodSecs ?? 2_592_000;
    return scoreMath({
      completions: score.data.completions,
      disputes: score.data.disputes,
      lastActivity: score.data.lastActivity,
      now,
      decayPeriodSecs: period,
    });
  }, [score.data, config.data, now]);

  return {
    rpcUrl: RPC_URL,
    programId: PROGRAM_ID,
    config,
    score: {
      ...score,
      address,
      setAddress,
      lookup,
      math,
    },
    discovery: {
      ...discovery,
      type,
      setType,
      search,
      includeUncertified,
      setIncludeUncertified,
    },
    now,
  };
}
