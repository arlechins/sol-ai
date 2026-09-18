import { act, render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/taop", () => ({
  RPC_URL: "https://api.devnet.solana.com",
  PROGRAM_ID: "8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE",
  DEMO_AGENT: "3P3DNmhSMVjymwHzHe8FigS9Q6cR1nFRgNtxozYiyvmh",
  CLUSTER: "devnet",
  readConfig: vi.fn(async () => ({
    data: {
      admin: "bxFpYgz8F4rbwLWTGbjuPtY4tmUZVQwMLSLSkG9TFq2",
      certifier: "bxFpYgz8F4rbwLWTGbjuPtY4tmUZVQwMLSLSkG9TFq2",
      treasury: "bxFpYgz8F4rbwLWTGbjuPtY4tmUZVQwMLSLSkG9TFq2",
      challengeBondLamports: 5_000_000,
      decayPeriodSecs: 2_592_000,
      paused: false,
      nextCompletionId: 3,
      nextCapabilityId: 1,
      programId: "8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE",
      rpcUrl: "https://api.devnet.solana.com",
      cluster: "devnet",
    },
    error: null,
    at: Date.now(),
    stale: false,
  })),
  readScore: vi.fn(async () => ({
    data: {
      address: "3P3DNmhSMVjymwHzHe8FigS9Q6cR1nFRgNtxozYiyvmh",
      completions: 2,
      disputes: 2,
      score: 0,
      lastActivity: Math.floor(Date.now() / 1000) - 86_400,
      decayed: false,
    },
    error: null,
    at: Date.now(),
    stale: false,
  })),
  readDiscovery: vi.fn(async () => ({
    data: [],
    error: null,
    at: Date.now(),
    stale: false,
  })),
  resetClientForTests: vi.fn(),
}));

import App from "../src/App";

expect.extend(toHaveNoViolations);

async function assertNoViolations(path: string) {
  const { container } = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  // Let the mocked RPC reads settle so their state updates happen inside the
  // test instead of warning about missing act() wrappers.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const results = await axe(container, {
    rules: {
      // jsdom has no layout or paint, so contrast cannot be computed here.
      // Token contrast is covered by test/contrast.test.ts instead.
      "color-contrast": { enabled: false },
    },
  });
  expect(results).toHaveNoViolations();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("accessibility (axe)", () => {
  it("minimal landing has no detectable violations", async () => {
    await assertNoViolations("/");
  });

  it("minimal demo has no detectable violations", async () => {
    await assertNoViolations("/demo");
  });

  it("luxury landing has no detectable violations", async () => {
    await assertNoViolations("/v/luxury");
  });

  it("creative demo has no detectable violations", async () => {
    await assertNoViolations("/v/creative/demo");
  });

  it("not-found page has no detectable violations", async () => {
    await assertNoViolations("/does-not-exist");
  });
});
