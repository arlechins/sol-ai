import { describe, expect, it } from "vitest";

import {
  RECEIPT_DIVERSITY_WEIGHT,
  TwoSidedReceiptsMechanism,
  defaultParams,
} from "../src/mechanisms";

describe("two-sided receipts mechanism", () => {
  it("only counts completions a counterparty has confirmed", () => {
    const mechanism = new TwoSidedReceiptsMechanism(defaultParams());
    const state = mechanism.newState();
    mechanism.attest(state, 1, 100);
    mechanism.attest(state, 1, 100);
    mechanism.attest(state, 1, 100);
    expect(mechanism.score(state, 1, 100)).toBe(0);

    mechanism.rate(state, 2, 1, 100);
    mechanism.rate(state, 3, 1, 100);
    expect(mechanism.score(state, 1, 100)).toBe(2);
  });

  it("caps the score by confirmer diversity", () => {
    const mechanism = new TwoSidedReceiptsMechanism(defaultParams());
    const state = mechanism.newState();
    for (let i = 0; i < 10; i += 1) mechanism.attest(state, 1, 100);
    for (let i = 0; i < 5; i += 1) mechanism.rate(state, 2, 1, 100);

    // Five completions confirmed by one counterparty: the cap binds at 5.
    expect(mechanism.score(state, 1, 100)).toBe(RECEIPT_DIVERSITY_WEIGHT);
    mechanism.rate(state, 3, 1, 100);
    expect(mechanism.score(state, 1, 100)).toBe(RECEIPT_DIVERSITY_WEIGHT + 1);
  });

  it("ignores confirmations with nothing to confirm and self-confirmations", () => {
    const mechanism = new TwoSidedReceiptsMechanism(defaultParams());
    const state = mechanism.newState();
    mechanism.rate(state, 2, 1, 100);
    expect(mechanism.score(state, 1, 100)).toBe(0);

    mechanism.attest(state, 1, 100);
    mechanism.rate(state, 1, 1, 100);
    expect(mechanism.score(state, 1, 100)).toBe(0);
  });

  it("does not let a second confirmation double-count the same completion", () => {
    const mechanism = new TwoSidedReceiptsMechanism(defaultParams());
    const state = mechanism.newState();
    mechanism.attest(state, 1, 100);
    mechanism.rate(state, 2, 1, 100);
    mechanism.rate(state, 3, 1, 100);
    expect(mechanism.ensureAgent(state, 1).confirmedCompletions).toBe(1);
  });

  it("charges confirmers the transaction fee and reports counterparty needs", () => {
    const mechanism = new TwoSidedReceiptsMechanism(defaultParams());
    const state = mechanism.newState();
    const before = mechanism.ensureAgent(state, 2).spentLamports;
    mechanism.rate(state, 2, 1, 100);
    expect(mechanism.ensureAgent(state, 2).spentLamports).toBeGreaterThan(before);

    expect(mechanism.counterpartiesRequiredForScore(50)).toBe(10);
    expect(mechanism.counterpartiesRequiredForScore(5)).toBe(1);
    expect(mechanism.receiptCost()).toBeGreaterThan(0);
  });
});
