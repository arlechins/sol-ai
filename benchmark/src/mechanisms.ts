import { computeScore } from "@taopp/solana";

import {
  ACCOUNT_BYTES,
  LAMPORTS_PER_SOL,
  TX_FEE_LAMPORTS,
  rentExempt,
} from "./economics";

export interface MechanismParams {
  /** Challenge bond for the TAOP mechanism (lamports). */
  bondLamports: number;
  /** Inactivity decay period (seconds). */
  decayPeriodSecs: number;
  /** Bond staked behind a capability (lamports); the only slashable capital in v0.1. */
  capabilityBondLamports: number;
}

export interface AgentState {
  id: number;
  completions: number;
  disputes: number;
  lastActivity: number;
  /** Peer ratings received (only counted by the peer-ratings mechanism). */
  raters: Set<number>;
  /** Completions a counterparty has confirmed (two-sided receipts only). */
  confirmedCompletions: number;
  /** Lamports the attacker has irreversibly spent (fees, rent, forfeited bonds). */
  spentLamports: number;
  /** Lamports currently locked in bonds (recoverable). */
  lockedLamports: number;
  /** Bonded lamports that have been slashed (lost). */
  slashedLamports: number;
}

export interface CompletionState {
  id: number;
  agent: number;
  timestamp: number;
  challenged: boolean;
  disputed: boolean;
  challenger?: number;
}

export interface MechanismState {
  now: number;
  nextCompletionId: number;
  agents: Map<number, AgentState>;
  completions: CompletionState[];
}

export interface Mechanism {
  readonly name: string;
  readonly description: string;
  readonly params: MechanismParams;
  newState(now?: number): MechanismState;
  ensureAgent(state: MechanismState, id: number): AgentState;
  attest(state: MechanismState, agent: number, now: number): void;
  rate(state: MechanismState, from: number, to: number, now: number): void;
  challenge(
    state: MechanismState,
    completionId: number,
    challenger: number,
    now: number,
  ): void;
  resolve(state: MechanismState, completionId: number, upheld: boolean): void;
  /** Post-harvest slash: the bonded capability is confiscated. */
  slashCapability(state: MechanismState, agent: number): void;
  score(state: MechanismState, agent: number, now: number): number;
  /** Lamports a counterparty can recover by slashing this agent's bonds. */
  slashable(state: MechanismState, agent: number): number;
  /** Modeled cost of one self-attestation (fees + rent). */
  attestCost(): number;
  /**
   * Optional: capital that must be locked before the score can exceed a cap
   * (stake-gated mechanisms). Scenarios lock this on both attacker and honest
   * agents so the comparison stays like-for-like.
   */
  capitalRequiredForScore?(targetScore: number): number;
  lockCapital?(state: MechanismState, agent: number, lamports: number): void;
  /** True when the mechanism records peer ratings that detection can inspect. */
  usesPeerRatings?: boolean;
  /** True when score only counts completions a counterparty has confirmed. */
  requiresReceipts?: boolean;
  /** Modeled cost of one counterparty confirmation (0 when not applicable). */
  receiptCost?(): number;
  /** Distinct counterparties a rational attacker must recruit for a target score. */
  counterpartiesRequiredForScore?(targetScore: number): number;
}

function newAgent(id: number): AgentState {
  return {
    id,
    completions: 0,
    disputes: 0,
    lastActivity: 0,
    raters: new Set(),
    confirmedCompletions: 0,
    spentLamports: 0,
    lockedLamports: 0,
    slashedLamports: 0,
  };
}

function baseState(now: number): MechanismState {
  return { now, nextCompletionId: 1, agents: new Map(), completions: [] };
}

function ensure(state: MechanismState, id: number): AgentState {
  let agent = state.agents.get(id);
  if (!agent) {
    agent = newAgent(id);
    state.agents.set(id, agent);
  }
  return agent;
}

function submitCompletion(
  state: MechanismState,
  agent: AgentState,
  now: number,
): number {
  const id = state.nextCompletionId;
  state.nextCompletionId += 1;
  agent.completions += 1;
  agent.lastActivity = now;
  state.completions.push({
    id,
    agent: agent.id,
    timestamp: now,
    challenged: false,
    disputed: false,
  });
  return id;
}

abstract class AbstractMechanism implements Mechanism {
  abstract readonly name: string;
  abstract readonly description: string;
  constructor(readonly params: MechanismParams) {}

  abstract newState(now?: number): MechanismState;
  abstract score(state: MechanismState, agent: number, now: number): number;

  abstract attestCost(): number;

  ensureAgent(state: MechanismState, id: number): AgentState {
    return ensure(state, id);
  }

  attest(state: MechanismState, agent: number, now: number): void {
    const record = ensure(state, agent);
    const firstAttestation = record.completions === 0;
    submitCompletion(state, record, now);
    record.spentLamports +=
      TX_FEE_LAMPORTS + rentExempt(ACCOUNT_BYTES.completion);
    if (firstAttestation) {
      record.spentLamports += rentExempt(ACCOUNT_BYTES.agent);
    }
  }

  rate(state: MechanismState, from: number, to: number): void {
    const rater = ensure(state, from);
    const target = ensure(state, to);
    rater.spentLamports += TX_FEE_LAMPORTS;
    target.raters.add(from);
  }

  challenge(
    state: MechanismState,
    completionId: number,
    challenger: number,
    now: number,
  ): void {
    const completion = state.completions.find((c) => c.id === completionId);
    if (!completion || completion.challenged) return;
    completion.challenged = true;
    completion.challenger = challenger;
    const record = ensure(state, challenger);
    record.spentLamports += TX_FEE_LAMPORTS + this.params.bondLamports;
    record.lockedLamports += this.params.bondLamports;
    void now;
  }

  resolve(
    state: MechanismState,
    completionId: number,
    upheld: boolean,
  ): void {
    const completion = state.completions.find((c) => c.id === completionId);
    if (!completion || completion.challenger === undefined) return;
    const challenger = ensure(state, completion.challenger);
    if (upheld) {
      completion.disputed = true;
      ensure(state, completion.agent).disputes += 1;
      challenger.lockedLamports = Math.max(
        0,
        challenger.lockedLamports - this.params.bondLamports,
      );
      challenger.spentLamports -= this.params.bondLamports;
    } else {
      challenger.lockedLamports = Math.max(
        0,
        challenger.lockedLamports - this.params.bondLamports,
      );
      challenger.slashedLamports += this.params.bondLamports;
    }
  }

  slashCapability(state: MechanismState, agent: number): void {
    const record = ensure(state, agent);
    const slashed = Math.min(this.slashable(state, agent), record.lockedLamports);
    record.lockedLamports -= slashed;
    record.slashedLamports += slashed;
    record.spentLamports += slashed;
  }

  slashable(state: MechanismState, agent: number): number {
    void state;
    void agent;
    return this.params.capabilityBondLamports;
  }
}

/** The on-chain taop_reputation mechanism, mirrored exactly (bonds + decay). */
export class TaopBondedDecayMechanism extends AbstractMechanism {
  readonly name = "taop_bonded_decay";
  readonly description =
    "taop_reputation v0.1: self-attested completions, native-SOL challenge bonds, " +
    "admin-resolved disputes, score = max(0, completions - disputes) with inactivity decay.";

  newState(now = 0): MechanismState {
    return baseState(now);
  }

  attestCost(): number {
    return TX_FEE_LAMPORTS + rentExempt(ACCOUNT_BYTES.completion);
  }

  score(state: MechanismState, agent: number, now: number): number {
    const record = ensure(state, agent);
    return computeScore({
      completions: record.completions,
      disputes: record.disputes,
      lastActivity: record.lastActivity,
      now,
      decayPeriodSecs: this.params.decayPeriodSecs,
    }).score;
  }
}

/** Baseline: count completions, ignore disputes and decay. */
export class NaiveCountMechanism extends AbstractMechanism {
  readonly name = "naive_count";
  readonly description =
    "Baseline: score = completions, no bonds, no disputes, no decay.";

  newState(now = 0): MechanismState {
    return baseState(now);
  }

  attestCost(): number {
    return TX_FEE_LAMPORTS + rentExempt(ACCOUNT_BYTES.completion);
  }

  score(state: MechanismState, agent: number): number {
    return ensure(state, agent).completions;
  }
}

/** Baseline: disputes subtract, but there is no decay. */
export class NoDecayMechanism extends AbstractMechanism {
  readonly name = "completions_minus_disputes";
  readonly description =
    "Baseline: score = max(0, completions - disputes), no inactivity decay.";

  newState(now = 0): MechanismState {
    return baseState(now);
  }

  attestCost(): number {
    return TX_FEE_LAMPORTS + rentExempt(ACCOUNT_BYTES.completion);
  }

  score(state: MechanismState, agent: number): number {
    const record = ensure(state, agent);
    return Math.max(0, record.completions - record.disputes);
  }
}

/** Baseline: ERC-8004-style peer feedback among agents. */
export class PeerRatingsMechanism extends AbstractMechanism {
  readonly name = "peer_ratings";
  readonly usesPeerRatings = true;
  readonly description =
    "Baseline: score = distinct agents that rated you minus disputes (ERC-8004-style feedback).";

  newState(now = 0): MechanismState {
    return baseState(now);
  }

  attestCost(): number {
    return TX_FEE_LAMPORTS + rentExempt(ACCOUNT_BYTES.completion);
  }

  score(state: MechanismState, agent: number): number {
    const record = ensure(state, agent);
    return Math.max(0, record.raters.size - record.disputes);
  }
}

/** Baseline: reputation requires locked capital (1 point per 0.01 SOL staked). */
export class StakeGatedMechanism extends AbstractMechanism {
  readonly name = "stake_gated";
  readonly description =
    "Baseline: score = min(completions - disputes, floor(stake / 0.01 SOL)), stake is fully slashable.";

  newState(now = 0): MechanismState {
    return baseState(now);
  }

  attestCost(): number {
    return TX_FEE_LAMPORTS + rentExempt(ACCOUNT_BYTES.completion);
  }

  score(state: MechanismState, agent: number): number {
    const record = ensure(state, agent);
    const stakeCap = Math.floor(record.lockedLamports / (0.01 * LAMPORTS_PER_SOL));
    return Math.max(0, Math.min(record.completions - record.disputes, stakeCap));
  }

  slashable(state: MechanismState, agent: number): number {
    return ensure(state, agent).lockedLamports;
  }

  capitalRequiredForScore(targetScore: number): number {
    return targetScore * 0.01 * LAMPORTS_PER_SOL;
  }

  lockCapital(state: MechanismState, agent: number, lamports: number): void {
    const record = ensure(state, agent);
    record.lockedLamports += lamports;
    record.spentLamports += TX_FEE_LAMPORTS;
  }

  /** Stake-gated agents must lock capital before scoring: modeled as a bond. */
  lockStake(state: MechanismState, agent: number, lamports: number): void {
    this.lockCapital(state, agent, lamports);
  }
}

export function defaultParams(): MechanismParams {
  return {
    bondLamports: 0.005 * LAMPORTS_PER_SOL,
    decayPeriodSecs: 30 * 24 * 60 * 60,
    capabilityBondLamports: 0.005 * LAMPORTS_PER_SOL,
  };
}

/** Completions a single distinct counterparty can vouch for (diversity cap). */
export const RECEIPT_DIVERSITY_WEIGHT = 5;

/**
 * Baseline modeled on the Base TAOP design: two-sided receipts where a
 * completion only counts once a counterparty confirms it, and the score is
 * capped at 5 × the number of distinct confirmers ("diversity-adjusted").
 *
 * The exact on-chain formula is approximated; a confirmation costs one extra
 * transaction, matching this benchmark's Solana cost model. Receipts carry no
 * bond of their own, so the capability bond remains the only slashable capital.
 */
export class TwoSidedReceiptsMechanism extends AbstractMechanism {
  readonly name = "two_sided_receipts";
  readonly usesPeerRatings = true;
  readonly requiresReceipts = true;
  readonly description =
    "Baseline: counterparty-confirmed completions with a diversity cap " +
    "(Base-style two-sided receipts): score = max(0, min(confirmed completions, " +
    "5 × distinct confirmers) - disputes), same halving decay.";

  newState(now = 0): MechanismState {
    return baseState(now);
  }

  attestCost(): number {
    return TX_FEE_LAMPORTS + rentExempt(ACCOUNT_BYTES.completion);
  }

  receiptCost(): number {
    return TX_FEE_LAMPORTS;
  }

  counterpartiesRequiredForScore(targetScore: number): number {
    return Math.max(1, Math.ceil(targetScore / RECEIPT_DIVERSITY_WEIGHT));
  }

  /** A confirmation only attaches to a completion that is still unconfirmed. */
  rate(state: MechanismState, from: number, to: number, now?: number): void {
    void now;
    if (from === to) return;
    const rater = ensure(state, from);
    const target = ensure(state, to);
    rater.spentLamports += TX_FEE_LAMPORTS;
    const pending = target.completions - target.confirmedCompletions;
    if (pending > 0) {
      target.confirmedCompletions += 1;
      target.raters.add(from);
    }
  }

  score(state: MechanismState, agent: number, now: number): number {
    const record = ensure(state, agent);
    const diversityCap = record.raters.size * RECEIPT_DIVERSITY_WEIGHT;
    const confirmed = Math.min(record.confirmedCompletions, diversityCap);
    return computeScore({
      completions: confirmed,
      disputes: record.disputes,
      lastActivity: record.lastActivity,
      now,
      decayPeriodSecs: this.params.decayPeriodSecs,
    }).score;
  }
}

export function allMechanisms(params = defaultParams()): Mechanism[] {
  return [
    new TaopBondedDecayMechanism(params),
    new NaiveCountMechanism(params),
    new NoDecayMechanism(params),
    new PeerRatingsMechanism(params),
    new StakeGatedMechanism(params),
    new TwoSidedReceiptsMechanism(params),
  ];
}
