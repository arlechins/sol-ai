import { describe, expect, it } from "vitest";

import {
  MAX_URI_LEN,
  optionalDecimalString,
  optionalNumber,
  requireBoolean,
  requireString,
  requireUri,
  resolveChain,
} from "../src/validation";

describe("resolveChain", () => {
  it("defaults to solana and accepts base", () => {
    expect(resolveChain(undefined)).toBe("solana");
    expect(resolveChain("SOLANA")).toBe("solana");
    expect(resolveChain(" Base ")).toBe("base");
  });

  it("rejects unknown chains instead of falling back", () => {
    expect(() => resolveChain("base-sepolia")).toThrow(/Unknown TAOP_CHAIN/);
    expect(() => resolveChain("")).toThrow(/Unknown TAOP_CHAIN/);
  });
});

describe("requireBoolean", () => {
  it("accepts booleans and exact strings", () => {
    expect(requireBoolean({ upheld: true }, "upheld", "t")).toBe(true);
    expect(requireBoolean({ upheld: false }, "upheld", "t")).toBe(false);
    expect(requireBoolean({ upheld: "true" }, "upheld", "t")).toBe(true);
    expect(requireBoolean({ upheld: "false" }, "upheld", "t")).toBe(false);
  });

  it("never truthy-coerces string garbage", () => {
    expect(() => requireBoolean({ upheld: "maybe" }, "upheld", "t")).toThrow(
      /must be a boolean/,
    );
    expect(() => requireBoolean({ upheld: 1 }, "upheld", "t")).toThrow(
      /must be a boolean/,
    );
    expect(() => requireBoolean({}, "upheld", "t")).toThrow(
      /must be a boolean/,
    );
  });
});

describe("string and number validation", () => {
  it("requires non-empty strings", () => {
    expect(requireString({ agent: "abc" }, "agent", "t")).toBe("abc");
    expect(() => requireString({ agent: "  " }, "agent", "t")).toThrow(
      /non-empty string/,
    );
    expect(() => requireString({}, "agent", "t")).toThrow(/non-empty string/);
  });

  it("enforces the program's URI length limit", () => {
    const ok = "ipfs://" + "a".repeat(MAX_URI_LEN - 7);
    expect(requireUri({ uri: ok }, "uri", "t")).toBe(ok);
    expect(() =>
      requireUri({ uri: "a".repeat(MAX_URI_LEN + 1) }, "uri", "t"),
    ).toThrow(/at most 200 bytes/);
  });

  it("rejects negative or non-finite numbers", () => {
    expect(optionalNumber({}, "minScore", "t", 0)).toBe(0);
    expect(optionalNumber({ minScore: "2" }, "minScore", "t")).toBe(2);
    expect(() => optionalNumber({ minScore: "abc" }, "minScore", "t")).toThrow(
      /non-negative number/,
    );
    expect(() => optionalNumber({ minScore: -1 }, "minScore", "t")).toThrow(
      /non-negative number/,
    );
  });

  it("accepts only decimal bond strings", () => {
    expect(optionalDecimalString({}, "bond", "t")).toBe("");
    expect(optionalDecimalString({ bond: "0.005" }, "bond", "t")).toBe("0.005");
    expect(optionalDecimalString({ bond: 1 }, "bond", "t")).toBe("1");
    expect(() => optionalDecimalString({ bond: "1e18" }, "bond", "t")).toThrow(
      /decimal amount/,
    );
    expect(() =>
      optionalDecimalString({ bond: "0.005 SOL" }, "bond", "t"),
    ).toThrow(/decimal amount/);
  });
});
