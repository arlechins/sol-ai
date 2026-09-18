import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/taop", () => ({
  RPC_URL: "https://api.devnet.solana.com",
  PROGRAM_ID: "8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE",
  DEMO_AGENT: "bxFpYgz8F4rbwLWTGbjuPtY4tmUZVQwMLSLSkG9TFq2",
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
      address: "bxFpYgz8F4rbwLWTGbjuPtY4tmUZVQwMLSLSkG9TFq2",
      completions: 12,
      disputes: 2,
      score: 10,
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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("routes and variants", () => {
  it("renders the minimal landing by default", () => {
    renderAt("/");
    expect(
      screen.getByRole("heading", { level: 1, name: /trust between agents/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/no token/i).length).toBeGreaterThan(0);
  });

  it("renders the demo with read-only devnet data", async () => {
    renderAt("/demo");
    expect(
      screen.getByRole("heading", { level: 1, name: /read the program/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText("0.005 SOL")).toBeInTheDocument();
    const meter = await screen.findByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "10");
  });

  it("serves the luxury variant from a shareable path", () => {
    renderAt("/v/luxury");
    expect(
      screen.getByRole("heading", { level: 1, name: /reputation, held to account/i }),
    ).toBeInTheDocument();
    expect(document.documentElement.dataset.variant).toBe("luxury");
  });

  it("shows the not-found page for unknown routes", () => {
    renderAt("/nope");
    expect(
      screen.getByRole("heading", { level: 1, name: /that record does not exist/i }),
    ).toBeInTheDocument();
  });
});
